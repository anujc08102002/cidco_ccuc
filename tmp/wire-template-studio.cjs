const fs=require('fs');const p='src/features/workspaces/EnforcementWorkspace.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("import {emptyReportFilters", "import {NoticeTemplateStudio,SigningCertificateSettings} from './NoticeTemplateStudio';\nimport {emptyReportFilters");
const begin=s.indexOf('const cidcoNoticeTemplate=');if(begin!==-1)s=s.slice(0,begin)+s.slice(s.indexOf('\n',begin)+1);
const form=s.indexOf('<WorkflowForm title="Register departmental template"');const end=s.indexOf('/>{templates.length?',form);
if(form===-1||end===-1)throw new Error('Template editor not found');
s=s.slice(0,form)+'<NoticeTemplateStudio onSaved={load}/><SigningCertificateSettings/>'+s.slice(end+2);
fs.writeFileSync(p,s);
const q='src/features/cases/CaseWorkflowPanel.tsx';fs.writeFileSync(q,fs.readFileSync(q,'utf8').replace('</details>}}</div></article>','</details>}</div></article>'));
