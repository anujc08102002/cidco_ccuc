import {useDesktopNotifications,disconnectDesktop} from './features/account/DesktopNotifications';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,Loader2,X} from 'lucide-react';
import {AppShell,roleNavigation,type View} from './components/AppShell';
import {DemoDialog,type CaseFields} from './components/DemoDialog';
import {WelcomeWalkthrough} from './components/WelcomeWalkthrough';
import {SignIn,accounts,type Role} from './features/auth/SignIn';
import {Dashboard} from './features/dashboard/Dashboard';
import {DriveAlert,DriveDashboard} from './features/dashboard/DriveAnnouncements';
import type {DriveAnnouncement} from './services/enforcementApi';
import {CaseRegister} from './features/cases/CaseRegister';
import {CaseDetail} from './features/cases/CaseDetail';
import {WorkspacePage} from './features/workspaces/WorkspacePage';
import {PublicDisclosure} from './features/public/PublicDisclosure';
import {EnforcementWorkspace} from './features/workspaces/EnforcementWorkspace';
import {LoadState} from './components/PortalUi';
import type {EnforcementCase} from './types';
import {enforcementApi,type AccountNotification} from './services/enforcementApi';

import {defaultPreferences,type PersonalPreferences,type PersonalWorkspace} from '../shared/account-preferences';
import {accountApi,type ContinuityData} from './features/account/accountApi';
import {PersonalizePage} from './features/account/PersonalizePage';
import {ContinuityPage,ContinuityNotice} from './features/account/ContinuityPage';
import {readRoute,routeTo} from './components/navigation';

