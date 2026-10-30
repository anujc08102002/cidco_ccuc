import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {defaultPreferences} from '../shared/account-preferences.js';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=createRequire(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`)('playwright'));}
const vite=await createServer({server:{port:5196,host:'127.0.0.1',strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
const uid='00000000-0000-0000-0000-000000000001',plan={DriveId:'fixture-drive',SerialNumber:'CCUC/TEST/42',Node:'Belapur',PlannedAt:'2026-11-02T03:30:00Z',Details:'Test drive only. Meet at the node office.\nBring the approved case list.',CreatedBy:'ccuc-fixture',CreatedAt:'2026-10-29T04:00:00Z'};
let phase='announced',published=false,revision=1,role='cuc',showAlerts=true;
const workspaces={};
const notification=()=>({id:`drive:fixture-drive:v${revision}:${phase}`,kind:'drive',status:phase,title:`Demolition drive ${phase}: ${plan.SerialNumber}`,createdAt:plan.CreatedAt,driveId:plan.DriveId,serial:plan.SerialNumber,node:plan.Node,plannedAt:plan.PlannedAt,details:plan.Details});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>sessionStorage.setItem('enforceflow-session-token','test-fixture'));
 await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/me/workspace'&&route.request().method()==='PUT')workspaces[role]={preferences:route.request().postDataJSON().preferences,avatar:null,revision:'saved-'+role};
  const data=path==='/api/auth/session'?{id:uid+role,username:'drive-test',name:'Test '+role,role,label:role,mustChangePassword:false}:
   path==='/api/me/workspace'?(workspaces[role]??{preferences:defaultPreferences(),avatar:null,revision:'fixture'}):
   path==='/api/me/continuity'?{records:[],options:[]}:
   path==='/api/me/drive-announcements'?{drives:published?[plan]:[],notifications:published&&showAlerts?[notification()]:[]}:[];
  await route.fulfill({contentType:path==='/api/events'?'text/event-stream':'application/json',body:path==='/api/events'?'':JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5196');await page.getByRole('heading',{name:'Upcoming demolition drives'}).waitFor();
 assert.equal(await page.getByRole('alertdialog').count(),0);
 published=true;
 await page.evaluate(()=>window.dispatchEvent(new Event('enforcement:changed')));
 let dialog=page.getByRole('alertdialog');await dialog.waitFor();assert((await dialog.innerText()).includes(plan.Details));assert((await dialog.innerText()).includes('IST'));
 await mkdir('output/ui',{recursive:true});await page.screenshot({path:'output/ui/drive-announcement-alert.png',fullPage:true});
 await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('enforcement:changed')));
 await page.waitForTimeout(400);assert.equal(await page.getByRole('alertdialog').count(),0);
 assert((await page.locator('#demolition-drives').innerText()).includes(plan.Details));
 await page.reload();await page.getByRole('heading',{name:'Upcoming demolition drives'}).waitFor();assert.equal(await page.getByRole('alertdialog').count(),0);
 phase='tomorrow';await page.evaluate(()=>window.dispatchEvent(new Event('enforcement:changed')));await dialog.waitFor();assert((await dialog.innerText()).includes('tomorrow'));await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
 phase='today';await page.evaluate(()=>window.dispatchEvent(new Event('enforcement:changed')));await dialog.waitFor();assert((await dialog.innerText()).includes('today'));await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
 await page.reload();await dialog.waitFor();await dialog.getByRole('button',{name:'View dashboard',exact:true}).click();
 await page.getByRole('button',{name:/^Notifications/}).click();await page.getByRole('button',{name:/Demolition drive today/}).waitFor();await page.getByRole('button',{name:'Close notification panel',exact:true}).click();
 revision++;plan.Details='Revised meeting point for the test drive.';await page.evaluate(()=>window.dispatchEvent(new Event('enforcement:changed')));await dialog.waitFor();assert((await dialog.innerText()).includes(plan.Details));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/ui/drive-announcement-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();await page.screenshot({path:'output/ui/drive-dashboard-mobile.png',fullPage:true});
 showAlerts=false;await page.setViewportSize({width:1440,height:1000});
 const widgetOrder=()=>page.locator('.work-canvas>.dashboard-scene>[data-widget]').evaluateAll(nodes=>nodes.map(n=>n.dataset.widget));
 for(const nextRole of ['surveyor','cuc','ccuc','legal','master']){
  role=nextRole;await page.goto('http://127.0.0.1:5196/?role='+role+'#/dashboard');await page.getByRole('button',{name:'Customize dashboard',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Upcoming demolition drives'}).waitFor();
  assert.deepEqual((await widgetOrder()).slice(0,2),['hero','drives']);
  const hero=await page.locator('.hero-board').boundingBox(),drive=await page.locator('#demolition-drives').boundingBox();assert(drive.y>=hero.y+hero.height);
  if(role==='surveyor')await page.screenshot({path:'output/ui/drive-dashboard-below-blue.png',fullPage:true});
  await page.getByRole('button',{name:'Customize dashboard',exact:true}).click();
  await page.getByRole('button',{name:'Move Upcoming demolition drives down',exact:true}).click();
  assert.deepEqual(await page.locator('.dashboard-live-preview [data-widget]').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.dataset.widget)),['hero','metrics','drives']);
  await page.getByRole('button',{name:'Save my workspace',exact:true}).click();
  await page.getByText('Your workspace has been saved. Other accounts are unchanged.').waitFor();
  await page.goto('http://127.0.0.1:5196/?role='+role+'&saved=1#/dashboard');await page.getByRole('heading',{name:'Upcoming demolition drives'}).waitFor();
  assert.deepEqual((await widgetOrder()).slice(0,3),['hero','metrics','drives']);
 }
 console.log('Passed: default placement below the blue panel, My workspace live preview, saved placement across reloads, and independent layouts for all five roles.');
 assert.deepEqual(errors,[]);console.log('Passed: live publication, dashboard persistence, acknowledgement, reload, day-before/day-of alerts, drive-day sign-in, inbox, revision, mobile layout.');
}finally{await browser.close();await vite.close();}