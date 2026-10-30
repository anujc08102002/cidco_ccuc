import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NoticeEditor} from '../src/features/cases/NoticeDocuments';
import {NoticeTemplateStudio} from '../src/features/workspaces/NoticeTemplateStudio';
import {request} from '../src/services/enforcementApi';
import '../src/styles.css';import '../src/enterprise.css';
function Fixture(){
 const [templates,setTemplates]=useState<any[]>([]),[tab,setTab]=useState('CUC');
 const load=async()=>setTemplates(await request<any[]>('/workflow/templates'));useEffect(()=>{void load();},[]);
 return <main><button onClick={()=>setTab('CUC')}>CUC</button><button onClick={()=>setTab('Admin')}>Admin</button>{templates.length>0&&(tab==='Admin'?<NoticeTemplateStudio templates={templates} onSaved={load}/>:<NoticeEditor item={{owner:'Anuj Chavan',property:'Test Building',plotNumber:'118',sector:'4',node:'Belapur'} as any} path="/workflow/cases/TEST" documentType="Notice" templates={templates} context={{authorities:[{id:'authority',name:'Vishal Dhage'}],defaultAuthorityId:'authority'}} onSave={async()=>{}} onDirty={()=>{}}/>)}</main>;
}createRoot(document.getElementById('root')!).render(<Fixture/>);
