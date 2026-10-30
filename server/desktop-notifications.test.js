import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import webpush from 'web-push';
import {createDesktopNotifications,pushDelta,validSubscription,subscriptionIsCurrent} from './desktop-notifications.js';
import {issueSession,readSession} from './sessions.js';

const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const user=n=>({UserId:uid(n),Username:'test'+n,RoleCode:'cuc',IsActive:true,IsDeleted:false,MustChangePassword:false,PasswordHash:'fixture-hash-'+n});
const sub=n=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture-'+n,keys:{p256dh:webpush.generateVAPIDKeys().publicKey,auth:crypto.randomBytes(16).toString('base64url')}});

test('push validation, freshness and session checks reject stale or foreign devices',()=>{
 const subscription=sub(1);assert(validSubscription(subscription));
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.example/x','https://user:pass@fcm.googleapis.com/x'])assert(!validSubscription({...subscription,endpoint}));
 assert(!validSubscription({...subscription,keys:{auth:'x',p256dh:'x'}}));
 assert.deepEqual(pushDelta(['a'],[{id:'a'},{id:'b'}]),[{id:'b'}]);
 const account=user(1),saved={userId:uid(1),session:readSession(issueSession(account))};
 assert(subscriptionIsCurrent(saved,account));
 for(const changed of [{...account,IsActive:false},{...account,IsDeleted:true},{...account,MustChangePassword:true},{...account,PasswordHash:'changed'},{...account,RoleCode:'master'},user(2)])assert(!subscriptionIsCurrent(saved,changed));
 assert(!subscriptionIsCurrent(saved,account,saved.session.exp+1));
});

test('recipient-bound background dispatch baselines, deduplicates, retries and expires subscriptions without real sends',async()=>{
 const accounts={[uid(1)]:user(1),[uid(2)]:user(2)},settings=new Map(),items={[uid(1)]:[{id:'old-a',title:'Existing A',url:'#/dashboard'}],[uid(2)]:[]},sends=[];let broken=false;
 class Request{constructor(){this.args={};}input(k,_type,v){this.args[k]=v;return this;}async query(raw){const q=raw.replace(/\s+/g,' ').trim(),a=this.args;
  if(q.startsWith('SELECT SettingKey,Value'))return {recordset:[...settings].map(([SettingKey,Value])=>({SettingKey,Value}))};
  if(q.startsWith('SELECT Value'))return {recordset:settings.has(a.key)?[{Value:settings.get(a.key)}]:[]};
  if(q.startsWith('SELECT * FROM enforcement.Users'))return {recordset:accounts[a.id]?[accounts[a.id]]:[]};
  if(q.startsWith('UPDATE enforcement.Settings')){if(!q.includes('JSON_VALUE')||JSON.parse(settings.get(a.key)||'{}').binding===a.binding)settings.set(a.key,a.value);return {recordset:[]};}
  if(q.startsWith('DELETE enforcement.Settings')){if(JSON.parse(settings.get(a.key)||'{}').binding===a.binding)settings.delete(a.key);return {recordset:[]};}
  throw Error(q);
 }}
 const pool={request:()=>new Request()},keys=webpush.generateVAPIDKeys();
 const engine=createDesktopNotifications({getPool:async()=>pool,keys,feed:async(_p,u)=>items[u.UserId],sendPush:async(subscription,payload)=>{if(broken)throw {statusCode:503};sends.push({endpoint:subscription.endpoint,payload:JSON.parse(payload)});}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{const session=readSession(req.headers.authorization?.replace(/^Bearer /,''));req.user=Object.values(accounts).find(u=>u.Username===session?.username);if(!req.user)return res.status(401).end();next();});engine.register(app);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/me/push';
 const call=async(path,{method='GET',body,n=1,status=200}={})=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+issueSession(accounts[uid(n)])},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.status,status,await response.text());};
 const first={subscription:sub(1),binding:crypto.randomUUID(),sound:true},second={subscription:sub(2),binding:crypto.randomUUID(),sound:false};
 try{
  for(const n of [1,2]){
   const response=await fetch(base+'/feed',{headers:{Authorization:'Bearer '+issueSession(accounts[uid(n)])}});
   assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   assert.deepEqual(await response.json(),items[uid(n)],'Fallback feed only contains the signed-in account items');
  }
  assert.equal((await fetch(base+'/feed')).status,401,'Fallback feed requires a session');
  await call('/config');await call('/subscription',{method:'PUT',body:{...first,userId:uid(2)},status:400});
  await call('/subscription',{method:'PUT',body:first});await call('/subscription',{method:'PUT',body:second,n:2});await engine.dispatch();assert.equal(sends.length,0);
  items[uid(1)].push({id:'new-a',title:'New A only',url:'#/staff'});await engine.dispatch();assert.equal(sends.length,1);assert.equal(sends[0].endpoint,first.subscription.endpoint);assert.equal(sends[0].payload.userId,uid(1));assert.equal(sends[0].payload.binding,first.binding);assert.equal(sends[0].payload.sound,true);await engine.dispatch();assert.equal(sends.length,1);
  await call('/subscription',{method:'PUT',body:first});await engine.dispatch();assert.equal(sends.length,1,'Session renewal must not re-notify seen items');
  items[uid(2)].push({id:'new-b',title:'New B only',url:'#/dashboard'});broken=true;await engine.dispatch();assert.equal(sends.length,1);broken=false;await engine.dispatch();assert.equal(sends.length,2);assert.equal(sends[1].payload.sound,false);
  await call('/subscription',{method:'DELETE',n:2,body:{endpoint:first.subscription.endpoint,binding:first.binding},status:204});assert.equal(settings.size,2,'Another account cannot remove this subscription');
  const rebound={...first,binding:crypto.randomUUID()};await call('/subscription',{method:'PUT',n:2,body:rebound});await call('/subscription',{method:'DELETE',body:{endpoint:first.subscription.endpoint,binding:first.binding},status:204});assert.equal(settings.size,2,'Old account cleanup cannot remove a newer binding');
  items[uid(1)].push({id:'a-after-switch',title:'Must never reach B',url:'#/dashboard'});await engine.dispatch();assert.equal(sends.length,2);
  accounts[uid(2)].PasswordHash='reset';await engine.dispatch();assert.equal(settings.size,0,'Password reset revokes all device delivery for that session');
 }finally{engine.stop();await new Promise(r=>server.close(r));}
});

