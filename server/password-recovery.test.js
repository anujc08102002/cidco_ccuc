import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import sql from 'mssql';
import {hashPassword,verifyPassword} from './passwords.js';
import {registerRecoveryPublicRoutes,registerRecoveryRoutes,normalizeEmail} from './password-recovery.js';
import {registerWorkflowRoutes} from './enforcement-workflow.js';
import {passwordMail,passwordMailLinks} from '../shared/password-mail.js';

test('password mail drafts preserve special characters and email validation rejects malformed inputs',()=>{
 for(const value of [null,42,{},'bad','a@b\r\nBcc:x@y.com'])assert.equal(normalizeEmail(value),null);
 assert.equal(normalizeEmail('  Amit@Example.org '),'amit@example.org');
 const password='Temp & + # ? / = ! 123';
 const mail=passwordMail({name:'Fictional officer',username:'test.officer'},password,'https://example.org');
 const links=passwordMailLinks('officer@example.org',mail);
 assert.equal(new URL(links.gmail).searchParams.get('body'),mail.text);
 assert.equal(new URL(links.outlook).searchParams.get('body'),mail.text);
 assert(mail.text.includes(password));assert(links.mailto.startsWith('mailto:officer%40example.org?'));
});

test('recovery verifies both fields, routes alerts only to recipients, and resets atomically without real mail',async()=>{
 const oldRequest=sql.Request,oldTransaction=sql.Transaction;
 const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const make=(n,role)=>({UserId:uid(n),Username:'test'+n,DisplayName:'Fictional staff '+n,Email:'staff'+n+'@example.org',RoleCode:role,IsActive:true,IsDeleted:false,MustChangePassword:false,PasswordHash:hashPassword('Original-password-123')});
 let users={[uid(1)]:make(1,'cuc'),[uid(2)]:make(2,'cuc'),[uid(9)]:make(9,'master')},records=[],audits=[],clock=Date.now(),failAudit=false,mailCalls=[];
 const sentPassword='Temporary-new-123!';
 sql.Transaction=class{async begin(){this.snapshot=structuredClone({users,records,audits});}async commit(){}async rollback(){({users,records,audits}=this.snapshot);}};
 class Request{
  constructor(){this.args={};}input(k,_type,value){this.args[k]=value;return this;}
  async query(raw){const q=raw.replace(/\s+/g,' ').trim(),a=this.args;
   if(q.startsWith('SELECT * FROM enforcement.Users'))return {recordset:Object.values(users).filter(u=>(a.username?u.Username===a.username:u.UserId===a.id)&&(!q.includes('IsActive=1')||u.IsActive&&!u.IsDeleted))};
   if(q.startsWith('SELECT TOP(1) RecordId'))return {recordset:records.filter(r=>r.Category==='PasswordRecovery'&&r.Status===a.status&&JSON.parse(r.Details).username===a.username)};
   if(q.startsWith('INSERT enforcement.OperationalRecords')){records.push({RecordId:crypto.randomUUID(),Category:q.includes("VALUES('PasswordReset'")?'PasswordReset':'PasswordRecovery',Status:q.includes("VALUES('PasswordReset'")?'Unread':a.status,Title:a.title??'Your password was reset',Details:a.details??'Reset notification',CreatedByUserId:a.owner??a.id??null,CreatedAt:new Date()});return {recordset:[]};}
   if(q.startsWith('INSERT enforcement.AuditLog')){if(failAudit)throw Error('Injected audit failure');audits.push({...a});return {recordset:[]};}
   if(q.startsWith('SELECT r.RecordId'))return {recordset:records.filter(r=>a.admin&&r.Category==='PasswordRecovery'&&['Pending','Mismatch'].includes(r.Status)||r.Category==='PasswordReset'&&r.CreatedByUserId===a.actor&&r.Status==='Unread').map(r=>({...r,...(users[r.CreatedByUserId]?{DisplayName:users[r.CreatedByUserId].DisplayName,Username:users[r.CreatedByUserId].Username,Email:users[r.CreatedByUserId].Email}:{})}))};
   if(q.startsWith('SELECT c.CaseNumber')){assert(q.includes('ResponsibleUserId=@actor')&&q.includes("@role='ccuc' AND c.Status='Awaiting approval'"));return {recordset:a.role==='master'?[{CaseNumber:'case-a'},{CaseNumber:'case-b'}]:[{CaseNumber:a.actor===uid(1)?'case-a':'case-b'}]};}
   if(q.startsWith("UPDATE enforcement.OperationalRecords SET Status='Resolved'")){records.filter(r=>r.Category==='PasswordRecovery'&&r.CreatedByUserId===a.id&&r.Status==='Pending').forEach(r=>r.Status='Resolved');return {recordset:[]};}
   if(q.startsWith("UPDATE enforcement.OperationalRecords SET Status='Read'")){const record=records.find(r=>r.RecordId===a.id&&(r.Category==='PasswordReset'&&r.CreatedByUserId===a.actor&&r.Status==='Unread'||a.admin&&r.Category==='PasswordRecovery'&&r.Status==='Mismatch'));if(record)record.Status='Read';return {recordset:record?[record]:[]};}
   if(q.startsWith('UPDATE enforcement.Users SET DisplayName=')){const u=users[a.id];Object.assign(u,{DisplayName:a.name,Email:a.email,RoleCode:a.role,IsActive:a.active,PasswordHash:a.hash,MustChangePassword:a.change});return {recordset:[{...u}]};}
   if(q.startsWith('INSERT enforcement.Users')){const u={UserId:uid(3),Username:a.username,DisplayName:a.name,Email:a.email,RoleCode:a.role,PasswordHash:a.hash,MustChangePassword:true,IsActive:true};users[u.UserId]=u;return {recordset:[u]};}
   throw Error('Unhandled test SQL: '+q);
  }
 }
 sql.Request=Request;const pool={request:()=>new Request()};
 const app=express();app.use(express.json());registerRecoveryPublicRoutes(app,{getPool:async()=>pool,publishChange(){},now:()=>clock});
 app.use((req,res,next)=>{req.user=users[req.headers['x-user']];if(!req.user)return res.status(401).json({error:'Sign in required'});next();});
 registerRecoveryRoutes(app,{getPool:async()=>pool,publishChange(){},mailTransport:{sendMail:async mail=>{mailCalls.push(mail);return {rejected:[]};}}});
 registerWorkflowRoutes(app,{getPool:async()=>pool,publishChange(){},toUiCase:x=>x});app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(path,{method='GET',body,user=9,status=200}={})=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{'x-user':uid(user)}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=response.status===204?null:await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
 try{
  await call('/auth/forgot-password',{method:'POST',user:null,body:{username:'test1',email:42},status:400});
  await call('/auth/forgot-password',{method:'POST',user:null,body:{username:'test1',email:'wrong@example.org'},status:400});
  const mismatch=records[0];assert.equal(mismatch.Status,'Mismatch');assert.equal((await call('/me/notifications',{user:1})).length,0);assert.equal((await call('/me/notifications')).length,1);
  await call('/auth/forgot-password',{method:'POST',user:null,body:{username:'test1',email:'STAFF1@example.org'},status:202});
  await call('/auth/forgot-password',{method:'POST',user:null,body:{username:'test1',email:'staff1@example.org'},status:202});assert.equal(records.length,2);
  assert((await call('/me/notifications')).some(n=>n.title.includes('Fictional staff 1 (test1)')));
  assert.deepEqual(await call('/me/attention',{user:1}),['case-a']);assert.deepEqual(await call('/me/attention',{user:2}),['case-b']);
  await call('/me/notifications/'+mismatch.RecordId+'/dismiss',{method:'POST',user:1,status:404});
  await call('/me/notifications/'+mismatch.RecordId+'/dismiss',{method:'POST',status:204});
  await call('/users/'+uid(1),{method:'PATCH',user:2,body:{password:sentPassword},status:403});
  const original=users[uid(1)].PasswordHash;failAudit=true;
  await call('/users/'+uid(1),{method:'PATCH',body:{password:sentPassword},status:500});assert.equal(users[uid(1)].PasswordHash,original);assert.equal(records.filter(r=>r.Category==='PasswordReset').length,0);assert(records.some(r=>r.Status==='Pending'));failAudit=false;
  await call('/users/'+uid(1),{method:'PATCH',body:{password:sentPassword}});assert(verifyPassword(users[uid(1)].PasswordHash,sentPassword));assert(users[uid(1)].MustChangePassword);assert(!records.some(r=>r.Status==='Pending'));
  const own=await call('/me/notifications',{user:1});assert.equal(own.length,1);assert.equal(own[0].kind,'account');assert.equal((await call('/me/notifications',{user:2})).length,0);assert.equal((await call('/me/notifications')).length,0);
  await call('/me/notifications/'+own[0].id+'/dismiss',{method:'POST',user:2,status:404});await call('/me/notifications/'+own[0].id+'/dismiss',{method:'POST',user:1,status:204});
  await call('/users/'+uid(1)+'/password-email',{method:'POST',user:2,body:{temporaryPassword:sentPassword},status:403});
  await call('/users/'+uid(1)+'/password-email',{method:'POST',body:{temporaryPassword:'wrong-password-123'},status:409});
  await call('/users/'+uid(1)+'/password-email',{method:'POST',body:{temporaryPassword:sentPassword,to:'intruder@example.org'},status:400});
  await call('/users/'+uid(1)+'/password-email',{method:'POST',body:{temporaryPassword:sentPassword}});assert.equal(mailCalls.length,1);assert.equal(mailCalls[0].to,'staff1@example.org');assert(mailCalls[0].text.includes(sentPassword));
  assert(!JSON.stringify({records,audits}).includes(sentPassword));
  await call('/users/'+uid(2),{method:'PATCH',body:{password:'Direct-reset-password-123'}});assert.equal((await call('/me/notifications',{user:2})).length,1);
  await call('/users',{method:'POST',body:{username:'test3',name:'Test 3',password:sentPassword,role:'surveyor'},status:400});
  await call('/users',{method:'POST',body:{username:'test3',email:' Staff3@Example.org ',name:'Test 3',password:sentPassword,role:'surveyor'},status:201});assert.equal(users[uid(3)].Email,'staff3@example.org');
  await call('/users/'+uid(3),{method:'PATCH',body:{email:'bad'},status:400});await call('/users/'+uid(3),{method:'PATCH',body:{email:'updated@example.org'}});assert.equal(users[uid(3)].Email,'updated@example.org');
  clock+=16*60000;
  for(let i=0;i<8;i++)await call('/auth/forgot-password',{method:'POST',user:null,body:{username:'missing',email:'missing@example.org'},status:400});
  await call('/auth/forgot-password',{method:'POST',user:null,body:{username:'missing',email:'missing@example.org'},status:429});
 }finally{await new Promise(r=>server.close(r));sql.Request=oldRequest;sql.Transaction=oldTransaction;}
});
