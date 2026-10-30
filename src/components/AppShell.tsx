import {useNotificationInbox} from '../features/account/useNotificationInbox';
import {accountNotificationId,caseNotificationId} from '../../shared/notification-inbox';
import {DesktopNotificationControls} from '../features/account/DesktopNotifications';
import type {AccountNotification} from '../services/enforcementApi';

import {Fragment,useEffect,useState,type ReactNode} from 'react';

import {Archive,ArrowLeft,ArrowRight,BarChart3,Bell,Building2,CalendarDays,ClipboardList,FileText,Gavel,LayoutDashboard,MapPin,Menu,Moon,Keyboard,Search,Settings,ShieldCheck,Sun,Users,X} from 'lucide-react';

import {cidcoLogo} from '../assets/cidcoLogo';

import {accounts,type Role} from '../features/auth/SignIn';

import type {EnforcementCase} from '../types';

import {EmptyState} from './PortalUi';

import {defaultPreferences,rolePages} from '../../shared/account-preferences';

import type {PersonalPreferences} from '../../shared/account-preferences';

import {pageHelp} from './navigation';

import {useDialogFocus} from './useDialogFocus';



export type View='dashboard'|'register'|'detail'|'surveys'|'documents'|'hearings'|'legal'|'demolition'|'complaints'|'reports'|'staff'|'settings'|'public'|'archived'|'personalize'|'continuity';

const nav=[['dashboard','Overview',LayoutDashboard],['register','Case register',ClipboardList],['surveys','Site surveys',MapPin],['documents','Notices & orders',FileText],['hearings','Hearings',CalendarDays],['legal','Legal tracking',Gavel],['demolition','Demolition',Building2],['complaints','References & complaints',Archive],['reports','Reports & exports',BarChart3],['staff','People & access',Users],['settings','Settings',Settings],['public','Public disclosure',ShieldCheck],['archived','Archived cases',Archive],['continuity','Leave & transfers',CalendarDays],['personalize','My workspace',Settings]] as const;

export const roleNavigation=Object.fromEntries(Object.entries(rolePages).map(([role,pages])=>[role,new Set(pages as View[])])) as Record<Role,Set<View>>;

type Props={notifications?:AccountNotification[];notificationError?:string;attentionKeys?:string[];onRefreshNotifications?:()=>void;onOpenNotification?:(item:AccountNotification)=>void;onDismissNotification?:(item:AccountNotification)=>void;preferences?:PersonalPreferences;avatar?:string|null;onPreferences?:(patch:Partial<PersonalPreferences>)=>Promise<void>;onLeave?:()=>void;onTransferRequest?:()=>void;continuityCount?:number;continuityNotificationIds?:string[];children:ReactNode;view:View;role:Role;theme:'light'|'dark';dataMode:string;onTheme:()=>void;onNavigate:(view:View)=>void;onSignOut:()=>void;onNew:()=>void;search:string;onSearch:(value:string)=>void;walkthroughTarget?:string|null;cases?:EnforcementCase[];onOpenCase?:(c:EnforcementCase)=>void;onRetryConnection?:()=>void};

