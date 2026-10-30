from pathlib import Path
p=Path('src/components/AppShell.tsx');s=p.read_text(encoding='utf-8')
s=s.replace(" const [commandQuery", " const [small,setSmall]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:760px)').matches);\n const [singleKeys,setSingleKeys]=useState(()=>typeof localStorage==='undefined'||localStorage.getItem('enforceflow-single-keys')!=='off');\n const [commandQuery")
s=s.replace(" const commandDialog=", " const mobileDialog=useDialogFocus<HTMLElement>(small&&menu,()=>setMenu(false));\n useEffect(()=>{const media=window.matchMedia('(max-width:760px)'),change=()=>setSmall(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);\n const commandDialog=")
s=s.replace("if(e.key==='?'){", "if(!singleKeys)return;if(e.key==='?'){")
s=s.replace("[props.role,props.onNew,props.onNavigate]", "[props.role,props.onNew,props.onNavigate,singleKeys]")
s=s.replace('<aside data-tour="navigation"', '<aside ref={mobileDialog} {...(small&&!menu?{inert:""}:{})} aria-hidden={small&&!menu?true:undefined} role={small&&menu?"dialog":undefined} aria-modal={small&&menu?true:undefined} aria-label={small&&menu?"Page navigation":undefined} data-tour="navigation"')
s=s.replace('<p className="keyboard-tip">', '<label className="single-key-option"><input type="checkbox" checked={singleKeys} onChange={e=>{setSingleKeys(e.target.checked);localStorage.setItem(\'enforceflow-single-keys\',e.target.checked?\'on\':\'off\');}}/> Enable single-key shortcuts: N, / and ?. Page shortcuts and Ctrl / ⌘ K always work.</label><p className="keyboard-tip">')
s=s.replace("if(e.altKey&&e.shiftKey){", "if(e.altKey&&e.shiftKey){")
s=s.replace("setCommand(true);return;}if(e.altKey", "setHelp(false);setCommand(true);return;}if(e.altKey")
p.write_text(s,encoding='utf-8')
p=Path('src/components/useDialogFocus.ts');s=p.read_text(encoding='utf-8').replace("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex=\"0\"]", "a[href],summary,button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex=\"0\"]");p.write_text(s,encoding='utf-8')
for name in ['src/features/workspaces/EnforcementWorkspace.tsx','src/features/workspaces/ReportRegister.tsx','src/features/workspaces/WorkspacePage.tsx']:
 p=Path(name);s=p.read_text(encoding='utf-8').replace('<div className="portal-table-scroll">','<div className="portal-table-scroll" tabIndex={0} role="region" aria-label="Scrollable records table">');p.write_text(s,encoding='utf-8')
p=Path('server/site-report.js');s=p.read_text(encoding='utf-8');s=s.replace("import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport {parseContent} from './notice-model.js';")
s=s.replace("section('Hearings and proceedings'", """for(const d of (snapshot.Documents??[]).filter(d=>d.Content)){
+  const parsed=parseContent(d.Content),wording=parsed?.entries?.map(e=>e.body).join('\\n\\n')||(!parsed?d.Content:null);
+  if(wording){heading(`Stored document wording - ${d.ReferenceNumber||d.DocumentType}`);line(wording);}
+ }
+ section('Hearings and proceedings'""".replace('\n+','\n'))
p.write_text(s,encoding='utf-8')
