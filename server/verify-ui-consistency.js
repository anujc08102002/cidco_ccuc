import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});let checks=0;
try{
 const {ReportRegister,reportDefinitions,emptyReportFilters}=await vite.ssrLoadModule('/src/features/workspaces/ReportRegister.tsx');
 const {WorkflowForm}=await vite.ssrLoadModule('/src/features/cases/CaseWorkflowPanel.tsx');
 const {AppShell}=await vite.ssrLoadModule('/src/components/AppShell.tsx');
 const {CaseDetail}=await vite.ssrLoadModule('/src/features/cases/CaseDetail.tsx');
 const {DemoDialog}=await vite.ssrLoadModule('/src/components/DemoDialog.tsx');
 const item={id:'CASE/TEST/1',caseKey:'internal-key',property:'Sample plot',node:'Sample node',owner:'Sample owner',stage:'1. Site Survey',currentStage:1,status:'In progress',notice:'Draft',survey:'Survey sample',officer:'Assigned officer',surveyor:'Surveyor',assignedCuc:'CUC',updated:'Pending',legal:false};
 const html=renderToStaticMarkup(React.createElement(ReportRegister,{reports:{cases:[{...item,canVerify:true,rowVersion:'INTERNAL_VERSION',PasswordHash:'PRIVATE_HASH'}]},cases:[item],filters:emptyReportFilters,onFilters(){},onApply(){},onOpen(){},loading:false}));
 for(const internal of ['INTERNAL_VERSION','PRIVATE_HASH','canVerify','rowVersion','PasswordHash','caseKey']){assert(!html.includes(internal));checks++;}
 for(const label of ['Enforcement case register','Case number','Owner / occupier','Responsible officer','Export CSV','Print report']){assert(html.includes(label));checks++;}
 for(const definition of Object.values(reportDefinitions)){assert(definition.columns.length<=8);assert(definition.columns.every(c=>!['CaseId','DocumentId','RowVersion','PasswordHash','caseKey','canVerify'].includes(c.key)));checks+=2;}
 const form=renderToStaticMarkup(React.createElement(WorkflowForm,{title:'Edit time limits',fields:[{key:'days',label:'Hearing window',type:'number',initialValue:'15'},{key:'reason',label:'Change reason',type:'textarea'}],onSubmit:async()=>{}}));assert(form.includes('value="15"'));assert(form.includes('portal-form-footer'));assert(form.includes('htmlFor')===false);checks+=3;
 const shell=renderToStaticMarkup(React.createElement(AppShell,{view:'reports',role:'cuc',theme:'light',dataMode:'Connection interrupted',onTheme(){},onNavigate(){},onSignOut(){},onNew(){},onDisable(){},onRequestTransfer(){},leaveDays:0,transferRequest:null,search:'',onSearch(){},cases:[],children:null}));assert(shell.includes('data-state="offline"'));assert(shell.includes('Reconnect'));assert(!shell.includes('LEG/26/011'));assert(!shell.includes('People &amp; access'));checks+=4;
 const detail=renderToStaticMarkup(React.createElement(CaseDetail,{item,role:'cuc',initialTab:'Documents',onBack(){},onApproved(){},onLegal(){}}));assert(detail.includes('id="case-panel-documents"'));assert(detail.includes('Notices and final orders'));assert(!detail.includes('View linked documents in the case workflow panel below'));assert(detail.includes('aria-selected="true"'));checks+=4;
 const registration=renderToStaticMarkup(React.createElement(DemoDialog,{type:'new',onClose(){},onConfirm(){}}));for(const label of ['Site survey and case registration','Property and responsibility','Site location','Use device GPS','Submit for CUC verification','role="dialog"','title="Google Maps site preview"','portal-label-text','portal-required','Open Google Maps']){assert(registration.includes(label));checks++;}assert(!registration.includes('recorded locally'));checks++;
 console.log(JSON.stringify({passed:true,checks,reportTypes:Object.keys(reportDefinitions).length,rawInternalColumnsHidden:true,offlineStateVerified:true}));
}finally{await vite.close();}
