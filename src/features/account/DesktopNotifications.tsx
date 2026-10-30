import {useEffect,useRef,useState} from 'react';
import {BellRing} from 'lucide-react';
import {baseUrl,request} from '../../services/enforcementApi';
import {playNotificationSound} from './notificationSound';

const storageKey='enforceflow-desktop-device';
type Device={userId:string;binding:string;endpoint:string;sound:boolean;subscription:PushSubscriptionJSON;mode?:'local';seen?:string[];tested?:boolean};
type FeedItem={id:string;title:string;url:string};
const device=():Device|null=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null');}catch{return null;}};
const supported=()=>typeof window!=='undefined'&&window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
let audio:AudioContext|null=null;
let shutdown:Promise<void>=Promise.resolve();
async function unlockAudio(){audio??=new AudioContext();await audio.resume();}
function chime(){if(audio?.state==='running')playNotificationSound(audio);}
async function worker(){await navigator.serviceWorker.register('/notification-worker.js',{scope:'/'});return navigator.serviceWorker.ready;}
async function message(reg:ServiceWorkerRegistration,data:object){await new Promise<void>((resolve,reject)=>{const channel=new MessageChannel(),timeout=window.setTimeout(()=>reject(Error('System notification setup timed out. Please retry.')),6000);channel.port1.onmessage=()=>{window.clearTimeout(timeout);resolve();};reg.active?.postMessage(data,[channel.port2]);});}
function keyBytes(value:string){const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}

async function disconnectNow(userId?:string){
 const saved=device();if(!saved||userId&&saved.userId!==userId)return;
 localStorage.removeItem(storageKey);window.dispatchEvent(new Event('enforceflow:desktop-change'));
 // Capture the current token before sign-out. Local shutdown also works without a valid session.
 const token=sessionStorage.getItem('enforceflow-session-token');
 if(saved.endpoint)void fetch(baseUrl+'/me/push/subscription',{method:'DELETE',keepalive:true,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({endpoint:saved.endpoint,binding:saved.binding})}).catch(()=>{});
 if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.getRegistration('/');if(reg){await message(reg,{type:'disable',binding:saved.binding});const subscription=await reg.pushManager.getSubscription();if(subscription?.endpoint===saved.endpoint)await subscription.unsubscribe();}}catch{/* The server also expires subscriptions with their session. */}}
}
export function disconnectDesktop(userId?:string){shutdown=disconnectNow(userId);return shutdown;}