export function AppShell(props:Props){

 const prefs=props.preferences??defaultPreferences();

 const [small,setSmall]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:760px)').matches);

 const singleKeys=prefs.singleKeys;

 const setSingleKeys=(value:boolean)=>{void props.onPreferences?.({singleKeys:value});};

 const [commandQuery,setCommandQuery]=useState(''),[help,setHelp]=useState(false);

 const helpDialog=useDialogFocus<HTMLElement>(help,()=>setHelp(false));

 const [rail,setRail]=useState(false),[menu,setMenu]=useState(false),[command,setCommand]=useState(false),[notices,setNotices]=useState(false),[profile,setProfile]=useState(false);

 useEffect(()=>setRail(prefs.sidebarCollapsed),[prefs.sidebarCollapsed]);

 const mobileDialog=useDialogFocus<HTMLElement>(small&&menu,()=>setMenu(false));

 useEffect(()=>{const media=window.matchMedia('(max-width:760px)'),change=()=>setSmall(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);

 const commandDialog=useDialogFocus<HTMLElement>(command,()=>setCommand(false));

 const allAlerts=(props.cases??[]).filter(c=>!c.archived&&c.status!=='Closed'&&(props.attentionKeys===undefined?(c.legal||(c.overdueDays??0)>0):props.attentionKeys.includes(c.caseKey??c.id)));

 const continuityIds=props.continuityNotificationIds??(props.continuityCount?['continuity:'+props.continuityCount]:[]);
 const ids=[...(props.notifications??[]).map(accountNotificationId),...allAlerts.map(caseNotificationId),...continuityIds];
 const inbox=useNotificationInbox(accounts[props.role].id??props.role,ids,prefs.notificationRetentionMinutes??1440);
 const notifications=(props.notifications??[]).filter(item=>inbox.visible(accountNotificationId(item)));
 const alerts=allAlerts.filter(item=>inbox.visible(caseNotificationId(item)));
 const visibleContinuity=continuityIds.filter(id=>inbox.visible(id));
 const noticeCount=ids.filter(id=>inbox.unread(id)).length;

 const searchResults=(props.cases??[]).filter(c=>(props.role==='master'||!c.archived)&&`${c.id} ${c.property} ${c.owner} ${c.notice} ${c.survey} ${c.officer}`.toLowerCase().includes(commandQuery.toLowerCase())).slice(0,5);

 const navGroup=(id:View)=>['dashboard','register','surveys'].includes(id)?'Workspace':['documents','hearings','legal','demolition','complaints'].includes(id)?'Case management':'Administration';

 const authorized=nav.filter(([id])=>roleNavigation[props.role].has(id));

 const available=authorized.filter(([id])=>!prefs.hiddenNav.includes(id)).sort((a,b)=>{const rank=(id:string)=>{const index=prefs.navOrder.indexOf(id);return index<0?prefs.navOrder.length+nav.findIndex(row=>row[0]===id):index;};return rank(a[0])-rank(b[0]);});

 const pageResults=authorized.filter(([id,label])=>`${label} ${pageHelp[id].description}`.toLowerCase().includes(commandQuery.toLowerCase()));

 const navigate=(view:View)=>{setHelp(false);props.onNavigate(view);setMenu(false);setCommand(false);setProfile(false);setNotices(false);setCommandQuery('');};

 useEffect(()=>{

  const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setHelp(false);setCommand(true);return;}if(e.altKey&&e.shiftKey){const page=authorized.find(([id])=>pageHelp[id].key===e.key.toLowerCase());if(page){e.preventDefault();navigate(page[0]);return;}}if(e.key==='Escape'){setCommand(false);setNotices(false);setMenu(false);setProfile(false);return;}const typing=e.target instanceof HTMLElement&&(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT','SUMMARY'].includes(e.target.tagName));if(document.querySelector('[aria-modal="true"]'))return;if(typing||e.ctrlKey||e.metaKey||e.altKey)return;if(!singleKeys)return;if(e.key==='?'){e.preventDefault();setHelp(true);return;}if(e.key.toLowerCase()==='n'&&['master','surveyor'].includes(props.role)){e.preventDefault();props.onNew();}if(e.key==='/'){e.preventDefault();setCommand(true);}};

  window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);

 },[props.role,props.onNew,props.onNavigate,singleKeys,prefs.hiddenNav,prefs.navOrder]);

 useEffect(()=>{const target=props.walkthroughTarget;if(target===undefined)return;setProfile(Boolean(target&&['leave','transfer','public-access'].includes(target)));setMenu(Boolean(target&&(target==='navigation'||target.startsWith('nav-'))&&window.innerWidth<=760));},[props.walkthroughTarget]);

 const title=nav.find(x=>x[0]===props.view)?.[1]??(props.view==='archived'?'Archived cases':'Case record');

 const state=/interrupted|unavailable/i.test(props.dataMode)?'offline':/connecting/i.test(props.dataMode)?'connecting':'connected';

 return <div className={`new-shell ${rail?'rail-mini':''}`} data-theme={props.theme} data-accent={prefs.accent} data-sidebar={prefs.sidebarSide} data-density={prefs.density} data-text-size={prefs.textSize} data-content-width={prefs.contentWidth} data-card-style={prefs.cardStyle} data-motion={prefs.motion}>

  <a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>Skip to page content</a><header className="masthead"><button className="mobile-trigger" aria-label="Open navigation" aria-expanded={menu} data-tour="mobile-navigation" onClick={()=>setMenu(!menu)}><Menu size={19}/></button><div className="mast-brand"><img src={cidcoLogo} alt="CIDCO"/><div><b>EnforceFlow</b><small>CIDCO · Enforcement Operations</small></div></div><button className="global-command" data-tour="search" onClick={()=>setCommand(true)}><Search size={16}/><span>Find a page, case or property</span><kbd>Ctrl K</kbd></button><div className="mast-actions"><button onClick={()=>setHelp(true)} aria-label="Keyboard shortcuts and help"><Keyboard size={18}/></button><button onClick={props.onTheme} aria-label={props.theme==='light'?'Switch to dark theme':'Switch to light theme'}>{props.theme==='light'?<Moon size={17}/>:<Sun size={17}/>}</button><button className="bell" data-tour="notifications" onClick={()=>{setNotices(!notices);setProfile(false);if(!notices)props.onRefreshNotifications?.();}} aria-label={`Notifications${noticeCount?`, ${noticeCount} unread notifications`:''}`} aria-expanded={notices}><Bell size={17}/>{noticeCount>0&&<i>{noticeCount>9?'9+':noticeCount}</i>}</button><button className="profile-chip" data-tour="account" onClick={()=>{setProfile(!profile);setNotices(false);}} aria-expanded={profile} aria-label="Open account menu"><span>{props.avatar?<img src={props.avatar} alt="Your profile"/>:accounts[props.role].name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span><div><b>{accounts[props.role].name}</b><small title={accounts[props.role].label}>{accounts[props.role].label}</small></div></button></div></header>

  <aside ref={mobileDialog} {...(small&&!menu?{inert:""}:{})} aria-hidden={small&&!menu?true:undefined} role={small&&menu?"dialog":undefined} aria-modal={small&&menu?true:undefined} aria-label={small&&menu?"Page navigation":undefined} data-tour="navigation" className={`nav-rail ${menu?'mobile-open':''}`}><div className="rail-top"><button className="rail-collapse" aria-label={rail?'Expand navigation':'Collapse navigation'} onClick={()=>{if(props.onPreferences)void props.onPreferences({sidebarCollapsed:!rail});else setRail(!rail);}}>{rail?<ArrowRight size={13}/>:<ArrowLeft size={13}/>}<span>Collapse</span></button></div><nav aria-label="Department navigation">{available.map(([id,label,Icon],index)=><Fragment key={id}>{(index===0||!prefs.navOrder.length&&navGroup(available[index-1][0])!==navGroup(id))&&<span className="nav-group-label">{prefs.navOrder.length?'My navigation':navGroup(id)}</span>}<button data-tour={`nav-${id}`} title={`${label} · Alt + Shift + ${pageHelp[id].key.toUpperCase()}`} aria-keyshortcuts={`Alt+Shift+${pageHelp[id].key.toUpperCase()}`} className={props.view===id?'active':''} aria-current={props.view===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={18}/><b>{label}</b><span className="nav-number">{pageHelp[id].key.toUpperCase()}</span></button></Fragment>)}</nav><button className="rail-help-card" onClick={()=>setHelp(true)}><Keyboard size={18}/><span><b>A little help, anytime</b><small>Keyboard shortcuts & navigation</small></span><ArrowRight size={15}/></button></aside>

  {menu&&<button className="nav-scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}

  <div className="workspace-top"><div><span className="workspace-breadcrumb">Workspace <span>/</span> {title}</span><h1>{title}</h1></div><div><span className="sync-state" role="status" data-state={state}><i/> {props.dataMode}</span>{['surveyor','master'].includes(props.role)&&<button className="action-primary" data-tour="new-case" onClick={props.onNew}>+ New case</button>}</div></div>

  <main key={props.view} id="main-content" className="work-canvas" tabIndex={-1} aria-label={title}><div className="page-guidance"><span className="guidance-dot"/><p>{pageHelp[props.view].description}</p><button onClick={()=>setHelp(true)}>Keyboard help <kbd>?</kbd></button></div>{state==='offline'&&<div className="portal-message is-warning portal-connection-banner"><ShieldCheck size={18}/><div><b>Connection interrupted</b><p>Displayed records may be out of date. Reconnect before making changes.</p></div><button className="action-secondary" onClick={props.onRetryConnection}>Reconnect</button></div>}{props.children}</main>

  {profile&&<><button className="portal-menu-scrim" aria-label="Close account menu" onClick={()=>setProfile(false)}/><section className="profile-menu" aria-label="Profile and account options"><header><span className="profile-avatar">{props.avatar?<img src={props.avatar} alt="Your profile"/>:accounts[props.role].name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span><div><span>DEPARTMENT ACCOUNT</span><b>{accounts[props.role].name}</b><small>{accounts[props.role].label}</small></div><button onClick={()=>setProfile(false)} aria-label="Close account options"><X size={16}/></button></header><p>Access your assigned cases and authorized public records.</p><button onClick={()=>navigate('personalize')}><Settings size={16}/><span><b>My profile & workspace</b><small>Photo, layout, sidebar and appearance</small></span></button><button data-tour="leave" onClick={()=>{setProfile(false);props.onLeave?.();}}><CalendarDays size={16}/><span><b>Leave / holidays</b><small>Record your absence or return to duty</small></span></button><button data-tour="transfer" onClick={()=>{setProfile(false);props.onTransferRequest?.();}}><Users size={16}/><span><b>Request transfer</b><small>Submit for administrator verification</small></span></button><button onClick={()=>navigate('register')}><ClipboardList size={16}/><span><b>My case register</b><small>View assigned cases and deadlines</small></span></button>{['ccuc','cuc','master'].includes(props.role)&&<button onClick={()=>navigate('continuity')}><Users size={16}/><span><b>Case responsibility</b><small>Open a case to manage routing or authorized charge</small></span></button>}{props.role==='master'&&<button onClick={()=>navigate('archived')}><Archive size={16}/><span><b>Archived cases</b><small>{(props.cases??[]).filter(c=>c.archived).length} archived · manage duration or restore cases</small></span></button>}<button data-tour="public-access" onClick={()=>navigate('public')}><ShieldCheck size={16}/><span><b>Public disclosure</b><small>Search published notices and orders</small></span></button><button className="profile-signout" onClick={props.onSignOut}><X size={16}/><span><b>Sign out</b><small>End this session</small></span></button></section></>}

  {command&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCommand(false);}}><section ref={commandDialog} className="command-box" role="dialog" aria-modal="true" aria-label="Search and navigation"><div><Search size={18}/><input autoFocus aria-label="Find a page or case" value={commandQuery} onChange={e=>setCommandQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){if(pageResults.length===1)navigate(pageResults[0][0]);else if(searchResults.length===1&&commandQuery){props.onOpenCase?.(searchResults[0]);setCommand(false);}else{props.onSearch(commandQuery);navigate('register');}}}} placeholder="Type a page name, case number, property or owner…"/><button onClick={()=>setCommand(false)} aria-label="Close search">ESC</button></div>{commandQuery&&<><span>MATCHING CASES</span>{searchResults.length?searchResults.map(c=><button key={c.id} onClick={()=>{props.onOpenCase?.(c);setCommand(false);}}><span>{c.id}<small>{c.property} · {c.node}</small></span><ArrowRight size={14}/></button>):<p className="portal-command-empty">No matching cases. Press Enter to open the register.</p>}</>}<span>QUICK NAVIGATION</span>{pageResults.map(([id,label,Icon])=><button key={id} onClick={()=>navigate(id)}><span><Icon size={16}/><span>{label}<small>{pageHelp[id].description}</small></span></span><kbd>Alt ⇧ {pageHelp[id].key.toUpperCase()}</kbd></button>)}</section></div>}

  {help&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setHelp(false);}}><section ref={helpDialog} className="keyboard-dialog" role="dialog" aria-modal="true" aria-labelledby="keyboard-title"><header><div><span className="section-index">YOUR WORKSPACE GUIDE</span><h2 id="keyboard-title">Every page, within reach.</h2></div><button className="action-secondary" onClick={()=>setHelp(false)} aria-label="Close keyboard help"><X size={18}/></button></header><p>Press <kbd>Tab</kbd> to move between controls, <kbd>Enter</kbd> to activate and <kbd>Esc</kbd> to close a dialog. Use arrow keys within case tabs.</p><div className="shortcut-basics"><span>Find any page or case <kbd>Ctrl / ⌘ K</kbd></span><span>Show this guide <kbd>?</kbd></span>{['master','surveyor'].includes(props.role)&&<span>Register a new case <kbd>N</kbd></span>}</div><h3>Go directly to a page</h3><p>Hold Alt + Shift and press the letter shown.</p><div className="shortcut-grid">{available.map(([id,label,Icon])=><button key={id} onClick={()=>{navigate(id);setHelp(false);}}><Icon size={17}/><span>{label}</span><kbd>{pageHelp[id].key.toUpperCase()}</kbd></button>)}</div><label className="single-key-option"><input type="checkbox" checked={singleKeys} onChange={e=>{setSingleKeys(e.target.checked);}}/> Enable single-key shortcuts: N, / and ?. Page shortcuts and Ctrl / ⌘ K always work.</label><p className="keyboard-tip">You can also bookmark any page or case. Your access permissions still apply.</p></section></div>}

  {notices&&<><button className="portal-menu-scrim" aria-label="Close notifications" onClick={()=>setNotices(false)}/><section className="notice-drawer" aria-label="Case notifications"><header><div><span>YOUR NOTIFICATIONS</span><b>Notifications</b></div><button aria-label="Close notification panel" onClick={()=>setNotices(false)}><X size={17}/></button></header><DesktopNotificationControls userId={accounts[props.role].id} durationSeconds={prefs.desktopNotificationSeconds??10}/><div className="notification-list-controls"><button type="button" className="action-quiet" disabled={!noticeCount} onClick={()=>inbox.markRead(ids)}>Mark all as read</button><button type="button" className="action-quiet" onClick={()=>navigate('personalize')}>Notification settings</button></div>{props.notificationError&&<div className="notification-load-error"><p>{props.notificationError}</p><button className="action-secondary" onClick={props.onRefreshNotifications}>Retry notifications</button></div>}{notifications.map(item=><div key={item.id} className="account-notification" data-unread={inbox.unread(accountNotificationId(item))}><button onClick={()=>{inbox.markRead([accountNotificationId(item)]);props.onOpenNotification?.(item);if(item.kind==='recovery'||item.kind==='drive')setNotices(false);}}><ShieldCheck size={16}/>{inbox.unread(accountNotificationId(item))&&<i className="notification-unread-dot" aria-label="Unread notification"/>}<span>{item.title}<small>{item.kind==='recovery'?(item.status==='Mismatch'?`Details mismatch · submitted email: ${item.submittedEmail}`:`${item.email??'Email not registered'} · open People & access`):item.kind==='drive'?`${item.node} · ${item.plannedAt?new Date(item.plannedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):''} IST · ${item.details}`:'This message is for your account'}</small></span>{item.kind==='recovery'&&<ArrowRight size={14}/>}</button>{(item.kind==='account'||item.status==='Mismatch')&&<button className="notification-dismiss" aria-label={`Dismiss ${item.title}`} onClick={()=>props.onDismissNotification?.(item)}>Dismiss</button>}</div>)}{visibleContinuity.length>0&&<button data-unread={visibleContinuity.some(id=>inbox.unread(id))} onClick={()=>{inbox.markRead(visibleContinuity);navigate('continuity');}}><CalendarDays size={16}/>{visibleContinuity.some(id=>inbox.unread(id))&&<i className="notification-unread-dot" aria-label="Unread notification"/>}<span>Staff continuity<small>{visibleContinuity.length} request(s) need review</small></span><ArrowRight size={14}/></button>}{alerts.length?alerts.slice(0,8).map(c=><button key={c.id} data-unread={inbox.unread(caseNotificationId(c))} onClick={()=>{inbox.markRead([caseNotificationId(c)]);props.onOpenCase?.(c);setNotices(false);}}><i aria-label={inbox.unread(caseNotificationId(c))?'Unread notification':undefined} className={inbox.unread(caseNotificationId(c))?(c.legal?'danger':''):'notification-read-dot'}/><span>{c.id}<small>{c.legal?'Legal restriction requires review':(c.overdueDays??0)>0?`${c.overdueDays} days overdue · ${c.property}`:`${c.status==='Awaiting approval'?'Approval or verification required':'Action required'} - ${c.property}`}</small></span><ArrowRight size={14}/></button>):!visibleContinuity.length&&!notifications.length&&!props.notificationError&&<EmptyState title="You're up to date" description="There are no account messages or case alerts requiring your attention."/>}</section></>}

 </div>;

}

