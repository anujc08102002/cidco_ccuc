// Browser QA fixture. No real records are created or changed.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OperationalMap} from '../src/features/dashboard/OperationalMap';
import {CaseRegister} from '../src/features/cases/CaseRegister';
import {DemoDialog,type CaseFields} from '../src/components/DemoDialog';
import {enforcementApi} from '../src/services/enforcementApi';
import type {EnforcementCase} from '../src/types';
import '../src/styles.css';
import '../src/enterprise.css';
const seed:EnforcementCase={id:'PREVIEW/SURVEY/001',property:'Preview plot',sector:'Sector 4',node:'Belapur',owner:'Preview owner',stage:'1. Site Survey & Enforcement Case Creation',status:'In progress',legal:false,updated:'Awaiting CUC verification',notice:'Draft',survey:'Preview site inspection',surveyor:'Preview surveyor',assignedCuc:'Preview CUC',officer:'Preview CUC',latitude:19.019,longitude:73.0435,priority:'Urgent',violationDescription:'Observed extension beyond the plot boundary.\nSurvey measurements and site facts are recorded here.',applicableSections:['53','55'],locationSource:'Manual confirmation',locationAccuracyMetres:4,locationCapturedAt:'2026-10-14T08:00:00Z'};
enforcementApi.listUsers=async()=>[{id:'preview-cuc',username:'preview-cuc',name:'Preview CUC',role:'cuc',label:'CUC',active:true,mustChangePassword:false}];
function Preview(){const [create,setCreate]=useState(false),[submitted,setSubmitted]=useState<CaseFields|null>(null);const cases=[seed,{...seed,id:'PREVIEW/SURVEY/002',priority:'High' as const,latitude:19.0202,longitude:73.045},{...seed,id:'PREVIEW/SURVEY/003',priority:'Normal' as const,latitude:19.0178,longitude:73.0418},{...seed,id:'PREVIEW/SURVEY/004',priority:null,latitude:19.018,longitude:73.0458},{...seed,id:'PREVIEW/SURVEY/005',priority:'Normal' as const}];return <main className="new-shell" data-theme="light" style={{padding:24}}><p className="legal-disclaimer">Isolated preview — all cases on this page are test fixtures.</p><button className="action-primary" onClick={()=>setCreate(true)}>Test survey form</button>{submitted&&<pre role="status">{JSON.stringify(submitted,null,2)}</pre>}<div style={{margin:'20px 0'}}><OperationalMap cases={cases}/></div><CaseRegister cases={[seed]} role="cuc" query="" node="All nodes" stage="All stages" onQuery={()=>{}} onNode={()=>{}} onStage={()=>{}} onOpen={()=>{}}/>{create&&<DemoDialog type="new" onClose={()=>setCreate(false)} onConfirm={(_property,_cuc,_start,_end,_action,fields)=>{setSubmitted(fields??null);setCreate(false)}}/>}</main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
