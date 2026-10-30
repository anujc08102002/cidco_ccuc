// Isolated database fixtures; no existing case or user is changed.
import dotenv from 'dotenv';
import sql from 'mssql';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import ExcelJS from 'exceljs';
import {issueSession} from './sessions.js';
import {hashPassword} from './passwords.js';
import {defaultNoticeBody} from './notice-model.js';
import {testHandwriting} from './signature-test-fixtures.js';
dotenv.config({quiet:true});
const [host,port]=process.env.DB_SERVER.split(',');
const pool=await new sql.ConnectionPool({server:host,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}}).connect();
const tag=crypto.randomUUID().slice(0,8),caseId=crypto.randomUUID(),key='NOTICE-TEST-'+tag,users=Object.fromEntries(['master','cuc','ccuc','outsider'].map(role=>[role,{UserId:crypto.randomUUID(),Username:`notice-test-${tag}-${role}`,DisplayName:`Acceptance ${role} ${tag}`,RoleCode:role==='outsider'?'cuc':role,PasswordHash:hashPassword('Acceptance-only-password-'+tag)}]));
const child=spawn(process.execPath,['server/index.js','--port=3104'],{env:process.env,stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',d=>log+=d);child.stdout.on('data',()=>{});
let checks=0,templateId;const base='http://localhost:3104/api',path='/workflow/cases/'+encodeURIComponent(key);
const api=async(role,url,body,status=200)=>{const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(role?{Authorization:'Bearer '+issueSession(users[role])}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(r.headers.get('content-type')?.includes('application/pdf')){assert.equal(r.status,status);checks++;return Buffer.from(await r.arrayBuffer());}const v=await r.json().catch(()=>null);assert.equal(r.status,status,`${url} ${JSON.stringify(v)} ${log}`);checks++;return v;};
const snapshot=()=>api('cuc',path);
const save=async(role,suffix,data,status=200)=>api(role,path+suffix,{rowVersion:(await snapshot()).rowVersion,...data},status);
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert(ready,'API/database did not become ready: '+log);
 for(const u of Object.values(users))await pool.request().input('id',sql.UniqueIdentifier,u.UserId).input('name',sql.NVarChar,u.DisplayName).input('username',sql.NVarChar,u.Username).input('role',sql.NVarChar,u.RoleCode).input('hash',sql.NVarChar,u.PasswordHash).query('INSERT enforcement.Users(UserId,Username,DisplayName,RoleCode,PasswordHash) VALUES(@id,@username,@name,@role,@hash)');
 await pool.request().input('id',sql.UniqueIdentifier,caseId).input('key',sql.NVarChar,key).input('cuc',sql.UniqueIdentifier,users.cuc.UserId).query("INSERT enforcement.Cases(CaseId,CaseNumber,PropertyReference,Sector,Node,OwnerName,PlotNumber,AssignedSurveyorId,AssignedCucId,ResponsibleUserId,CurrentStage,WorkflowStep,Status) VALUES(@id,@key,'Acceptance building','Sector 4','Acceptance node','Original case owner','118',@cuc,@cuc,@cuc,4,'notice-draft','In progress')");
 const template={format:'cidco-template-v2',body:defaultNoticeBody,responseDays:15,pages:[]};
 await api('cuc','/workflow/templates',{name:key,type:'Notice',body:JSON.stringify(template),approvalReference:'ACCEPTANCE ONLY'},403);
 await api('master','/workflow/templates',{name:key,type:'Notice',body:JSON.stringify(template),approvalReference:'ACCEPTANCE ONLY'},201);templateId=(await api('cuc','/workflow/templates')).find(t=>t.Name===key).TemplateId;
 await api('outsider',path,undefined,404);
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Recipients');sheet.addRow(['Owner','Project','Plot Number','Sector','Node']);sheet.addRow(['First imported builder','First project','119','Sector 4','Acceptance node']);sheet.addRow(['Second imported builder','Second project','120','Sector 5','Acceptance node']);
 const imported=await api('cuc',path+'/recipients/import',{base64:Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'),fileName:'recipients.xlsx'});assert.equal(imported.rows.length,2);
 const draft={templateId,authorityId:users.ccuc.UserId,type:'Notice',reference:key,body:defaultNoticeBody,recipients:imported.rows,reason:'Acceptance fixture'};
 await api('cuc',path+'/documents/preview',{...draft,responseDays:0},400);
 const preview=await api('cuc',path+'/documents/preview',{...draft,responseDays:15});assert(preview.toString('ascii',0,5)==='%PDF-');
 await save('master','/documents',{...draft,responseDays:15},403);
 await save('cuc','/documents',{...draft,responseDays:15},201);
 let s=await snapshot(),d=s.Documents.find(d=>d.DocumentType==='Notice');const content=JSON.parse(d.Content);assert.equal(content.entries[1].fields.owner,'Second imported builder');assert.equal(content.entries[1].fields.plot,'120');assert.equal(content.entries[1].fields.days,'15');assert(!d.Content.includes('Sector Sector'));
 const oldVersion=s.rowVersion;
 await save('cuc','/documents',{...draft,responseDays:21,reason:'Acceptance revision'},201);
 s=await snapshot();d=s.Documents.find(d=>d.VersionNumber===2);assert.equal(JSON.parse(d.Content).responseDays,21);
 await api('cuc',path+'/actions',{action:'submit-notice',documentId:d.DocumentId,reason:'Outdated view',rowVersion:oldVersion},409);
 const exactDraft=await api('ccuc',path+'/documents/'+d.DocumentId+'/pdf');assert(exactDraft.length>1000);
 await save('cuc','/actions',{action:'submit-notice',documentId:d.DocumentId,reason:'Ready for review'});
 await save('cuc','/actions',{action:'approve-notice',documentId:d.DocumentId,reason:'Unauthorized'},403);
 const identity=testHandwriting();
 const signatureImageHash=(await api('master','/workflow/signature-images',{...identity,userId:users.ccuc.UserId})).signature.hash;
 await save('ccuc','/actions',{action:'approve-notice',documentId:d.DocumentId,reason:'Missing certificate',previewReviewed:true},409);
 await save('ccuc','/actions',{action:'approve-notice',documentId:d.DocumentId,reason:'Verified exact version',previewReviewed:true,signatureImageHash});
 s=await snapshot();d=s.Documents.find(d=>d.VersionNumber===2);assert.equal(d.SignatureMethod,'Admin-registered handwritten signature');assert.equal(d.SignedByName,users.ccuc.DisplayName);assert.equal(s.step,'notice-issue');
 const signed=await api('cuc',path+'/documents/'+d.DocumentId+'/pdf');assert(signed.toString('ascii',0,5)==='%PDF-');
 await save('cuc','/actions',{action:'issue-notice',documentId:d.DocumentId,reason:'Reviewed signed notice',previewReviewed:true});
 await save('cuc','/actions',{action:'publish-notice',documentId:d.DocumentId,reason:'Publish notice'});
 const publicPdf=await api(null,'/public/documents/'+d.DocumentId);assert.deepEqual(publicPdf,signed);
 const audit=(await snapshot()).AuditLog;assert(!JSON.stringify(audit).includes('pfxPassword'));assert(!JSON.stringify(audit).includes(identity.base64));
 const pub=await api(null,'/public/search?field=name&q=Second%20imported%20builder');assert(pub.some(r=>r.documentId===d.DocumentId));
 console.log(JSON.stringify({passed:true,apiChecks:checks,recipients:2,handwrittenSignatureApplied:true,publicPdfMatchesSignedPdf:true}));
}finally{
 child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',resolve);setTimeout(resolve,3000);}});
 try{
  await pool.request().input('id',sql.UniqueIdentifier,caseId).query('DELETE enforcement.AuditLog WHERE EntityId=@id; DELETE enforcement.CaseActions WHERE CaseId=@id; DELETE enforcement.Documents WHERE CaseId=@id; DELETE enforcement.Cases WHERE CaseId=@id;');
  if(templateId)await pool.request().input('id',sql.UniqueIdentifier,templateId).query('DELETE enforcement.DocumentTemplates WHERE TemplateId=@id');
  for(const u of Object.values(users))await pool.request().input('id',sql.UniqueIdentifier,u.UserId).input('cert',sql.NVarChar,'signature-image:'+u.UserId.toLowerCase()).query('DELETE enforcement.Settings WHERE SettingKey=@cert; DELETE enforcement.AuditLog WHERE UserId=@id OR EntityId=@id; DELETE enforcement.Users WHERE UserId=@id');
 }finally{await pool.close();}
}
