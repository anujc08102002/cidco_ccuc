import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {driveAnnouncements,driveDateInput,registerDriveAnnouncementRoutes} from './drive-announcements.js';
import {desktopFeed} from './desktop-notifications.js';
import {accountNotificationId} from '../shared/notification-inbox.js';

const user={UserId:'other-user'};
const plan={DriveId:'drive-1',SerialNumber:'CCUC/42',PlannedAt:'2026-11-02T03:30:00.000Z',Node:'Belapur',Details:'Meet at the node office at 9 AM. Bring the approved case list.',CreatedBy:'ccuc-user',CreatedAt:'2026-10-29T04:00:00Z'};
test('announcements carry full details to other users and suppress the publishing CCUC popup',()=>{
 const result=driveAnnouncements([plan],user,Date.parse('2026-10-29T04:00:00Z'));
 assert.equal(result.drives.length,1);assert.equal(result.notifications[0].status,'announced');assert.equal(result.notifications[0].details,plan.Details);assert.equal(result.notifications[0].node,'Belapur');
 const own=driveAnnouncements([plan],{UserId:'CCUC-USER'},Date.parse('2026-10-29T04:00:00Z'));
 assert.equal(own.notifications.length,0);assert.equal(own.drives.length,1);
});
test('reminders advance on India calendar boundaries with separate identities, including after the drive time',()=>{
 const at=date=>driveAnnouncements([plan],user,Date.parse(date)).notifications[0];
 const announced=at('2026-10-31T18:29:59Z'),tomorrow=at('2026-10-31T18:30:00Z'),today=at('2026-11-01T18:30:00Z');
 assert.equal(announced.status,'announced');assert.equal(tomorrow.status,'tomorrow');assert.equal(today.status,'today');
 assert.equal(new Set([announced.id,tomorrow.id,today.id]).size,3);
 assert.equal(at('2026-11-02T18:29:59Z').status,'today');
 assert.deepEqual(driveAnnouncements([plan],user,Date.parse('2026-11-02T18:30:00Z')),{drives:[],notifications:[]});
});
test('revisions create a fresh alert and rescheduling removes outdated reminder phases',()=>{
 const now=Date.parse('2026-11-01T05:00:00Z'),before=driveAnnouncements([plan],user,now);
 const revised=driveAnnouncements([{...plan,Details:'Revised meeting point'}],user,now);
 assert.notEqual(before.notifications[0].id,revised.notifications[0].id);
 const moved=driveAnnouncements([{...plan,PlannedAt:'2026-11-10T03:30:00Z'}],user,now);
 assert.equal(moved.notifications[0].status,'announced');assert.notEqual(before.notifications[0].id,moved.notifications[0].id);
 assert.equal(driveAnnouncements([{...plan,PlannedAt:'invalid'}],user,now).notifications.length,0);
});
test('CCUC receives date reminders and datetime-local input is interpreted as India time',()=>{
 assert.equal(driveAnnouncements([plan],{UserId:'ccuc-user'},Date.parse('2026-11-01T05:00:00Z')).notifications[0].status,'tomorrow');
 assert.equal(new Date(driveDateInput('2026-11-02T09:00')).toISOString(),plan.PlannedAt);
 assert.equal(driveDateInput(plan.PlannedAt),plan.PlannedAt);
});
test('desktop feed carries the same drive identity and details as the in-app inbox for every role',async()=>{
 const upcoming={...plan,PlannedAt:new Date(Date.now()+3*86400000).toISOString()};
 const pool={request:()=>({input(){return this;},async query(q){return {recordset:q.includes('FROM enforcement.DrivePlans')?[upcoming]:[]};}})};
 for(const role of ['surveyor','cuc','ccuc','legal','master']){
  const recipient={...user,RoleCode:role},item=(await desktopFeed(pool,recipient))[0];
  assert.equal(item.id,accountNotificationId(driveAnnouncements([upcoming],recipient).notifications[0]));
  assert(item.title.includes(plan.Details));assert(item.title.includes('IST'));assert.equal(item.url,'#/dashboard');
 }
});
test('announcement endpoint returns all department plans to every authenticated role without case linkage',async()=>{
 const queries=[],pool={request:()=>({query:async q=>{queries.push(q);return {recordset:[{...plan,PlannedAt:new Date(Date.now()+3*86400000).toISOString()}]};}})};
 const app=express();app.use((req,_res,next)=>{req.user=user;next();});registerDriveAnnouncementRoutes(app,{getPool:async()=>pool});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/me/drive-announcements`);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.drives[0].DriveId,plan.DriveId);assert.equal(body.notifications[0].details,plan.Details);assert(!queries[0].includes('JOIN'));}finally{await new Promise(resolve=>server.close(resolve));}
});
