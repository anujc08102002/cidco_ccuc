/* Notification-only worker: never caches authenticated pages or API responses. */
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('enforceflow-desktop',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function state(value){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state',value===undefined?'readonly':'readwrite'),store=tx.objectStore('state');const r=value===undefined?store.get('binding'):store.put(value,'binding');let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>event.waitUntil((async()=>{
 const message=event.data;
 if(message?.type==='bind'){
  await state({userId:message.userId,binding:message.binding,sound:message.sound,durationSeconds:[0,5,10,30,60].includes(message.durationSeconds)?message.durationSeconds:10,enabled:true,seen:[],readIds:[]});
  for(const n of await self.registration.getNotifications())n.close();
 }else if(message?.type==='disable'){
  const current=await state();if(current?.binding===message.binding){await state({enabled:false});for(const n of await self.registration.getNotifications())n.close();}
 }else if(message?.type==='sound'){
  const current=await state();if(current?.binding===message.binding)await state({...current,sound:message.sound});
 }else if(message?.type==='duration'){
  const current=await state();if(current?.binding===message.binding&&[0,5,10,30,60].includes(message.durationSeconds))await state({...current,durationSeconds:message.durationSeconds});
 }else if(message?.type==='read-state'){
  const current=await state();event.ports[0]?.postMessage({userId:current?.userId,ids:current?.readIds??[]});return;
 }else if(message?.type==='notify'){
  await show(message.payload);
 }else if(message?.type==='test'){
  const current=await state();if(current?.enabled)await show({userId:current.userId,binding:current.binding,id:'test-'+Date.now(),title:'EnforceFlow',body:'System notifications are ready on this browser.',url:'#/dashboard',sound:current.sound});
 }
 event.ports[0]?.postMessage({ok:true});
})()));
async function show(payload){
 const current=await state();
 if(!current?.enabled||current.binding!==payload.binding||current.userId!==payload.userId||current.seen.includes(payload.id))return;
 const seconds=current.durationSeconds??10,expiresAt=seconds?Date.now()+seconds*1000:null,tag='enforceflow-'+payload.id;
 await self.registration.showNotification(payload.title,{body:payload.body,tag,silent:!current.sound,requireInteraction:seconds===0,data:{binding:payload.binding,userId:payload.userId,url:payload.url,ids:payload.ids??[],expiresAt}});
 if(expiresAt)setTimeout(async()=>{try{for(const n of await self.registration.getNotifications({tag}))if(n.data?.binding===payload.binding&&n.data.expiresAt&&n.data.expiresAt<=Date.now())n.close();}catch{/* Retry cleanup when the portal next gains focus. */}},seconds*1000);
 await state({...current,seen:[...current.seen,payload.id].slice(-100)});
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const target=windows.find(w=>w.focused)||windows.find(w=>w.visibilityState==='visible')||windows[0];
 if(target)target.postMessage({type:'desktop-notification',binding:payload.binding,sound:current.sound,expiresAt});
}
self.addEventListener('push',event=>event.waitUntil((async()=>{try{await show(event.data.json());}catch{/* Malformed or stale push must not expose another account. */}})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const current=await state(),data=event.notification.data;
  if(!current?.enabled||current.binding!==data.binding||current.userId!==data.userId)return;
  const ids=Array.isArray(data.ids)?data.ids.filter(id=>typeof id==='string'&&id.length<=512):[];
  await state({...current,readIds:[...new Set([...(current.readIds??[]),...ids])].slice(-2000)});
  const hash=typeof data.url==='string'&&data.url.startsWith('#/')?data.url:'#/dashboard',url=new URL(self.registration.scope);url.hash=hash;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const target=windows.find(w=>new URL(w.url).origin===url.origin);
  for(const client of windows)client.postMessage({type:'notifications-read',userId:current.userId,ids});
  if(target){await target.navigate(url.href);await target.focus();}else await self.clients.openWindow(url.href);
 })());
});
