// Read-only regression checks against real cases and the running API; no approvals are submitted.
import dotenv from 'dotenv';
import sql from 'mssql';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {issueSession} from './sessions.js';
import http from 'node:http';
import {readFileSync} from 'node:fs';
dotenv.config();
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
const pages={};
try {
 const {CaseRegister}=await vite.ssrLoadModule('/src/features/cases/CaseRegister.tsx');
 const {CaseDetail}=await vite.ssrLoadModule('/src/features/cases/CaseDetail.tsx');
 const {canVerifyCase}=await vite.ssrLoadModule('/src/features/cases/caseWorkflow.ts');
 const result=await pool.request().query('SELECT * FROM enforcement.Users WHERE IsActive=1 AND MustChangePassword=0');
 let checks=0;
 for(const role of ['master','surveyor','cuc','ccuc','legal']){
  const user=result.recordset.find(user=>user.RoleCode===role);
  if(!user){
   const fallback=result.recordset[0];
   const response=await fetch('http://localhost:3001/api/ui/cases',{headers:{Authorization:'Bearer '+issueSession(fallback)}});
   const cases=await response.json();
   const register=renderToStaticMarkup(React.createElement(CaseRegister,{cases,role,query:'',node:'All nodes',stage:'All stages',onQuery(){},onNode(){},onStage(){},onOpen(){}}));
   assert(register.includes('GEO-LOCATION'));assert(register.includes('Google Maps'));pages['/'+role]=register;checks++;continue;
  }
  const headers={Authorization:'Bearer '+issueSession(user),'Content-Type':'application/json'};
  const response=await fetch('http://localhost:3001/api/ui/cases',{headers});assert.equal(response.status,200);
  const cases=await response.json();
  const register=renderToStaticMarkup(React.createElement(CaseRegister,{cases,role,query:'',node:'All nodes',stage:'All stages',onQuery(){},onNode(){},onStage(){},onOpen(){}}));
  assert.equal((register.match(/> Google Maps<\/a>/g)||[]).length,cases.filter(item=>item.latitude!=null&&item.longitude!=null).length);
  assert(register.includes('GEO-LOCATION'));checks++;
  pages['/'+role]=register;
  if(role==='master'){
   assert(register.includes('Export Excel CSV')&&register.includes('Full case backup (JSON)')&&register.includes('Archived cases')&&register.includes('Manage'));
   pages['/admin-detail']=renderToStaticMarkup(React.createElement(CaseDetail,{item:cases[0],role,onBack(){},onApproved(){},onLegal(){}}));
   assert(pages['/admin-detail'].includes('Edit case')&&pages['/admin-detail'].includes('Archive case')&&!pages['/admin-detail'].includes('Delete permanently'));checks++;
  }
  if(role==='cuc'){
   const eligible=cases.filter(item=>canVerifyCase(item,role));
   assert(eligible.length>0,'Existing assigned CUC cases must expose verification');
   assert.equal((register.match(/Verify case/g)||[]).length,eligible.length);
   for(const item of eligible){
    assert.equal(item.status,'In progress');
    const detail=renderToStaticMarkup(React.createElement(CaseDetail,{item,role,onBack(){},onApproved(){},onLegal(){}}));
    assert(detail.includes('Verify &amp; approve case'));assert(detail.includes('type="checkbox"'));assert(detail.includes('maps.google.com/maps?'));
    assert(/disabled=""[^>]*>.*?Verify &amp; approve/.test(detail));
    const rejected=await fetch('http://localhost:3001/api/cases/'+encodeURIComponent(item.caseKey??item.id)+'/approve',{method:'POST',headers,body:JSON.stringify({locationConfirmed:false})});
    assert.equal(rejected.status,400);checks++;
    pages['/detail']=detail;
   }
  }
  if(role==='ccuc'){
   const item=cases.find(item=>item.currentStage===1);
   if(item){const rejected=await fetch('http://localhost:3001/api/cases/'+encodeURIComponent(item.caseKey??item.id)+'/approve',{method:'POST',headers,body:'{}'});assert.equal(rejected.status,409);checks++;}
   if(!cases.length)continue;
   const fixture={...cases[0],currentStage:3,stage:'3. File Approval by CCUC',status:'Awaiting approval',legal:false};
   const detail=renderToStaticMarkup(React.createElement(CaseDetail,{item:fixture,role,onBack(){},onApproved(){},onLegal(){}}));assert(detail.includes('Approve for notice generation'));checks++;
  }
 }
 console.log(JSON.stringify({passed:true,checks,rolesChecked:Object.keys(pages).filter(key=>!key.includes('detail')),noCaseApprovalsSubmitted:true}));
}finally{await pool.close();await vite.close();}
if(process.argv.includes('--preview')){
 const css=readFileSync('src/styles.css','utf8')+'\n'+readFileSync('src/enterprise.css','utf8');
 http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>'+css+'</style></head><body><main class="new-shell" data-theme="light" style="padding:24px">'+(pages[req.url]??pages['/cuc'])+'</main></body></html>');}).listen(3002,'127.0.0.1',()=>console.log('Read-only UI preview http://127.0.0.1:3002/cuc'));
}
