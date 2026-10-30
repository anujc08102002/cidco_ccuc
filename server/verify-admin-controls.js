// Integration test: only a uniquely named, self-created temporary case is changed/deleted.
import dotenv from 'dotenv';
import sql from 'mssql';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {issueSession} from './sessions.js';
dotenv.config();
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
const key='TEST/ADMIN/'+randomUUID(),base='http://localhost:3001/api';let master,created=false,checks=0;
const api=async(user,path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+issueSession(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,headers:response.headers,text:await response.text()};};
const json=response=>JSON.parse(response.text);
try {
 const users=(await pool.request().query('SELECT * FROM enforcement.Users WHERE IsActive=1 AND MustChangePassword=0')).recordset;
 master=users.find(user=>user.RoleCode==='master');const cuc=users.find(user=>user.RoleCode==='cuc');assert(master&&cuc);
 const original=(await pool.request().query('SELECT CaseId,CaseNumber,RowVersion FROM enforcement.Cases')).recordset;
 await pool.request().input('key',sql.NVarChar,key).input('master',sql.UniqueIdentifier,master.UserId).input('cuc',sql.UniqueIdentifier,cuc.UserId).query(`
  INSERT enforcement.Cases(CaseNumber,PropertyReference,Sector,Node,OwnerName,CurrentStage,Status,AssignedCucId,ResponsibleUserId,Latitude,Longitude)
  VALUES(@key,'Administrator integration test','Test sector','Test node','Temporary test record',1,'In progress',@cuc,@cuc,19.0,73.0);
  DECLARE @id UNIQUEIDENTIFIER=(SELECT CaseId FROM enforcement.Cases WHERE CaseNumber=@key);
  INSERT enforcement.CaseActions(CaseId,ActionType,Stage,PerformedByUserId) VALUES(@id,'Test fixture',1,@master);
  INSERT enforcement.Surveys(CaseId,SubmittedByUserId) VALUES(@id,@master);
  INSERT enforcement.Documents(CaseId,DocumentType,CreatedByUserId) VALUES(@id,'Test fixture',@master);
  INSERT enforcement.Hearings(CaseId,HearingAt,Venue,CreatedByUserId) VALUES(@id,SYSUTCDATETIME(),'Test fixture',@master);
  INSERT enforcement.LegalUpdates(CaseId,LegalStatus,SynchronizedByUserId) VALUES(@id,'Test fixture',@master);
  INSERT enforcement.DemolitionDrives(CaseId,CreatedByUserId) VALUES(@id,@master);
 `);created=true;
 const encoded=encodeURIComponent(key),path='/admin/cases/'+encoded;
 const list=()=>api(master,'/ui/cases?includeArchived=1').then(response=>{assert.equal(response.status,200);return json(response).find(item=>item.caseKey===key)});
 let item=await list();assert(item&&item.rowVersion);checks++;
 for(const user of users.filter(user=>user.RoleCode!=='master')){
  assert.equal((await api(user,path,'PATCH',item)).status,403);
  assert.equal((await api(user,path+'/archive','POST',{days:3})).status,403);
  assert.equal((await api(user,path+'/restore','POST',{})).status,403);
  assert.equal((await api(user,'/cases/'+encoded,'DELETE',{confirmation:'confirm'})).status,403);
  assert.equal((await api(user,'/admin/cases/backup?format=json')).status,403);
  assert.equal((await api(user,'/users/'+master.UserId,'PATCH',{role:'master'})).status,403);checks+=6;
 }
 const beforeVersion=item.rowVersion;
 let edited=await api(master,path,'PATCH',{...item,property:'=HYPERLINK("test")',sector:'Edited sector',owner:'Edited test owner',currentStage:item.currentStage,status:item.status,legal:false});assert.equal(edited.status,200,edited.text);item=json(edited);assert.equal(item.property,'=HYPERLINK("test")');assert.equal(item.currentStage,1);checks++;
 assert.equal((await api(master,path,'PATCH',{...item,rowVersion:beforeVersion})).status,409);checks++;
 let archived=await api(master,path+'/archive','POST',{days:3,reason:'Temporary integration test'});assert.equal(archived.status,200,archived.text);item=json(archived);assert.equal(item.archived,true);assert(item.archiveUntil);assert(Math.abs(new Date(item.archiveUntil).getTime()-Date.now()-3*864e5)<10000);checks++;
 assert.equal((await api(master,'/cases/'+encoded+'/approve','POST',{locationConfirmed:true})).status,403);checks++;
 assert(!json(await api(cuc,'/ui/cases?includeArchived=1')).some(item=>item.caseKey===key));checks++;
 const backup=await api(master,'/admin/cases/backup?format=json');assert.equal(backup.status,200,backup.text);const full=json(backup);assert(full.tables.Cases.some(row=>row.CaseNumber===key&&row.IsArchived));assert(full.tables.Surveys.length>0&&full.tables.Documents.length>0);assert(full.tables.Users.every(user=>!Object.hasOwn(user,'PasswordHash')));assert(backup.headers.get('content-disposition').includes('.json'));checks++;
 const csv=await api(master,'/admin/cases/backup?format=csv');assert.equal(csv.status,200,csv.text);assert(csv.text.includes('IsArchived'));assert(csv.text.includes("' =HYPERLINK".replace(' ','')));checks++;
 archived=await api(master,path+'/archive','POST',{days:null,reason:'Indefinite test'});assert.equal(archived.status,200);assert.equal(json(archived).archiveUntil,null);checks++;
 const restored=await api(master,path+'/restore','POST',{});assert.equal(restored.status,200,restored.text);assert.equal(json(restored).archived,false);checks++;
 await api(master,path+'/archive','POST',{days:1});
 await pool.request().input('key',sql.NVarChar,key).query('UPDATE enforcement.Cases SET ArchiveUntil=DATEADD(second,-1,SYSUTCDATETIME()) WHERE CaseNumber=@key');
 item=await list();assert.equal(item.archived,false);checks++;
 assert.equal((await api(master,'/cases/'+encoded+'/approve','POST',{locationConfirmed:true})).status,403);checks++;
 assert.equal((await api(master,'/cases/'+encoded,'DELETE',{confirmation:'wrong'})).status,400);checks++;
 assert.equal((await api(master,'/cases/'+encoded,'DELETE',{confirmation:'confirm'})).status,204);checks++;
 assert.equal(await list(),undefined,'Deleted case must leave the register');checks++;
 assert((await pool.request().input('key',sql.NVarChar,'%'+key+'%').query("SELECT AuditId FROM enforcement.AuditLog WHERE EventType='AdminCaseDeleted' AND Detail LIKE @key")).recordset.length);checks++;
 await cleanup();created=false;
 const after=(await pool.request().query('SELECT CaseId,CaseNumber,RowVersion FROM enforcement.Cases')).recordset;
 assert.deepEqual(after.sort((a,b)=>a.CaseNumber.localeCompare(b.CaseNumber)),original.sort((a,b)=>a.CaseNumber.localeCompare(b.CaseNumber)));checks++;
 console.log(JSON.stringify({passed:true,checks,existingCasesUnchanged:true,testCaseRemoved:true,archiveExpiryVerified:true,backupFormats:['CSV','JSON']}));
}finally{
 if(created)await cleanup();
 await pool.close();
}

async function cleanup(){const fixture=(await pool.request().input('key',sql.NVarChar,key).query('SELECT CaseId FROM enforcement.Cases WHERE CaseNumber=@key')).recordset[0];if(!fixture)return;for(const table of ['CaseActions','Surveys','Documents','Hearings','LegalUpdates','DemolitionDrives','AuditLog'])await pool.request().input('id',sql.UniqueIdentifier,fixture.CaseId).query('DELETE enforcement.'+table+' WHERE '+(table==='AuditLog'?'EntityId':'CaseId')+'=@id');await pool.request().input('id',sql.UniqueIdentifier,fixture.CaseId).query('DELETE enforcement.Cases WHERE CaseId=@id');}
