import crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import webpush from 'web-push';
import sql from 'mssql';
import {fail,same} from './workflow-policy.js';
import {readSession,matchesSessionPassword} from './sessions.js';
import {readAccountNotifications,readAttentionRows} from './password-recovery.js';
import {leaveWindow,continuityCategory} from './continuity-policy.js';
import {readDriveAnnouncements} from './drive-announcements.js';

const prefix='push:',keyFor=endpoint=>prefix+crypto.createHash('sha256').update(endpoint).digest('hex');
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
export function validSubscription(value){
 try{const url=new URL(value.endpoint);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&value.endpoint.length<2048&&
  (['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com'].includes(url.hostname)||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname.endsWith('.notify.windows.com'))&&
  typeof value.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87}={0,2}$/.test(value.keys.p256dh)&&Buffer.from(value.keys.p256dh,'base64url').length===65&&
  typeof value.keys?.auth==='string'&&/^[A-Za-z0-9_-]{22}={0,2}$/.test(value.keys.auth)&&Buffer.from(value.keys.auth,'base64url').length===16;
 }catch{return false;}
}
export function pushDelta(previous,items){const seen=new Set(previous??[]);return items.filter(item=>!seen.has(item.id));}
export function subscriptionIsCurrent(saved,user,now=Date.now()){
 return !!user&&user.IsActive&&!user.IsDeleted&&!user.MustChangePassword&&same(saved.userId,user.UserId)&&saved.session.exp>now&&matchesSessionPassword(saved.session,user);
}
export async function desktopFeed(pool,user,holdSql='c.LegalHold'){
 const [accounts,cases,drives]=await Promise.all([readAccountNotifications(pool,user),readAttentionRows(pool,user,holdSql),readDriveAnnouncements(pool,user)]);
 const items=accounts.map(item=>({id:`account:${item.id}:${item.status}`,title:item.title,url:item.kind==='recovery'?'#/staff':'#/dashboard'}));
 for(const item of drives.notifications)items.push({id:`account:${item.id}:${item.status}`,title:`${item.title} · ${item.node} · ${new Date(item.plannedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · ${item.details}`,url:'#/dashboard'});
 for(const c of cases){const overdue=!!c.NextActionAt&&new Date(c.NextActionAt).getTime()<Date.now();items.push({id:`case:${c.CaseNumber}:${c.WorkflowStep??c.Status}:${!!c.EffectiveHold}:${overdue}`,title:`${c.CaseNumber} - ${c.EffectiveHold?'legal restriction requires review':overdue?'case deadline overdue':'case action requires attention'}`,url:'#/detail?case='+encodeURIComponent(c.CaseNumber)});}
 if(['master','ccuc'].includes(user.RoleCode)){
  const rows=(await pool.request().input('actor',sql.UniqueIdentifier,user.UserId).input('role',sql.NVarChar,user.RoleCode).input('category',sql.NVarChar,continuityCategory).query("SELECT r.RecordId,r.Status,r.Details,r.CreatedByUserId,u.DisplayName,u.RoleCode FROM enforcement.OperationalRecords r JOIN enforcement.Users u ON u.UserId=r.CreatedByUserId WHERE r.Category=@category AND r.CreatedByUserId<>@actor AND (@role='master' OR (@role='ccuc' AND u.RoleCode IN ('cuc','surveyor'))) AND r.Status IN ('Recorded','Return requested')")).recordset;
  for(const r of rows){const data=JSON.parse(r.Details);if(r.Status==='Return requested'||data.kind==='transfer'||leaveWindow(data.start,data.end).eligible)items.push({id:`continuity:${r.RecordId}:${r.Status}`,title:`${r.DisplayName} - staff handover requires review`,url:'#/continuity'});}
 }
 return items;
}
function vapidKeys(){
 if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)return {publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY};
 const path=new URL('./.push-vapid.json',import.meta.url);
 try{return JSON.parse(readFileSync(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const keys=webpush.generateVAPIDKeys();try{writeFileSync(path,JSON.stringify(keys),{flag:'wx',mode:0o600});return keys;}catch(error){if(error.code!=='EEXIST')throw error;return JSON.parse(readFileSync(path,'utf8'));}
}
export function createDesktopNotifications({getPool,holdSql='c.LegalHold',sendPush,keys,feed=desktopFeed,clock=()=>Date.now()}){
 keys??=vapidKeys();
 const send=sendPush??((subscription,payload)=>webpush.sendNotification(subscription,payload,{vapidDetails:{subject:process.env.VAPID_SUBJECT||'https://cidco.maharashtra.gov.in',...keys},TTL:120,urgency:'high',timeout:10000}));
 const read=async(pool,key)=>{const row=(await pool.request().input('key',sql.NVarChar,key).query('SELECT Value FROM enforcement.Settings WHERE SettingKey=@key')).recordset[0];return row?JSON.parse(row.Value):null;};
 const save=async(pool,key,value)=>{await pool.request().input('key',sql.NVarChar,key).input('value',sql.NVarChar(sql.MAX),JSON.stringify(value)).input('actor',sql.UniqueIdentifier,value.userId).query('UPDATE enforcement.Settings SET Value=@value,UpdatedBy=@actor,UpdatedAt=SYSUTCDATETIME() WHERE SettingKey=@key; IF @@ROWCOUNT=0 INSERT enforcement.Settings(SettingKey,Value,UpdatedBy) VALUES(@key,@value,@actor);');};
 const remove=async(pool,key,binding)=>pool.request().input('key',sql.NVarChar,key).input('binding',sql.NVarChar,binding).query("DELETE enforcement.Settings WHERE SettingKey=@key AND JSON_VALUE(Value,'$.binding')=@binding");
 let running=false,timer;
 async function dispatch(){
  if(running)return;running=true;
  try{
   const pool=await getPool(),rows=(await pool.request().query("SELECT SettingKey,Value FROM enforcement.Settings WHERE SettingKey LIKE 'push:%'")).recordset;
   const cache=new Map();
   for(const row of rows){
    let saved;try{saved=JSON.parse(row.Value);}catch{continue;}
    try{
     const user=(await pool.request().input('id',sql.UniqueIdentifier,saved.userId).query('SELECT * FROM enforcement.Users WHERE UserId=@id')).recordset[0];
     if(!subscriptionIsCurrent(saved,user,clock())){await remove(pool,row.SettingKey,saved.binding);continue;}
     if(!cache.has(saved.userId))cache.set(saved.userId,await feed(pool,user,holdSql));
     const items=cache.get(saved.userId),fresh=pushDelta(saved.seen,items);
     if(!fresh.length)continue;
     // Recheck ownership just before send; stale work cannot overwrite a later account binding.
     const current=await read(pool,row.SettingKey);if(current?.binding!==saved.binding)continue;
     const first=fresh[0];
     await send(saved.subscription,JSON.stringify({binding:saved.binding,userId:saved.userId,id:crypto.createHash('sha256').update(fresh.map(i=>i.id).join('|')).digest('hex'),ids:fresh.map(item=>item.id),title:'EnforceFlow',body:fresh.length===1?first.title:`${fresh.length} new items need your attention. Open your notification bell to review them.`,url:fresh.length===1?first.url:'#/dashboard',sound:saved.sound}));
     await pool.request().input('key',sql.NVarChar,row.SettingKey).input('binding',sql.NVarChar,saved.binding).input('value',sql.NVarChar(sql.MAX),JSON.stringify({...saved,seen:items.map(i=>i.id)})).query("UPDATE enforcement.Settings SET Value=@value,UpdatedAt=SYSUTCDATETIME() WHERE SettingKey=@key AND JSON_VALUE(Value,'$.binding')=@binding");
    }catch(error){if([404,410].includes(error.statusCode))await remove(pool,row.SettingKey,saved.binding);/* Keep unseen items for retry after transient push failures. */}
   }
  }finally{running=false;}
 }
 function register(app){
  app.get('/api/me/push/config',(_req,res)=>res.json({publicKey:keys.publicKey}));
  app.get('/api/me/push/feed',wrap(async(req,res)=>{
   res.set('Cache-Control','no-store').json(await feed(await getPool(),req.user,holdSql));
  }));
  app.put('/api/me/push/subscription',wrap(async(req,res)=>{
   const b=req.body;fail(!b||Object.keys(b).some(k=>!['subscription','binding','sound'].includes(k))||!validSubscription(b.subscription)||typeof b.binding!=='string'||!/^[a-f\d-]{36}$/i.test(b.binding)||typeof b.sound!=='boolean','Invalid browser notification subscription.');
   const session=readSession(req.headers.authorization?.replace(/^Bearer /i,''));fail(!session||!matchesSessionPassword(session,req.user),'Sign in again before enabling system notifications.',401);
   const pool=await getPool(),key=keyFor(b.subscription.endpoint),previous=await read(pool,key),sameBinding=previous?.binding===b.binding&&same(previous.userId,req.user.UserId);
   const items=await feed(pool,req.user,holdSql);
   await save(pool,key,{userId:req.user.UserId,subscription:b.subscription,binding:b.binding,sound:b.sound,session:{password:session.password,role:session.role,exp:session.exp},seen:sameBinding?previous.seen:items.map(i=>i.id)});
   res.json({enabled:true});
  }));
  app.delete('/api/me/push/subscription',wrap(async(req,res)=>{
   const b=req.body;fail(typeof b?.endpoint!=='string'||b.endpoint.length>2048||typeof b.binding!=='string','Provide this browser subscription.');const pool=await getPool(),key=keyFor(b.endpoint),saved=await read(pool,key);if(saved&&same(saved.userId,req.user.UserId)&&saved.binding===b.binding)await remove(pool,key,b.binding);res.status(204).end();
  }));
 }
 return {register,dispatch,start(){if(!timer)timer=setInterval(()=>void dispatch().catch(()=>{}),15000).unref();},stop(){clearInterval(timer);timer=undefined;}};
}