const walkthroughSeenKey=(username:string,role:Role)=>`cidco-enforcement-walkthrough-v2-${role}-${username}`;
export default function App(){
 const [authenticated,setAuthenticated]=useState(false),[restoring,setRestoring]=useState(true),[sessionError,setSessionError]=useState(false),[role,setRole]=useState<Role>('master');
 const [view,setView]=useState<View>(()=>readRoute().view);
 const [workspace,setWorkspace]=useState<PersonalWorkspace>(()=>({preferences:defaultPreferences(),avatar:null,revision:'initial'})),[accountReady,setAccountReady]=useState(false),[accountError,setAccountError]=useState(''),[accountBusy,setAccountBusy]=useState(false);
 const [previewPreferences,setPreviewPreferences]=useState<PersonalPreferences|null>(null);
 const [continuity,setContinuity]=useState<ContinuityData|null>(null),[continuityKind,setContinuityKind]=useState<'leave'|'transfer'|'review'>('leave');
 const [notifications,setNotifications]=useState<AccountNotification[]>([]),[attention,setAttention]=useState<string[]>([]),[notificationError,setNotificationError]=useState(''),[focusStaff,setFocusStaff]=useState<string|null>(null);
 const [driveData,setDriveData]=useState<{drives:DriveAnnouncement[];notifications:AccountNotification[]}>({drives:[],notifications:[]}),[driveError,setDriveError]=useState('');
 const sessionIdentity=useRef<string|undefined>(undefined);sessionIdentity.current=authenticated?accounts[role].id:undefined;
 useDesktopNotifications(authenticated?accounts[role].id:undefined,workspace.preferences.desktopNotificationSeconds??10);
 const displayPreferences=view==='personalize'&&accountReady?(previewPreferences??workspace.preferences):workspace.preferences;
 const accountEpoch=useRef(0),theme=displayPreferences.theme;
 const [cases,setCases]=useState<EnforcementCase[]>([]),[selected,setSelected]=useState<EnforcementCase|null>(null),[detailTab,setDetailTab]=useState('Case record');
 const [query,setQuery]=useState(''),[node,setNode]=useState('All nodes'),[stage,setStage]=useState('All stages');
 const [newCaseOpen,setNewCaseOpen]=useState(false),[savingCase,setSavingCase]=useState(false),[toast,setToast]=useState('');
 const [showWalkthrough,setShowWalkthrough]=useState(false),[walkthroughTarget,setWalkthroughTarget]=useState<string|null>(null);
 const [connection,setConnection]=useState<'connecting'|'connected'|'offline'>('connecting'),[caseError,setCaseError]=useState(''),[casesLoading,setCasesLoading]=useState(true);
 const requestVersion=useRef(0),refreshRef=useRef<()=>void>(()=>{}),toastTimer=useRef<number>();
 const filtered=useMemo(()=>cases.filter(c=>(node==='All nodes'||c.node===node)&&(stage==='All stages'||c.stage===stage)&&`${c.id} ${c.notice} ${c.property} ${c.owner} ${c.survey} ${c.officer}`.toLowerCase().includes(query.toLowerCase())),[cases,node,stage,query]);
 const notify=(message:string)=>{window.clearTimeout(toastTimer.current);setToast(message);toastTimer.current=window.setTimeout(()=>setToast(''),5000);};
 const signOut=()=>{void disconnectDesktop(accounts[role].id);++accountEpoch.current;setWorkspace({preferences:defaultPreferences(),avatar:null,revision:'initial'});setAccountReady(false);setAccountBusy(false);setAccountError('');setContinuity(null);setNotifications([]);setAttention([]);setFocusStaff(null);setNotificationError('');setToast('');window.clearTimeout(toastTimer.current);enforcementApi.signOut();++requestVersion.current;setAuthenticated(false);setCases([]);setSelected(null);setShowWalkthrough(false);setNewCaseOpen(false);setCaseError('');};
 useEffect(()=>{
  let active=true;
  enforcementApi.restoreSession().then(user=>{if(!active||!user)return;accounts[user.role]={id:user.id,name:user.name,label:user.label,user:user.username};setRole(user.role);setAuthenticated(true);}).catch(e=>{if(!active)return;if(e.status===401)enforcementApi.signOut();else setSessionError(true);}).finally(()=>{if(active)setRestoring(false);});
  const expired=()=>{if(sessionIdentity.current)void disconnectDesktop(sessionIdentity.current);++accountEpoch.current;setNotifications([]);setAttention([]);setContinuity(null);setFocusStaff(null);setNotificationError('');setToast('');window.clearTimeout(toastTimer.current);enforcementApi.signOut();++requestVersion.current;setAuthenticated(false);setCases([]);setSelected(null);setShowWalkthrough(false);};
  window.addEventListener('enforcement:session-expired',expired);return()=>{active=false;window.removeEventListener('enforcement:session-expired',expired);};
 },[]);
 useEffect(()=>{
  if(!authenticated)return;
  let active=true,inFlight=false;
  setConnection('connecting');setCasesLoading(true);setCaseError('');
  const refresh=async()=>{
   if(inFlight)return;inFlight=true;const version=++requestVersion.current;
   try{const saved=await enforcementApi.listCases();if(active&&version===requestVersion.current){setCases(saved);setConnection('connected');setCaseError('');setSelected(current=>current?saved.find(c=>(c.caseKey??c.id)===(current.caseKey??current.id))??null:null);}}
   catch(e){if(active&&version===requestVersion.current){setConnection('offline');setCaseError(e instanceof Error?e.message:'The server could not be reached. Please retry.');}}
   finally{inFlight=false;if(active)setCasesLoading(false);}
  };
  refreshRef.current=()=>void refresh();void refresh();
  const stop=enforcementApi.subscribeChanges(()=>void refresh()),poll=window.setInterval(()=>void refresh(),10000),focus=()=>void refresh();window.addEventListener('focus',focus);
  return()=>{active=false;stop();window.clearInterval(poll);window.removeEventListener('focus',focus);};
 },[authenticated,role]);
 const reloadAccount=async()=>{try{const epoch=accountEpoch.current,value=await accountApi.load();if(epoch!==accountEpoch.current)return;if(!value?.preferences||!value.revision)throw Error('Personal workspace settings could not be loaded. Restart the updated API and retry.');setWorkspace(value);setAccountReady(true);setAccountError('');}catch(error){setAccountError((error as Error).message);}};
 const refreshContinuity=async()=>{const epoch=accountEpoch.current;try{const data=await accountApi.continuity();if(epoch===accountEpoch.current&&Array.isArray(data.records))setContinuity(data);}catch{/* The continuity page displays actionable loading errors. */}};
 useEffect(()=>{if(!authenticated)return;const epoch=++accountEpoch.current;setWorkspace({preferences:defaultPreferences(),avatar:null,revision:'initial'});setAccountReady(false);setAccountError('');void accountApi.load().then(value=>{if(epoch!==accountEpoch.current)return;if(!value?.preferences||!value.revision)throw Error('Personal settings are unavailable. Restart the updated API and retry.');setWorkspace(value);setAccountReady(true);if(!window.location.hash||window.location.hash==='#/'){setView(value.preferences.homePage as View);routeTo(value.preferences.homePage as View);}}).catch(error=>{if(epoch===accountEpoch.current)setAccountError(error.message);});void refreshContinuity();const changed=()=>void refreshContinuity(),timer=window.setInterval(changed,60000);window.addEventListener('enforcement:changed',changed);return()=>{++accountEpoch.current;window.clearInterval(timer);window.removeEventListener('enforcement:changed',changed);};},[authenticated,role]);
 const refreshNotifications=async()=>{const epoch=accountEpoch.current;try{const [items,keys]=await Promise.all([enforcementApi.notifications(),enforcementApi.attention()]);if(epoch===accountEpoch.current){setNotifications(Array.isArray(items)?items:[]);setAttention(Array.isArray(keys)?keys:[]);setNotificationError('');}}catch{if(epoch===accountEpoch.current)setNotificationError('Account notifications could not be loaded. Retry to see current messages.');}};
 const refreshDrives=async()=>{const epoch=accountEpoch.current;try{const data=await enforcementApi.driveAnnouncements();if(epoch===accountEpoch.current){if(!Array.isArray(data.drives)||!Array.isArray(data.notifications))throw Error('Drive announcements are unavailable.');setDriveData(data);setDriveError('');}}catch{if(epoch===accountEpoch.current)setDriveError('Drive announcements could not be loaded. Please retry.');}};
 useEffect(()=>{setDriveData({drives:[],notifications:[]});setDriveError('');if(!authenticated)return;void refreshDrives();const refresh=()=>void refreshDrives(),timer=window.setInterval(refresh,15000);window.addEventListener('enforcement:changed',refresh);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('enforcement:changed',refresh);window.removeEventListener('focus',refresh);};},[authenticated,role]);
 useEffect(()=>{if(!authenticated)return;setNotifications([]);setAttention([]);setNotificationError('');void refreshNotifications();const refresh=()=>void refreshNotifications(),timer=window.setInterval(refresh,15000);window.addEventListener('enforcement:changed',refresh);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('enforcement:changed',refresh);window.removeEventListener('focus',refresh);};},[authenticated,role]);
 const savePersonal=async(preferences:PersonalPreferences)=>{if(!accountReady)throw Error('Load your personal settings before saving.');if(accountBusy)throw Error('Wait for the current account update to finish.');const epoch=accountEpoch.current;setAccountBusy(true);try{const saved=await accountApi.save(preferences,workspace.revision);if(epoch===accountEpoch.current)setWorkspace(saved);}finally{if(epoch===accountEpoch.current)setAccountBusy(false);}};
 const savePersonalPatch=(patch:Partial<PersonalPreferences>)=>savePersonal({...workspace.preferences,...patch});
 const savePhoto=async(image:string|null)=>{if(!accountReady||accountBusy)throw Error('Wait for your account settings to finish loading or saving.');const epoch=accountEpoch.current;setAccountBusy(true);try{const saved=await accountApi.photo(image,workspace.revision);if(epoch===accountEpoch.current)setWorkspace(saved);}finally{if(epoch===accountEpoch.current)setAccountBusy(false);}};
 const [registerReturn,setRegisterReturn]=useState<'register'|'archived'>('register');
 const navigate=(next:View)=>{if(next!=='detail'&&next!=='public'&&!roleNavigation[role].has(next))return;if(next==='archived'&&role!=='master')return;if(next==='archived'){setQuery('');setNode('All nodes');setStage('All stages');}setView(next);if(next!=='detail')routeTo(next);window.scrollTo({top:0,behavior:'instant'});};
 const openContinuity=(kind:'leave'|'transfer'|'review')=>{setContinuityKind(kind);navigate('continuity');};
 const openCase=(item:EnforcementCase,tab='Case record')=>{setRegisterReturn(view==='archived'?'archived':'register');setSelected(item);setDetailTab(tab);navigate('detail');routeTo('detail',item.caseKey??item.id,tab);};
 useEffect(()=>{
  if(!authenticated)return;
  const sync=()=>{const route=readRoute();if(route.view!=='detail'&&route.view!=='public'&&!roleNavigation[role].has(route.view)){setView('dashboard');routeTo('dashboard');return;}setView(route.view);if(route.view==='detail'){setDetailTab(route.tab);setSelected(cases.find(c=>(c.caseKey??c.id)===route.key)??null);}};
  sync();window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);
 },[authenticated,role,cases]);
 useEffect(()=>{if(!authenticated)return;document.title=`${view==='detail'?selected?.id??'Case record':view.charAt(0).toUpperCase()+view.slice(1)} | EnforceFlow`;const frame=requestAnimationFrame(()=>document.getElementById('main-content')?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[view,authenticated]);
 const caseChanged=(item:EnforcementCase|null,key:string)=>{++requestVersion.current;setCases(current=>item?current.map(c=>(c.caseKey??c.id)===key?item:c):current.filter(c=>(c.caseKey??c.id)!==key));setSelected(current=>current&&(current.caseKey??current.id)===key?item:current);if(!item&&view==='detail')navigate(registerReturn);};
 const createCase=(property:string,cuc?:string,_start?:string,_end?:string,_action?:string,fields?:CaseFields)=>{
  if(savingCase)return;setSavingCase(true);
  const item:EnforcementCase={id:'',property,sector:fields?.sector??'',node:fields?.node??'',owner:fields?.owner??'',survey:fields?.survey??'',notice:'Draft',legal:false,status:'In progress',updated:'Awaiting CUC verification',stage:'1. Site Survey & Enforcement Case Creation',officer:cuc??'',surveyor:accounts[role].name,assignedCuc:cuc??'',constructionType:fields?.constructionType,plotNumber:fields?.plotNumber,village:fields?.village,latitude:fields?.latitude,longitude:fields?.longitude,siteAddress:fields?.siteAddress,locationSource:fields?.locationSource,locationAccuracyMetres:fields?.locationAccuracyMetres,locationCapturedAt:fields?.locationCapturedAt,priority:fields?.priority??'Normal',violationDescription:fields?.violationDescription??'',applicableSections:fields?.applicableSections??[]};
  enforcementApi.createCase(item,{cucId:fields?.cucId}).then(saved=>{++requestVersion.current;setCases(current=>[saved,...current.filter(c=>c.id!==saved.id)]);setNewCaseOpen(false);openCase(saved);notify(`Case ${saved.id} submitted for CUC verification.`);}).catch(e=>notify(e instanceof Error?e.message:'The case could not be saved.')).finally(()=>setSavingCase(false));
 };
 if(restoring)return <div className="session-state" role="status"><Loader2 className="portal-spin" size={22}/> Restoring your session…</div>;
 if(sessionError)return <div className="session-state"><div className="portal-message is-error"><div><b>Unable to reconnect</b><p>Your session is retained. Check the server connection and try again.</p></div><button className="action-primary" onClick={()=>window.location.reload()}>Retry connection</button></div></div>;
 if(!authenticated&&window.location.pathname==='/public')return <PublicDisclosure onBack={()=>{window.location.href='/'}}/>;
 if(!authenticated)return <SignIn onSuccess={(nextRole,name)=>{setRole(nextRole);accounts[nextRole].name=name;setAuthenticated(true);setView(readRoute().view);setShowWalkthrough(window.localStorage.getItem(walkthroughSeenKey(accounts[nextRole].user,nextRole))!=='true');}}/>;

 let content;
 if(view==='public')content=<PublicDisclosure onBack={()=>navigate('dashboard')}/>;
 else if(view==='dashboard')content=<><LoadState loading={casesLoading&&!cases.length}/>{(!casesLoading||cases.length>0)&&<Dashboard driveContent={<DriveDashboard drives={driveData.drives} error={driveError} onRetry={()=>void refreshDrives()}/>} cases={cases.filter(c=>!c.archived)} mapCases={cases.filter(c=>!c.archived)} role={role} onOpen={openCase} onNavigate={navigate} preferences={workspace.preferences} onCustomize={()=>navigate('personalize')} onLeave={()=>openContinuity('leave')} onTransfer={()=>openContinuity('transfer')}/>}</>;
 else if(view==='detail'&&!selected&&!casesLoading&&!caseError&&readRoute().key)content=<div className="portal-message is-warning" role="status"><div><b>This case is unavailable</b><p>It may have been removed, archived or assigned outside your access. Return to the register to find an accessible case.</p></div><button className="action-primary" onClick={()=>navigate('register')}>Open case register</button></div>;
 else if(view==='register'||view==='archived'&&role==='master'||view==='detail'&&!selected)content=<><LoadState loading={casesLoading&&!cases.length} error={caseError} onRetry={()=>refreshRef.current()}/>{(!casesLoading||cases.length>0)&&<CaseRegister key={view} initialArchiveScope={view==='archived'?'archived':'active'} cases={filtered} query={query} node={node} stage={stage} role={role} onQuery={setQuery} onNode={setNode} onStage={setStage} onOpen={openCase} onCaseChanged={caseChanged} onNotify={notify}/>}</>;
 else if(view==='detail'&&selected)content=<CaseDetail key={selected.caseKey??selected.id} item={selected} role={role} initialTab={detailTab} onBack={()=>navigate(registerReturn)} onApproved={approved=>{caseChanged(approved,selected.caseKey??selected.id);notify(approved.currentStage===4?'Case approved for notice preparation.':'Case verified and forwarded for CCUC approval.');}} onLegal={()=>setDetailTab('Legal & routing')} onCaseChanged={item=>caseChanged(item,selected.caseKey??selected.id)} onNotify={notify}/>;
 else if(view==='personalize')content=accountReady?<PersonalizePage driveContent={<DriveDashboard drives={driveData.drives} error={driveError} onRetry={()=>void refreshDrives()}/>} key={accounts[role].id} role={role} cases={cases.filter(c=>!c.archived)} onPreview={setPreviewPreferences} workspace={workspace} onSave={savePersonal} onPhoto={savePhoto} busy={accountBusy} error={accountError} onReload={()=>void reloadAccount()}/>:<LoadState loading={!accountError} error={accountError} onRetry={()=>void reloadAccount()}/>;
 else if(view==='continuity')content=<ContinuityPage role={role} initialKind={continuityKind} onChanged={()=>{void refreshContinuity();refreshRef.current();}}/>;
 else if(view==='staff')content=<WorkspacePage focusUserId={focusStaff} kind="staff" role={role} onAction={()=>{}} onNotify={notify}/>;
 else content=<EnforcementWorkspace key={view} kind={view} role={role} cases={cases.filter(c=>!c.archived)} onOpen={openCase} casesLoading={casesLoading} caseError={caseError} onRetryCases={()=>refreshRef.current()}/>;
 return <AppShell notifications={[...driveData.notifications,...notifications]} notificationError={notificationError} attentionKeys={attention} onRefreshNotifications={()=>void refreshNotifications()} onOpenNotification={item=>{if(item.kind==='drive')navigate('dashboard');if(item.kind==='recovery'&&role==='master'){setFocusStaff(item.userId??null);navigate('staff');}}} onDismissNotification={item=>{void enforcementApi.dismissNotification(item.id).then(()=>refreshNotifications()).catch(error=>notify(error.message));}} view={view} role={role} theme={theme} preferences={displayPreferences} avatar={workspace.avatar} onPreferences={patch=>savePersonalPatch(patch).catch(error=>notify(error.message))} onLeave={()=>openContinuity('leave')} onTransferRequest={()=>openContinuity('transfer')} continuityNotificationIds={continuity?.records.filter(r=>r.sourceUserId!==accounts[role].id&&(r.eligible||r.status==='Return requested')).map(r=>`continuity:${r.id}:${r.status}`)} continuityCount={continuity?.records.filter(r=>r.sourceUserId!==accounts[role].id&&(r.eligible||r.status==='Return requested')).length??0} walkthroughTarget={showWalkthrough?walkthroughTarget:null} dataMode={connection==='connected'?'Connected':connection==='connecting'?'Connecting…':'Connection interrupted'} onTheme={()=>void savePersonalPatch({theme:theme==='light'?'dark':'light'}).catch(error=>notify(error.message))} onNavigate={navigate} onSignOut={signOut} onNew={()=>setNewCaseOpen(true)} search={query} onSearch={setQuery} cases={cases} onOpenCase={openCase} onRetryConnection={()=>refreshRef.current()}>
  <ContinuityNotice data={continuity} role={role} onOpen={()=>openContinuity(['master','ccuc'].includes(role)?'review':'leave')}/>{accountError&&view!=='personalize'&&<div className="portal-message is-warning"><div><b>Personal settings unavailable</b><p>{accountError}</p></div><button className="action-secondary" onClick={()=>void reloadAccount()}>Retry</button></div>}
  {content}<DriveAlert key={'drive-alert:'+accounts[role].id} userId={accounts[role].id??role} items={driveData.notifications} enabled={!showWalkthrough} onDashboard={()=>navigate('dashboard')}/>
  {toast&&<div className="premium-toast" role="status"><Check size={15}/><span>{toast}</span><button aria-label="Dismiss message" onClick={()=>setToast('')}><X size={14}/></button></div>}
  {newCaseOpen&&<DemoDialog busy={savingCase} type="new" onClose={()=>{if(!savingCase)setNewCaseOpen(false);}} onConfirm={createCase}/>}
  {showWalkthrough&&<WelcomeWalkthrough role={role} roleLabel={accounts[role].label} onTargetChange={setWalkthroughTarget} onClose={()=>{localStorage.setItem(walkthroughSeenKey(accounts[role].user,role),'true');setShowWalkthrough(false);setWalkthroughTarget(null);}}/>}
 </AppShell>;
}
