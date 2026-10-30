import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sql from 'mssql';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {registerAccountWorkspaceRoutes,profileImage} from './account-workspace.js';
import {defaultPreferences,validatePreferences} from '../shared/account-preferences.js';
import {leaveWindow,assertHandover,indiaDay} from './continuity-policy.js';

const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('all roles can position drive announcements and existing layouts gain them below the blue panel',()=>{
 const legacy=['metrics','hero','operations','shortcuts','insights'];
 assert.deepEqual(defaultPreferences().dashboardOrder.slice(0,2),['hero','drives']);
 for(const role of ['surveyor','cuc','ccuc','legal','master']){
  const migrated=validatePreferences({...defaultPreferences(),dashboardOrder:legacy,hiddenWidgets:['insights'],theme:'dark'},role);
  assert.deepEqual(migrated.dashboardOrder,['metrics','hero','drives','operations','shortcuts','insights']);
  assert.equal(migrated.theme,'dark');assert.deepEqual(migrated.hiddenWidgets,['insights']);
  const custom=validatePreferences({...migrated,dashboardOrder:['drives',...legacy],hiddenWidgets:['drives']},role);
  assert.equal(custom.dashboardOrder[0],'drives');assert.deepEqual(custom.hiddenWidgets,['drives']);
  assert.deepEqual(validatePreferences(custom,role),custom);
 }
});
test('personal choices cannot grant pages or change identity; leave uses elapsed Indian calendar days',()=>{
 assert.throws(()=>validatePreferences({...defaultPreferences(),role:'master'},'cuc'),/cannot change role/);
 assert.throws(()=>validatePreferences({...defaultPreferences(),designation:'Chief'},'cuc'),/cannot change designation/);
 assert.throws(()=>validatePreferences({...defaultPreferences(),homePage:'settings'},'cuc'),/designation/);
 assert.throws(()=>validatePreferences({...defaultPreferences(),navOrder:['staff']},'cuc'),/navOrder/);
 assert.throws(()=>validatePreferences({...defaultPreferences(),hiddenNav:['dashboard']},'master'),/hiddenNav/);
 assert.throws(()=>validatePreferences({...defaultPreferences(),dashboardOrder:['hero','hero']},'master'),/dashboardOrder/);
 const now=new Date('2026-10-21T01:00:00Z');assert.equal(leaveWindow('2026-10-07','2026-10-30',now).eligible,false);assert.equal(leaveWindow('2026-10-06','2026-10-30',now).eligible,true);
 assert.equal(leaveWindow('2026-10-22','2026-11-30',now).elapsedDays,0);assert.equal(leaveWindow('2026-10-01','2026-10-20',now).eligible,false);
 assert.equal(leaveWindow('2026-10-07','2026-10-30',new Date('2026-10-21T18:30:00Z')).eligible,true);
 assert.throws(()=>leaveWindow('2026-02-30','2026-03-30',now),/valid calendar/);
 const source={UserId:uid(1),RoleCode:'cuc',IsActive:true},target={UserId:uid(2),RoleCode:'cuc',IsActive:true};
 assert.throws(()=>assertHandover({...source},source,target,{kind:'transfer'}),/Administrator/);
 assert.throws(()=>assertHandover({UserId:uid(9),RoleCode:'ccuc'},source,target,{kind:'transfer'}),/Administrator/);
 assert.throws(()=>assertHandover({UserId:uid(9),RoleCode:'master'},source,{...target,RoleCode:'surveyor'},{kind:'transfer'}),/same designation/);
});
test('profile photos are validated, re-encoded and cropped to a 256px square',async()=>{
 const canvas=createCanvas(900,500),ctx=canvas.getContext('2d');ctx.fillStyle='#025299';ctx.fillRect(0,0,900,500);
 const result=await profileImage('data:image/png;base64,'+canvas.toBuffer('image/png').toString('base64'));assert(result.startsWith('data:image/jpeg;base64,'));const image=await loadImage(Buffer.from(result.split(',')[1],'base64'));assert.equal(image.width,256);assert.equal(image.height,256);
 await assert.rejects(profileImage('data:image/svg+xml;base64,PHN2Zz4='));await assert.rejects(profileImage('data:image/png;base64,'+Buffer.from('not an image').toString('base64')));assert.equal(await profileImage(null),null);
});
test('account isolation and complete leave/transfer/return HTTP flows are atomic in memory',async()=>{
 const originals={Request:sql.Request,Transaction:sql.Transaction};let settings={},records={},cases={},users={},events=[],counter=1,failFinalAudit=false,changes=0;
 for(const [n,role] of [[1,'cuc'],[2,'cuc'],[3,'cuc'],[4,'surveyor'],[5,'ccuc'],[9,'master']])users[uid(n)]={UserId:uid(n),RoleCode:role,DisplayName:'Officer '+n,IsActive:true,IsDeleted:false};
 const makeCase=(n,extra={})=>({CaseId:uid(100+n),AssignedCucId:uid(1),AssignedSurveyorId:uid(4),ResponsibleUserId:uid(1),Status:'In progress',IsArchived:false,...extra});
 cases[uid(101)]=makeCase(1);cases[uid(102)]=makeCase(2,{Status:'Closed'});cases[uid(103)]=makeCase(3,{IsArchived:true});cases[uid(104)]=makeCase(4);
 const bump=()=>{const bytes=Buffer.alloc(8);bytes.writeUInt32BE(counter++,4);return bytes;};
 const shape=row=>({...row,SourceName:users[row.CreatedByUserId].DisplayName,SourceRole:users[row.CreatedByUserId].RoleCode});
 class Transaction{async begin(){this.before=structuredClone({settings,records,cases,users,events,counter});}async commit(){}async rollback(){({settings,records,cases,users,events,counter}=this.before);}}
 class Request{
  constructor(){this.args={};}input(key,_type,value){this.args[key]=value;return this;}
  async query(q){const a=this.args;
   if(q.startsWith('SELECT Value FROM enforcement.Settings'))return {recordset:settings[a.key]?[{Value:settings[a.key]}]:[]};
   if(q.startsWith('UPDATE enforcement.Settings')){settings[a.key]=a.value;return {recordset:[]};}
   if(q.startsWith('INSERT enforcement.AuditLog')){if(failFinalAudit&&a.event==='StaffTransferCompleted')throw Error('Injected final audit failure');events.push({event:a.event,detail:JSON.parse(a.detail),id:a.id});return {recordset:[]};}
   if(q.startsWith('SELECT r.*,u.DisplayName')){
    if(q.includes('r.RecordId=@id'))return {recordset:records[a.id]?[shape(records[a.id])]:[]};
    return {recordset:Object.values(records).filter(r=>r.CreatedByUserId===a.actor||a.role==='master'||a.role==='ccuc'&&['cuc','surveyor'].includes(users[r.CreatedByUserId].RoleCode)).map(shape)};
   }
   if(q.startsWith('SELECT UserId AS id'))return {recordset:Object.values(users).filter(u=>u.IsActive&&!u.IsDeleted).map(u=>({id:u.UserId,name:u.DisplayName,role:u.RoleCode}))};
   if(q.startsWith('SELECT UserId FROM enforcement.Users')||q.startsWith('SELECT * FROM enforcement.Users')||q.startsWith('SELECT UserId,RoleCode'))return {recordset:users[a.id]?[users[a.id]]:[]};
   if(q.startsWith('SELECT RecordId FROM enforcement.OperationalRecords')||q.startsWith('SELECT Details FROM enforcement.OperationalRecords'))return {recordset:Object.values(records).filter(r=>r.CreatedByUserId===a.id&&['Recorded','Assigned','Return requested'].includes(r.Status))};
   if(q.startsWith('INSERT enforcement.OperationalRecords')){records[a.id]={RecordId:a.id,CreatedByUserId:a.actor,Details:a.details,Status:'Recorded',RowVersion:bump(),CreatedAt:new Date()};return {recordset:[]};}
   if(q.startsWith('UPDATE enforcement.OperationalRecords')){Object.assign(records[a.id],{Details:a.details,Status:a.status,RowVersion:bump()});return {recordset:[]};}
   if(q.startsWith('SELECT CaseId,AssignedCucId')){
    if(q.includes('WHERE CaseId=@id'))return {recordset:cases[a.id]?[{...cases[a.id]}]:[]};
    return {recordset:Object.values(cases).filter(c=>['AssignedCucId','AssignedSurveyorId','ResponsibleUserId'].some(f=>c[f]===a.source)&&(a.permanent||!c.IsArchived&&c.Status!=='Closed')).map(c=>({...c}))};
   }
   if(q.startsWith('UPDATE enforcement.Cases SET')){const fields=q.match(/SET (.+) WHERE/)[1].split(',').map(x=>x.split('=')[0]);for(const field of fields){assert(['AssignedCucId','AssignedSurveyorId','ResponsibleUserId'].includes(field));cases[a.id][field]=a.target??a.source;}return {recordset:[]};}
   if(q.startsWith('UPDATE enforcement.Users SET IsActive=0')){users[a.id].IsActive=false;return {recordset:[]};}
   throw Error('Unexpected test SQL: '+q);
  }
 }
 sql.Request=Request;sql.Transaction=Transaction;const app=express();app.use(express.json({limit:'4mb'}));app.use((req,res,next)=>{const user=users[req.headers['x-test-user']||uid(1)];if(!user?.IsActive)return res.status(401).json({error:'Inactive account'});req.user=user;next();});registerAccountWorkspaceRoutes(app,{getPool:async()=>({request:()=>new Request()}),publishChange:()=>{changes++;}});app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,{user=1,method='GET',body,status=200}={})=>{const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','x-test-user':uid(user)},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
 const post=(path,body,user=1,status=200)=>call(path,{body,user,status,method:'POST'});
 const shift=days=>{const date=new Date(indiaDay()+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
 try{
  let first=await call('/me/workspace');assert.equal(first.revision,'initial');assert.equal(first.avatar,null);
  await call('/me/workspace',{method:'PUT',body:{preferences:{...first.preferences,role:'master'},revision:first.revision},status:400});
  await call('/me/workspace',{method:'PUT',body:{preferences:{...first.preferences,navOrder:['staff']},revision:first.revision},status:400});
  const saved=await call('/me/workspace',{method:'PUT',body:{preferences:{...first.preferences,sidebarSide:'right',hiddenWidgets:['hero'],dashboardTitle:'My queue'},revision:first.revision}});assert.equal(saved.preferences.sidebarSide,'right');assert.equal((await call('/me/workspace',{user:2})).preferences.sidebarSide,'left');
  await call('/me/workspace',{method:'PUT',body:{preferences:first.preferences,revision:first.revision},status:409});await call('/me/workspace',{method:'PUT',body:{userId:uid(2),preferences:first.preferences,revision:saved.revision},status:400});assert.equal(users[uid(1)].RoleCode,'cuc');
  assert.equal((await call('/me/workspace?userId='+uid(2))).preferences.dashboardTitle,'My queue');
  const canvas=createCanvas(10,10);const avatar=await call('/me/avatar',{method:'PUT',body:{image:'data:image/png;base64,'+canvas.toBuffer('image/png').toString('base64'),revision:saved.revision}});assert(avatar.avatar.startsWith('data:image/jpeg;base64,'));assert.equal((await call('/me/workspace',{user:2})).avatar,null);
  await post('/me/continuity',{kind:'leave',start:shift(-14),end:shift(5),reason:'Approved leave reference TEST'},1,201);let own=(await call('/me/continuity')).records[0];assert.equal(own.elapsedDays,15);assert.equal(own.eligible,false);assert.equal((await call('/me/continuity',{user:2})).records.length,0);assert.equal((await call('/me/continuity',{user:9})).records.length,1);
  await post('/me/continuity',{kind:'transfer',reason:'Duplicate test request'},1,409);
  await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(2),reason:'Supervisor review'},9,409);assert.equal(cases[uid(101)].AssignedCucId,uid(1));
  const details=JSON.parse(records[own.id].Details);details.start=shift(-15);records[own.id].Details=JSON.stringify(details);own=(await call('/me/continuity')).records[0];assert(own.eligible);
  await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(2),reason:'Cannot self approve'},1,403);
  await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(4),reason:'Wrong designation'},9,400);
  await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(2),reason:'Verified day-16 leave; temporary cover'},9);
  own=(await call('/me/continuity')).records[0];assert.equal(own.status,'Assigned');assert.equal(own.eligible,false);assert.equal(own.affectedCases,2);assert.equal(cases[uid(101)].AssignedCucId,uid(2));assert.equal(cases[uid(102)].AssignedCucId,uid(1));assert.equal(cases[uid(103)].AssignedCucId,uid(1));assert(users[uid(1)].IsActive);
  cases[uid(104)].AssignedCucId=uid(3);cases[uid(104)].ResponsibleUserId=uid(3);
  await post('/me/continuity/'+own.id+'/return',{version:own.version,reason:'Attempt another account return'},2,403);await post('/me/continuity/'+own.id+'/return',{version:own.version,reason:'Returned to duty'});own=(await call('/me/continuity')).records[0];assert.equal(own.status,'Return requested');
  await post('/continuity/'+own.id+'/restore',{version:own.version,reason:'Return verified'},5);own=(await call('/me/continuity')).records[0];assert.equal(own.status,'Returned');assert.equal(own.restoredCases,1);assert.equal(cases[uid(101)].AssignedCucId,uid(1));assert.equal(cases[uid(104)].AssignedCucId,uid(3));
  await post('/me/continuity',{kind:'transfer',reason:'Approved departmental transfer TEST'},1,201);own=(await call('/me/continuity')).records.find(r=>r.status==='Recorded');
  await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(2),reason:'CCUC cannot approve permanent'},5,403);
  failFinalAudit=true;await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(2),reason:'Injected failure should roll back'},9,500);assert(users[uid(1)].IsActive);assert.equal(cases[uid(101)].AssignedCucId,uid(1));assert.equal(records[own.id].Status,'Recorded');
  failFinalAudit=false;await post('/continuity/'+own.id+'/assign',{version:own.version,replacementId:uid(2),reason:'Administrator verified permanent handover'},9);assert.equal(users[uid(1)].IsActive,false);for(const id of [101,102,103])assert.equal(cases[uid(id)].AssignedCucId,uid(2));assert.equal(cases[uid(104)].AssignedCucId,uid(3));assert.equal(users[uid(2)].RoleCode,'cuc');assert(events.some(e=>e.event==='StaffTransferCompleted'));assert(changes>=5);await call('/me/workspace',{status:401});
 }finally{await new Promise(r=>server.close(r));sql.Request=originals.Request;sql.Transaction=originals.Transaction;}
});
