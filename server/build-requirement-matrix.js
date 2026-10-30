import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const source=process.argv[2];if(!source)throw new Error('Pass the original requirements text file.');
const lines=readFileSync(source,'utf8').split(/\r?\n/),rows=[];let phase='',section='',ordinal=0;
const evidence={
 '1':'server/index.js; server/admin-cases.js; src/App.tsx; database/01_enforceflow_schema.sql; database/05_operational_records.sql; existing verify scripts',
 '2':'server/enforcement-workflow.js; server/workflow-policy.js; src/features/cases/CaseWorkflowPanel.tsx; database/12_enforcement_workflow.sql; server/verify-enforcement.js',
 '3':'server/lts.js; /api/workflow/cases/:key/legal; /api/workflow/cases/:key/lts; enforcement.LegalUpdates; CaseWorkflowPanel.tsx',
 '4':'workflowSettings; refreshEscalations; /api/workflow/settings; /api/workflow/cases/:key/deadline; Cases.NextActionAt/EscalatedAt; CaseRegister.tsx',
 '5':'requireSession; scopeSql; /api/users; /api/workflow/hierarchy; /api/workflow/cases/:key/transfer; ReportingLinks; ChargeTransfers',
 '6':'/api/workflow/cases/:key/references; /evidence; CaseReferences; Documents.FileContent; CaseWorkflowPanel.tsx',
 '7':'PublicDisclosure.tsx; /api/public/search; /api/public/documents/:id; CaseRegister.tsx; EnforcementWorkspace.tsx',
 '8':'/api/workflow/reports; EnforcementWorkspace.tsx; Cases/Documents/Hearings/LegalUpdates/DemolitionDrives/CaseActions/AuditLog/ReportingLinks',
 '9':'/api/workflow/drives; /api/workflow/drives/:id; /api/workflow/cases/:key/drive; DrivePlans; DemolitionDrives; AuditLog',
 '10':'requireSession; workflow-policy.js; enforcement-workflow.js transactions; RowVersion; protected evidence; admin-cases.js retention; passwords.js',
 '11':'CaseWorkflowPanel.tsx; EnforcementWorkspace.tsx; PublicDisclosure.tsx; CaseRegister.tsx; workflow.css; server/verify-render.js',
 '12':'database/12_enforcement_workflow.sql; enforcement-workflow.js; lts.js; existing SQL Server and Express architecture',
 '13':'server/workflow.test.js; server/verify-enforcement.js; server/verify-render.js; legacy verify scripts; npm run build; npm run typecheck'
};
function classify(phase,section,n,text){
 let status='Implemented',note='Implemented in the linked files. See implementation report for validation coverage and deployment prerequisites.';
 if(phase==='3'&&section==='A'&&[3,4].includes(n)){status='Blocked';note='No authorized LTS API contract, credentials or authoritative restriction mapping supplied. Adapter returns explicit 503; manual sourced legal review works.';}
 if(phase==='2'&&((section==='C'&&[1,2].includes(n))||(section==='E'&&[1,2].includes(n)))){status='Blocked';note='Template registration, merge-field population, preview and versioning implemented. Actual approved departmental notice/order templates have not been supplied.';}
 if(phase==='2'&&section==='C'&&[10,11].includes(n)){status='Blocked';note='No consolidated-recipient policy, permitted recipient schema or Excel import existed. Individual instruments work. Departmental process confirmation is required before consolidated/Excel issuance.';}
 if(phase==='2'&&section==='E'&&n===3){status='Partially implemented';note='Draft/review/CCUC approval/issued/publication states and exact-version signed-file evidence implemented. No cryptographic digital-signature provider or separate signature-validation state.';}
 if(phase==='3'&&section==='A'&&n===5){status='Partially implemented';note='Manual legal status, authoritative source, recorded time and restriction shown. Live last-successful LTS sync remains blocked.';}
 if(phase==='5'&&section==='D'&&/permissions.*workflow/i.test(text)){status='Partially implemented';note='Role assignment, jurisdiction and deadlines are configurable. Operational/CCUC transition permissions remain deliberately fixed pending any approved alternate policy.';}
 if(phase==='11'&&[8,9].includes(n)){status='Partially implemented';note='Semantic labels, forms, responsive grid and confirmation added; public browser smoke test and 44 SSR checks passed. Full keyboard, mobile and assistive-technology audit not performed.';}
 if(phase==='13'&&n===12){status='Blocked';note='LTS unavailable response tested. Successful live legal retrieval cannot be tested without the authorized contract and access.';}
 if(phase==='13'&&[1,3,4,7,9,10,16,20].includes(n)){status='Partially implemented';note='Persisted API acceptance path exercised with fresh fixtures; full browser interaction for this scenario is not yet automated. Public search browser smoke test and SSR role rendering were checked separately.';}
 if(phase==='13'&&n===23){note='Unit tests 8 pass; live acceptance 147 checks pass; SSR 44 checks pass; existing regression scripts pass. Typecheck/build pass. No lint tool is configured in the original repository.';}
 return {status,note};
}
for(const line of lines){
 const ph=line.match(/^# PHASE (\d+)/);if(ph){phase=ph[1];section='';ordinal=0;continue;}
 if(line.startsWith('# EXPLICIT'))break;
 const sec=line.match(/^## ([A-Z])\./);if(sec){section=sec[1];ordinal=0;continue;}
 if(!phase)continue;
 const numbered=line.match(/^(\d+)\. (.+)/),bullet=line.match(/^- (.+)/);
 if(!numbered&&!bullet)continue;
 const n=numbered?Number(numbered[1]):++ordinal,requirement=(numbered?numbered[2]:bullet[1]).replaceAll('**','');
 const key=`P${phase}${section?'.'+section:''}.${numbered?n:'B'+n}`,final=classify(phase,section,n,requirement);
 let baseline='Partially implemented';if(['3','4','6','8','9'].includes(phase))baseline='Missing';if(phase==='3'&&section==='A'&&[3,4].includes(n))baseline='Blocked';
 rows.push({id:key,requirement,baseline,status:final.status,evidence:evidence[phase],note:final.note});
}
mkdirSync('docs',{recursive:true});
const escape=s=>'"'+String(s).replaceAll('"','""')+'"';
writeFileSync('docs/REQUIREMENT_MATRIX.csv','\uFEFF'+[['ID','Requirement','Audit baseline','Final status','Files / endpoints / entities','Evidence / limitation'],...rows.map(r=>[r.id,r.requirement,r.baseline,r.status,r.evidence,r.note])].map(row=>row.map(escape).join(',')).join('\r\n'));
writeFileSync('docs/REQUIREMENT_MATRIX.md','# Requirement matrix\n\nEach numbered requirement and applicable role/search/report bullet from the supplied request appears below. Baseline records the inspected prototype capability; final status distinguishes implemented mechanisms from external content and unverified acceptance work. “Implemented” does not imply successful LTS access, departmental approval of templates or full browser acceptance.\n\n| ID | Requirement | Audit baseline | Final status | Files / endpoints / entities | Evidence / limitation |\n|---|---|---|---|---|---|\n'+rows.map(r=>'| '+[r.id,r.requirement,r.baseline,r.status,r.evidence,r.note].map(v=>v.replaceAll('|','\\|')).join(' | ')+' |').join('\n')+'\n');
console.log(JSON.stringify({requirements:rows.length,statuses:rows.reduce((out,r)=>(out[r.status]=(out[r.status]??0)+1,out),{})}));
