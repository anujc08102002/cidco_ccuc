import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
let checks=0;
try{
 const {CaseRegister}=await vite.ssrLoadModule('/src/features/cases/CaseRegister.tsx');
 const {CaseDetail}=await vite.ssrLoadModule('/src/features/cases/CaseDetail.tsx');
 const {PublicDisclosure}=await vite.ssrLoadModule('/src/features/public/PublicDisclosure.tsx');
 const {canVerifyCase,canApproveCcuc}=await vite.ssrLoadModule('/src/features/cases/caseWorkflow.ts');
 const {severityFor,groupSeverity}=await vite.ssrLoadModule('/src/features/dashboard/mapSeverity.ts');
 const fixture={id:'TEST',caseKey:'TEST',property:'Test property',node:'Test node',owner:'Test owner',notice:'Draft',survey:'Test survey',officer:'Test officer',surveyor:'Test surveyor',assignedCuc:'Test CUC',status:'In progress',currentStage:1,stage:'1. Site Survey',updated:'Pending',legal:false,latitude:19,longitude:73,priority:'Urgent',violationDescription:'मराठी <img src=x onerror=alert(1)>',applicableSections:['53','55'],canVerify:true};
 for(const role of ['master','surveyor','cuc','ccuc','legal']){
  const html=renderToStaticMarkup(React.createElement(CaseRegister,{cases:[fixture],role,query:'',node:'All nodes',stage:'All stages',onQuery(){},onNode(){},onStage(){},onOpen(){}}));assert(html.includes('&lt;img'));assert(!html.includes('<img src=x'));assert(html.includes('Urgent priority'));assert(html.includes('Sec. 53, Sec. 55'));assert(html.includes('Advanced case filters'));checks+=5;
 }
 const archivedFixture={...fixture,id:'ARCHIVED-ONLY-TEST',caseKey:'ARCHIVED-ONLY-TEST',archived:true,archiveUntil:null};
 for(const role of ['master','surveyor','cuc','ccuc','legal']){
  const archiveHtml=renderToStaticMarkup(React.createElement(CaseRegister,{cases:[fixture,archivedFixture],role,initialArchiveScope:'archived',query:'',node:'All nodes',stage:'All stages',onQuery(){},onNode(){},onStage(){},onOpen(){}}));
  assert.equal(archiveHtml.includes('ARCHIVED-ONLY-TEST'),role==='master');
  if(role==='master'){assert(archiveHtml.includes('Archived forever'));assert(!archiveHtml.includes('<b>TEST</b>'));}
  checks++;
 }
 const master=renderToStaticMarkup(React.createElement(CaseDetail,{item:fixture,role:'master',onBack(){},onApproved(){},onLegal(){}}));assert(master.includes('Edit case'));assert(master.includes('Archive case'));assert(master.includes('Delete case permanently'));assert(!master.includes('Verify &amp; approve case'));checks+=4;
 const cuc=renderToStaticMarkup(React.createElement(CaseDetail,{item:fixture,role:'cuc',onBack(){},onApproved(){},onLegal(){}}));assert(cuc.includes('Verify &amp; approve case'));assert(/disabled=""[^>]*>.*?Verify &amp; approve/.test(cuc));assert(cuc.includes('Case workflow and linked records'));checks+=3;
 assert(!canVerifyCase(fixture,'master'));assert(!canApproveCcuc({...fixture,currentStage:3,status:'Awaiting approval'},'master'));assert(canApproveCcuc({...fixture,currentStage:3,status:'Awaiting approval'},'ccuc'));checks+=3;
 const publicHtml=renderToStaticMarkup(React.createElement(PublicDisclosure,{onBack(){}}));assert.equal((publicHtml.match(/<option /g)||[]).length,3);for(const label of ['Name','Plot Number','Survey Number'])assert(publicHtml.includes(label));assert(!publicHtml.includes('Test owner'));checks+=5;
 assert.equal(severityFor({priority:'Normal'}).colour,'#16865b');assert.equal(severityFor({priority:'High'}).colour,'#d97706');assert.equal(severityFor({priority:'Urgent'}).colour,'#dc3545');assert.equal(groupSeverity([{priority:'Normal'},{priority:'Urgent'}]).priority,'Urgent');checks+=4;
 console.log(JSON.stringify({passed:true,renderChecks:checks,roles:5,noDatabaseMutation:true}));
}finally{await vite.close();}
