const fs=require('fs');const p='src/features/cases/CaseWorkflowPanel.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("import './workflow.css';", "import './workflow.css';\nimport {NoticeEditor,PdfPreview,CertificateSignForm} from './NoticeDocuments';");
s=s.replace(" const requestId=useRef(0)"," const [draftDirty,setDraftDirty]=useState(false);\n const requestId=useRef(0)");
const start=s.indexOf(' const noticeText=');if(start!==-1)s=s.slice(0,start)+s.slice(s.indexOf('\n',start)+1);
s=s.replace("const actionForm=canAct&&", "const actionForm=canAct&&action[0].startsWith('approve-')&&latest(type)?<CertificateSignForm key={latest(type).DocumentId} path={path} document={latest(type)} onSign={b=>save('/actions',{...b,action:action[0]})}/>:canAct&&!(draftDirty&&action[0].startsWith('submit-'))&&");
const editorStart=s.indexOf('    {canDraft&&templates.length>0&&<WorkflowForm');const editorEnd=s.indexOf('\n',editorStart);
s=s.slice(0,editorStart)+`    {canDraft&&templates.some(t=>t.DocumentType===type)&&<NoticeEditor key={\`draft-\${type}-\${latest(type)?.DocumentId??'new'}\`} item={data.case} path={path} templates={templates} latest={latest(type)} documentType={type} onDirty={setDraftDirty} onSave={async b=>{await save('/documents',b);setDraftDirty(false);}}/>}
    {draftDirty&&<p className="portal-message">Save draft changes before sending this notice to CCUC.</p>}`+s.slice(editorEnd);
const previewStart=s.indexOf('{d.Content&&<details className="portal-preview"');const previewEnd=s.indexOf('</details>',previewStart)+10;
s=s.slice(0,previewStart)+`{d.Content&&<details className="portal-preview" open={d.DocumentId===latest(d.DocumentType)?.DocumentId}><summary>Open printable document · Version {d.VersionNumber}</summary><PdfPreview path={\`\${path}/documents/\${d.DocumentId}/pdf\`} autoOpen={d.DocumentId===latest(d.DocumentType)?.DocumentId} title={\`\${d.ReferenceNumber} · Version \${d.VersionNumber}\`}/></details>}`+s.slice(previewEnd);
fs.writeFileSync(p,s);
