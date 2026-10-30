// Isolated UI test page. All writes affect only the local preview state.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CaseRegister} from '../src/features/cases/CaseRegister';
import {CaseDetail} from '../src/features/cases/CaseDetail';
import {enforcementApi} from '../src/services/enforcementApi';
import type {EnforcementCase} from '../src/types';
import '../src/styles.css';
import '../src/enterprise.css';
let cases:EnforcementCase[]=[{id:'PREVIEW/CASE/001',caseKey:'PREVIEW/CASE/001',property:'Preview plot',sector:'Sector 4',node:'Belapur',owner:'Preview owner',stage:'1. Site Survey & Enforcement Case Creation',currentStage:1,status:'In progress',legal:false,notice:'Draft',survey:'PREVIEW/SURVEY/001',surveyor:'Preview surveyor',assignedCuc:'Preview CUC',officer:'Preview CUC',updated:'Awaiting CUC verification',latitude:19.0,longitude:73.0,siteAddress:'Preview location',rowVersion:'preview-1',surveyorId:'preview-surveyor',cucId:'preview-cuc',responsibleUserId:'preview-cuc'}];
enforcementApi.listUsers=async()=>[{id:'preview-surveyor',username:'preview-surveyor',name:'Preview surveyor',role:'surveyor',label:'Surveyor',active:true,mustChangePassword:false},{id:'preview-cuc',username:'preview-cuc',name:'Preview CUC',role:'cuc',label:'CUC',active:true,mustChangePassword:false}];
enforcementApi.editAdminCase=async item=>({...item,rowVersion:'preview-edited'});
enforcementApi.archiveCase=async(key,days,reason)=>({...cases.find(item=>item.caseKey===key)!,archived:true,archiveUntil:days===null?null:new Date(Date.now()+days*864e5).toISOString(),archiveReason:reason});
enforcementApi.restoreCase=async key=>({...cases.find(item=>item.caseKey===key)!,archived:false,archiveUntil:null});
enforcementApi.deleteCase=async()=>{};
enforcementApi.downloadCaseBackup=async()=>{throw new Error('This preview does not download live data. Use the real administrator register for backups.');};
enforcementApi.approveCase=async()=>{throw new Error('Workflow approval is not submitted from this preview.');};
function Preview(){const [items,setItems]=useState(cases),[selected,setSelected]=useState<EnforcementCase|null>(null),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[node,setNode]=useState('All nodes'),[stage,setStage]=useState('All stages');const changed=(item:EnforcementCase|null,key:string)=>{cases=item?cases.map(c=>c.id===key?item:c):cases.filter(c=>c.id!==key);setItems(cases);setSelected(current=>current?.id===key?item:current);};return <main className="new-shell" data-theme="light" style={{padding:20}}><p className="legal-disclaimer">Isolated administrator UI preview — edits and archive actions affect only this test page.</p>{message&&<p role="status">{message}</p>}{selected?<CaseDetail item={selected} role="master" onBack={()=>setSelected(null)} onApproved={()=>{}} onLegal={()=>{}} onCaseChanged={item=>changed(item,selected.id)} onNotify={setMessage}/>:<CaseRegister cases={items} role="master" query={query} node={node} stage={stage} onQuery={setQuery} onNode={setNode} onStage={setStage} onOpen={setSelected} onCaseChanged={changed} onNotify={setMessage}/>}</main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