test('the actual service worker displays while no page is active, isolates accounts and handles click/sound/disable',async()=>{
 const listeners={},shown=[],posted=[],opened=[],navigated=[],timers=[];let windows=[],now=Date.now();class TestDate extends Date{static now(){return now;}}
 const self={addEventListener:(name,fn)=>{listeners[name]=fn;},skipWaiting(){},registration:{scope:'https://portal.example/',showNotification:async(title,options)=>shown.push({title,...options}),getNotifications:async(options)=>shown.filter(n=>!options?.tag||n.tag===options.tag).map(n=>({...n,close(){n.closed=true;}}))},clients:{claim:async()=>{},matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(await readFile('public/notification-worker.js','utf8'),{self,indexedDB:new IDBFactory(),URL,Promise,Date:TestDate,setTimeout:(fn,delay)=>{timers.push({fn,delay});}});
 const emit=async(name,data)=>{let promise,reply;listeners[name]({data:name==='push'?{json:()=>data}:data,ports:[{postMessage(value){reply=value;}}],waitUntil(value){promise=value;}});await promise;return reply;};
 const binding=crypto.randomUUID(),payload={userId:uid(1),binding,id:'one',title:'EnforceFlow',body:'Fictional alert',url:'#/staff',sound:true,ids:['account:fixture:Unread']};
 await emit('message',{type:'bind',userId:uid(1),binding,sound:true});await emit('message',{type:'notify',payload});assert.equal(shown.length,1,'Fallback delivery displays a system notification through the worker');assert.equal(shown[0].silent,false);assert.equal(shown[0].requireInteraction,false);assert.equal(timers[0].delay,10000);now+=10000;await timers.shift().fn();assert(shown[0].closed,'Desktop banner closes at its selected timeout');
 await emit('message',{type:'duration',binding,durationSeconds:0});await emit('push',payload);assert.equal(shown.length,1,'Duplicate push suppressed');await emit('push',{...payload,id:'wrong',userId:uid(2)});assert.equal(shown.length,1);
 windows=[{focused:true,postMessage:message=>posted.push(message),url:'https://portal.example/',navigate:async url=>navigated.push(url),focus:async()=>{}}];await emit('message',{type:'sound',binding,sound:false});await emit('push',{...payload,id:'two'});assert.equal(shown[1].silent,true);assert.equal(shown[1].requireInteraction,true,'Until-dismissed duration requests a sticky banner');assert.equal(posted[0].sound,false);
 let click;listeners.notificationclick({notification:{data:shown[1].data,close(){}},waitUntil(p){click=p;}});await click;assert.equal(navigated[0],'https://portal.example/#/staff');assert(posted.some(message=>message.type==='notifications-read'&&message.ids.includes('account:fixture:Unread')),'Clicking a system notification marks its source item read');
 const readState=await emit('message',{type:'read-state'});assert.equal(readState.userId,uid(1));assert(readState.ids.includes('account:fixture:Unread'),'Cold-start portal can recover notification clicks');
 windows=[];listeners.notificationclick({notification:{data:{...shown[1].data,url:'https://evil.example'},close(){}},waitUntil(p){click=p;}});await click;assert.equal(opened[0],'https://portal.example/#/dashboard');
 await emit('message',{type:'disable',binding:'old-binding'});await emit('push',{...payload,id:'three'});assert.equal(shown.length,3,'Stale cleanup cannot disable current account');
 await emit('message',{type:'disable',binding});await emit('push',{...payload,id:'four'});assert.equal(shown.length,3);assert(shown.every(n=>n.closed));
 assert.equal(listeners.fetch,undefined,'The worker does not cache account pages');
});