export function useDesktopNotifications(userId?:string,durationSeconds=10){
 useEffect(()=>{
  if(!userId)return;
  const current=device();if(current&&current.userId!==userId)void disconnectDesktop(current.userId);
  const closeExpired=async()=>{try{const reg=await navigator.serviceWorker?.getRegistration('/');if(reg)for(const n of await reg.getNotifications())if(n.data?.userId===userId&&n.data.expiresAt&&n.data.expiresAt<=Date.now())n.close();}catch{/* The browser may not expose displayed notifications. */}};
  const receive=(event:MessageEvent)=>{const saved=device();if(event.data?.type==='desktop-notification'&&saved?.userId===userId&&saved.binding===event.data.binding){if(event.data.sound)chime();if(event.data.expiresAt)window.setTimeout(()=>void closeExpired(),Math.max(0,event.data.expiresAt-Date.now()));}};
  navigator.serviceWorker?.addEventListener('message',receive);
  const prime=()=>{const saved=device();if(saved?.userId===userId&&saved.sound)void unlockAudio().catch(()=>{});};
  window.addEventListener('pointerdown',prime);window.addEventListener('keydown',prime);
  // Renew expiry only for the account already enabled on this browser; no permission prompt.
  let stopped=false,polling=false;
  const poll=async()=>{
   const saved=device(),token=sessionStorage.getItem('enforceflow-session-token');
   if(polling||saved?.userId!==userId||saved.mode!=='local'||!supported()||Notification.permission!=='granted')return;
   const current=()=>!stopped&&device()?.binding===saved.binding&&sessionStorage.getItem('enforceflow-session-token')===token;
   polling=true;
   try{
    const items=await request<FeedItem[]>('/me/push/feed');if(!current())return;
    const fresh=items.filter(item=>!saved.seen?.includes(item.id));
    if(fresh.length){const first=fresh[0],reg=await worker();if(!current())return;await message(reg,{type:'notify',payload:{userId,binding:saved.binding,id:JSON.stringify(fresh.map(item=>item.id)),ids:fresh.map(item=>item.id),title:'EnforceFlow',body:fresh.length===1?first.title:`${fresh.length} new items need your attention. Open your notification bell to review them.`,url:fresh.length===1?first.url:'#/dashboard'}});}
    if(current())localStorage.setItem(storageKey,JSON.stringify({...device(),seen:items.map(item=>item.id)}));
   }catch{/* Keep unseen items for the next check after a connection failure. */}finally{polling=false;}
  };
  const renew=()=>{const saved=device();if(saved?.userId!==userId||!supported()||Notification.permission!=='granted')return;if(saved.mode==='local'){void poll();return;}void request('/me/push/subscription',{method:'PUT',body:JSON.stringify({subscription:saved.subscription,binding:saved.binding,sound:saved.sound})}).catch(()=>{});};
  const settings=async()=>{const saved=device();if(saved?.userId!==userId)return;try{const reg=await navigator.serviceWorker?.getRegistration('/');if(reg)await message(reg,{type:'duration',binding:saved.binding,durationSeconds});}catch{/* Updated on the next enabled session. */}};
  void settings();void closeExpired();
  renew();window.addEventListener('focus',renew);window.addEventListener('focus',closeExpired);
  const timer=window.setInterval(()=>void poll(),15000);window.addEventListener('enforceflow:desktop-change',renew);
  return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',closeExpired);window.removeEventListener('enforceflow:desktop-change',renew);navigator.serviceWorker?.removeEventListener('message',receive);window.removeEventListener('pointerdown',prime);window.removeEventListener('keydown',prime);window.removeEventListener('focus',renew);};
 },[userId,durationSeconds]);
}

