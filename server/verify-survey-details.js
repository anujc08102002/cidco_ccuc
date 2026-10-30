// Create and remove only one temporary survey case; existing case content remains unchanged.
import dotenv from 'dotenv';
import sql from 'mssql';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {issueSession} from './sessions.js';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
dotenv.config();
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});let key,master,checks=0;const testNode='TEST '+randomUUID();
const api=async(user,path,method='GET',body)=>{const response=await fetch('http://localhost:3001/api'+path,{method,headers:{Authorization:'Bearer '+issueSession(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,text:await response.text()};};
try{
 const users=(await pool.request().query('SELECT * FROM enforcement.Users WHERE IsActive=1 AND MustChangePassword=0')).recordset;
 master=users.find(user=>user.RoleCode==='master');const surveyor=users.find(user=>user.RoleCode==='surveyor'),cuc=users.find(user=>user.RoleCode==='cuc');assert(master&&surveyor&&cuc);
 await pool.request().input('u',sql.UniqueIdentifier,surveyor.UserId).input('a',sql.UniqueIdentifier,cuc.UserId).input('node',sql.NVarChar,testNode).query('INSERT enforcement.ReportingLinks VALUES(@u,@a,@node)');
 const before=(await pool.request().query('SELECT CaseId,RowVersion FROM enforcement.Cases')).recordset;
 const description='Temporary survey test: observed works and site measurements.\nमराठी नोंद <img src=x onerror=alert(1)>';
 const body={propertyReference:'TEST SURVEY '+randomUUID(),sector:'TEST sector',node:testNode,plotNumber:'TEST plot',ownerName:'Temporary test owner',surveyReference:'Temporary survey name',cucId:cuc.UserId,latitude:19.01,longitude:73.04,siteAddress:'Temporary survey address',locationSource:'Manual confirmation',locationAccuracyMetres:4,locationCapturedAt:'2026-10-14T08:00:00Z',priority:'Urgent',violationDescription:description,applicableSections:['53','55']};
 assert.equal((await api(surveyor,'/cases','POST',{...body,priority:'Invalid'})).status,400);checks++;
 assert.equal((await api(surveyor,'/cases','POST',{...body,applicableSections:['999']})).status,400);checks++;
 const saved=await api(surveyor,'/cases','POST',body);assert.equal(saved.status,201,saved.text);const item=JSON.parse(saved.text);key=item.caseKey;
 for(const [field,value] of Object.entries({property:body.propertyReference,sector:body.sector,node:body.node,owner:body.ownerName,survey:body.surveyReference,latitude:body.latitude,longitude:body.longitude,siteAddress:body.siteAddress,priority:body.priority,violationDescription:description,applicableSections:body.applicableSections,locationSource:body.locationSource,locationAccuracyMetres:body.locationAccuracyMetres}))assert.deepEqual(item[field],value);checks++;
 const reload=JSON.parse((await api(cuc,'/ui/cases')).text).find(row=>row.caseKey===key);assert.equal(reload.violationDescription,description);assert.deepEqual(reload.applicableSections,['53','55']);checks++;
 const {CaseRegister}=await vite.ssrLoadModule('/src/features/cases/CaseRegister.tsx'),{CaseDetail}=await vite.ssrLoadModule('/src/features/cases/CaseDetail.tsx');
 for(const role of ['master','surveyor','cuc','ccuc','legal']){
  const html=renderToStaticMarkup(React.createElement(CaseRegister,{cases:[reload],role,query:'',node:'All nodes',stage:'All stages',onQuery(){},onNode(){},onStage(){},onOpen(){}}));assert(html.includes('Violation description'));assert(html.includes('Temporary survey test'));assert(html.includes('Urgent priority'));assert(html.includes('Sec. 53, Sec. 55'));assert(html.includes('&lt;img'));assert(!html.includes('<img src=x'));checks++;
 }
 const detail=renderToStaticMarkup(React.createElement(CaseDetail,{item:reload,role:'cuc',onBack(){},onApproved(){},onLegal(){}}));assert(detail.includes('Temporary survey test')&&detail.includes('Location captured (India time)'));checks++;
 const edited=await api(master,'/admin/cases/'+encodeURIComponent(key),'PATCH',{...reload,currentStage:1,priority:'High',violationDescription:'Edited test description',applicableSections:['54','56']});assert.equal(edited.status,200,edited.text);assert.equal(JSON.parse(edited.text).priority,'High');checks++;
 const backup=JSON.parse((await api(master,'/admin/cases/backup?format=json')).text).tables.Cases.find(row=>row.CaseNumber===key);assert.equal(backup.ViolationDescription,'Edited test description');assert.equal(backup.Priority,'High');checks++;
 const csv=await api(master,'/admin/cases/backup?format=csv');assert(csv.text.includes('ViolationDescription')&&csv.text.includes('Edited test description'));checks++;
 const {severityFor,groupSeverity}=await vite.ssrLoadModule('/src/features/dashboard/mapSeverity.ts');
 assert.equal(severityFor({priority:'Normal'}).colour,'#16865b');assert.equal(severityFor({priority:'High'}).colour,'#d97706');assert.equal(severityFor({priority:'Urgent'}).colour,'#dc3545');assert.equal(severityFor({priority:null}).priority,null);assert.equal(groupSeverity([{priority:'Normal'},{priority:'Urgent'},{priority:'High'}]).priority,'Urgent');checks++;
 const removed=await api(master,'/cases/'+encodeURIComponent(key),'DELETE',{confirmation:'confirm'});assert.equal(removed.status,204,removed.text);key=null;
 const after=(await pool.request().query('SELECT CaseId,RowVersion FROM enforcement.Cases')).recordset;assert.deepEqual(after.sort((a,b)=>a.CaseId.localeCompare(b.CaseId)),before.sort((a,b)=>a.CaseId.localeCompare(b.CaseId)));checks++;
 console.log(JSON.stringify({passed:true,checks,formDataRoundTrip:true,allRoleRegistersVerified:true,severityColoursVerified:true,existingCasesUnchanged:true}));
}finally{if(key)await cleanup();await pool.request().input('node',sql.NVarChar,testNode).query('DELETE enforcement.ReportingLinks WHERE Node=@node');await pool.close();await vite.close();}

async function cleanup(){const fixture=(await pool.request().input('key',sql.NVarChar,key).query('SELECT CaseId FROM enforcement.Cases WHERE CaseNumber=@key')).recordset[0];if(!fixture)return;for(const table of ['CaseActions','Surveys','Documents','Hearings','LegalUpdates','DemolitionDrives','AuditLog'])await pool.request().input('id',sql.UniqueIdentifier,fixture.CaseId).query('DELETE enforcement.'+table+' WHERE '+(table==='AuditLog'?'EntityId':'CaseId')+'=@id');await pool.request().input('id',sql.UniqueIdentifier,fixture.CaseId).query('DELETE enforcement.Cases WHERE CaseId=@id');}
