import {useEffect,useState} from 'react';
import {inboxEntry,notificationKey,notificationVisible,parseInbox,type Inbox} from '../../../shared/notification-inbox';

const fallback=new Map<string,Inbox>();
const load=(key:string)=>{try{return parseInbox(localStorage.getItem(key));}catch{return fallback.get(key)??{};}};
const remember=(key:string,entries:Inbox)=>{fallback.set(key,entries);try{localStorage.setItem(key,JSON.stringify(entries));}catch{/* Retain state in this tab if browser storage is unavailable. */}};
const changed='enforceflow:notification-inbox';
export function useNotificationInbox(userId:string,ids:string[],minutes:number){
 const key=notificationKey(userId),signature=JSON.stringify(ids);
 const [snapshot,setSnapshot]=useState(()=>({key,entries:load(key)})),[now,setNow]=useState(Date.now);
 const entries=snapshot.key===key?snapshot.entries:load(key);
 const update=(readIds:string[]=[])=>{
  const next:Inbox={...entries,...load(key)},at=Date.now();
  for(const id of ids)next[id]=inboxEntry(next[id],at);
  for(const id of readIds)next[id]={...inboxEntry(next[id],at),readAt:at};
  // Retain active expired entries so polling cannot make them appear again.
  const keep=new Set(ids),recent=Object.keys(next).sort((a,b)=>next[b].firstSeen-next[a].firstSeen).slice(0,2000);
  for(const id of Object.keys(next))if(!keep.has(id)&&!recent.includes(id))delete next[id];
  remember(key,next);
  setSnapshot({key,entries:next});window.dispatchEvent(new CustomEvent(changed,{detail:key}));
 };
 useEffect(()=>{
  const at=Date.now(),next=load(key);let dirty=false;
  for(const id of JSON.parse(signature) as string[])if(!next[id]){next[id]=inboxEntry(undefined,at);dirty=true;}
  if(dirty)remember(key,next);
  setSnapshot({key,entries:next});
 },[key,signature]);
 useEffect(()=>{
  const sync=()=>{setSnapshot({key,entries:load(key)});setNow(Date.now());};
  const receive=(event:MessageEvent)=>{if(event.data?.type==='notifications-read'&&event.data.userId===userId&&Array.isArray(event.data.ids))update(event.data.ids);};
  const readWorker=async()=>{try{const reg=await navigator.serviceWorker?.getRegistration('/');if(!reg?.active)return;const channel=new MessageChannel();const timeout=window.setTimeout(()=>channel.port1.close(),2000);channel.port1.onmessage=event=>{window.clearTimeout(timeout);channel.port1.close();receive({data:{type:'notifications-read',...event.data}} as MessageEvent);};reg.active.postMessage({type:'read-state'},[channel.port2]);}catch{/* A notification-only worker may not have been installed yet. */}};
  const focus=()=>{sync();void readWorker();};
  window.addEventListener('storage',sync);window.addEventListener(changed,sync);window.addEventListener('focus',focus);navigator.serviceWorker?.addEventListener('message',receive);
  const timer=window.setInterval(()=>setNow(Date.now()),1000);void readWorker();
  return()=>{window.clearInterval(timer);window.removeEventListener('storage',sync);window.removeEventListener(changed,sync);window.removeEventListener('focus',focus);navigator.serviceWorker?.removeEventListener('message',receive);};
 },[key,signature]);
 return {visible:(id:string)=>notificationVisible(entries[id],minutes,now),unread:(id:string)=>!entries[id]?.readAt&&notificationVisible(entries[id],minutes,now),markRead:(readIds:string[])=>update(readIds)};
}
