from pathlib import Path
p=Path('src/features/dashboard/Dashboard.tsx');s=p.read_text(encoding='utf-8')
s="import {Children,isValidElement} from 'react';\nimport {CalendarDays,Settings2,ArrowLeftRight} from 'lucide-react';\nimport {defaultPreferences,type PersonalPreferences} from '../../../shared/account-preferences';\n"+s
a=s.index('export function Dashboard(');b=s.index(' const urgent=',a)
s=s[:a]+'''export function Dashboard({cases,mapCases=cases,role,onOpen,onNavigate,preferences=defaultPreferences(),onCustomize,onLeave,onTransfer}:{cases:EnforcementCase[];mapCases?:EnforcementCase[];role:Role;onOpen:(c:EnforcementCase)=>void;onNavigate:(v:View)=>void;preferences?:PersonalPreferences;onCustomize?:()=>void;onLeave?:()=>void;onTransfer?:()=>void}){
'''+s[b:]
a=s.index(' return <div className="dashboard-scene">');b=s.index('  <section className="hero-board">',a)
s=s[:a]+" const content=<div>\n"+s[b:]
for cls,id in [('hero-board','hero'),('dashboard-shortcuts','shortcuts'),('signal-strip','metrics'),('dashboard-operations','operations'),('insight-grid','insights')]:
 s=s.replace('className="'+cls+'"','className="'+cls+'" data-widget="'+id+'"')
s=s.replace('<h2>{brief.line}<br/><em>{brief.accent}</em></h2>', '<h2>{preferences.dashboardTitle||<>{brief.line}<br/><em>{brief.accent}</em></>}</h2>')
s=s.replace(' </div>;\n}', ''' </div>;
 const widgets=Children.toArray(content.props.children).filter(node=>isValidElement<{'data-widget':string}>(node)&&!preferences.hiddenWidgets.includes(node.props['data-widget'])).sort((a,b)=>{const rank=(node:unknown)=>isValidElement<{'data-widget':string}>(node)?preferences.dashboardOrder.indexOf(node.props['data-widget']):0;return rank(a)-rank(b);});
 return <><div className="dashboard-account-tools"><span>Your workspace</span><div><button className="action-secondary" onClick={onLeave}><CalendarDays size={15}/> Leave / holidays</button><button className="action-secondary" onClick={onTransfer}><ArrowLeftRight size={15}/> Request transfer</button><button className="action-secondary" onClick={onCustomize}><Settings2 size={15}/> Customize dashboard</button></div></div><div className="dashboard-scene" data-layout={preferences.dashboardLayout}>{widgets.length?widgets:<div className="portal-message"><div><b>Your dashboard sections are hidden</b><p>Choose the sections you want to see in My workspace.</p></div><button className="action-primary" onClick={onCustomize}>Customize dashboard</button></div>}</div></>;
}''')
p.write_text(s,encoding='utf-8')