export function DesktopNotificationControls({userId,durationSeconds=10}:{userId?:string;durationSeconds?:number}){
 const [manage,setManage]=useState(false);
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[userId]);
 const [saved,setSaved]=useState<Device|null>(device),[permission,setPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const enabled=!!saved&&saved.userId===userId&&permission==='granted';
 useEffect(()=>{const sync=()=>{setSaved(device());setPermission(typeof Notification==='undefined'?'unsupported':Notification.permission);};window.addEventListener('enforceflow:desktop-change',sync);window.addEventListener('storage',sync);window.addEventListener('focus',sync);return()=>{window.removeEventListener('enforceflow:desktop-change',sync);window.removeEventListener('storage',sync);window.removeEventListener('focus',sync);};},[]);
 const enable=async()=>{
  if(!userId||busy)return;setBusy(true);setError('');
  const authToken=sessionStorage.getItem('enforceflow-session-token');
  let pending:Device|null=null,registration:ServiceWorkerRegistration|null=null;
  const stillCurrent=()=>active.current&&sessionStorage.getItem('enforceflow-session-token')===authToken;
  try{
   // Both permission and audio unlocking begin directly from this user gesture.
   const permissionRequest=Notification.requestPermission();void unlockAudio().catch(()=>{});
   const result=await permissionRequest;setPermission(result);if(result!=='granted')throw Error('Allow notifications in your browser site settings to receive system alerts.');
   if(!stillCurrent())return;
   await shutdown;
   const reg=await worker(),config=await request<{publicKey:string}>('/me/push/config');
   registration=reg;
   let subscription=await reg.pushManager.getSubscription();
   if(!subscription){try{subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});}catch(error){
    if((error as Error).name!=='AbortError'&&!/push service/i.test((error as Error).message))throw error;
   }}
   const baseline=subscription?undefined:await request<FeedItem[]>('/me/push/feed');
   const current=device(),next:Device={userId,binding:current?.userId===userId?current.binding:crypto.randomUUID(),endpoint:subscription?.endpoint??'',subscription:subscription?.toJSON()??{},sound:current?.userId===userId?current.sound:true,...(!subscription?{mode:'local' as const,seen:baseline!.map(item=>item.id)}:{})};
   pending=next;
   if(!stillCurrent())throw Error('Notification setup was cancelled.');
   await message(reg,{type:'bind',...next,durationSeconds});
   if(subscription)await request('/me/push/subscription',{method:'PUT',body:JSON.stringify({subscription:next.subscription,binding:next.binding,sound:next.sound})});
   if(!stillCurrent())throw Error('Notification setup was cancelled.');
   localStorage.setItem(storageKey,JSON.stringify(next));setSaved(next);window.dispatchEvent(new Event('enforceflow:desktop-change'));
  }catch(error){
   if(pending){if(registration)await message(registration,{type:'disable',binding:pending.binding}).catch(()=>{});if(pending.endpoint)void fetch(baseUrl+'/me/push/subscription',{method:'DELETE',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify({endpoint:pending.endpoint,binding:pending.binding})}).catch(()=>{});}
   if(active.current)setError((error as Error).message);
  }finally{if(active.current)setBusy(false);}
 };
 const sound=async(value:boolean)=>{
  if(!saved)return;const previous=saved,next={...saved,sound:value},authToken=sessionStorage.getItem('enforceflow-session-token');
  const current=()=>active.current&&device()?.binding===previous.binding&&sessionStorage.getItem('enforceflow-session-token')===authToken;
  setSaved(next);setBusy(true);setError('');
  try{void unlockAudio().catch(()=>{});if(next.mode!=='local')await request('/me/push/subscription',{method:'PUT',body:JSON.stringify({subscription:next.subscription,binding:next.binding,sound:next.sound})});if(!current())return;await message(await worker(),{type:'sound',binding:next.binding,sound:value});if(current())localStorage.setItem(storageKey,JSON.stringify({...device(),sound:value}));}
  catch(error){if(active.current){setSaved(previous);setError((error as Error).message);}}finally{if(active.current)setBusy(false);}
 };
 const test=async()=>{
  if(busy||!saved)return;
  const binding=saved.binding,token=sessionStorage.getItem('enforceflow-session-token');
  setBusy(true);setError('');void unlockAudio().catch(()=>{});
  try{
   await message(await worker(),{type:'test'});
   const current=device();
   if(!active.current||!current||current.userId!==userId||current.binding!==binding||sessionStorage.getItem('enforceflow-session-token')!==token)return;
   const next={...current,tested:true};
   localStorage.setItem(storageKey,JSON.stringify(next));setSaved(next);setManage(false);
   window.dispatchEvent(new Event('enforceflow:desktop-change'));
  }catch(error){if(active.current)setError((error as Error).message);}
  finally{if(active.current)setBusy(false);}
 };
 if(enabled&&saved?.tested&&!manage)return <div className="desktop-notification-summary"><button type="button" className="action-quiet" onClick={()=>setManage(true)}><BellRing size={16}/> Manage system notifications</button></div>;

 return <div className="desktop-notification-controls"><div><BellRing size={18}/><b>System notifications</b></div><p>{enabled?(saved?.mode==='local'?'Enabled while this portal is open, including when minimized. Background push is unavailable in this browser; keep this tab open to receive alerts.':'Enabled for your account on this browser. New alerts can appear while the browser is minimized.'):!supported()?'System alerts need a supported browser and HTTPS (or localhost).':permission==='denied'?'Notifications are blocked. Allow them in your browser site settings, then enable them here.':'Enable banners and sound for your alerts, including while the browser is minimized.'}</p>{enabled?<><label><input type="checkbox" checked={saved?.sound??true} disabled={busy} onChange={e=>void sound(e.target.checked)}/> Play notification sound</label><div className="desktop-notification-actions"><button type="button" disabled={busy} onClick={()=>void test()}>Test on my device</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);await disconnectDesktop(userId);setSaved(null);setBusy(false);}}>Turn off here</button></div></>:<button type="button" className="action-primary" disabled={!supported()||!userId||busy} onClick={()=>void enable()}>{busy?'Enabling…':'Enable system notifications'}</button>}{error&&<p role="alert" className="portal-form-error">{error}</p>}<small>Background sound follows your system settings. Do Not Disturb can silence banners and sound.</small></div>;
}
