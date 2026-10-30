from pathlib import Path
p=Path('server/verify-experience.mjs');s=p.read_text(encoding='utf-8')
needle=" const page=await context.newPage();"
insert=""" await context.addInitScript(()=>{
  const state={permissionRequests:0,banners:0,chimes:0,subscription:null,binding:null,listeners:[]};window.__desktopTest=state;
  class FakeNotification{static permission='default';static async requestPermission(){state.permissionRequests++;this.permission='granted';return 'granted';}}Object.defineProperty(window,'Notification',{value:FakeNotification,configurable:true});
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/browser-fixture',keys:{p256dh:'fixture-key',auth:'fixture-auth'}}),unsubscribe:async()=>{state.subscription=null;return true;}};
  const pushManager={getSubscription:async()=>state.subscription,subscribe:async()=>{state.subscription=subscription;return subscription;}};
  const reg={pushManager,active:{postMessage(message,ports){if(message.type==='bind')state.binding=message;if(message.type==='disable'&&state.binding?.binding===message.binding)state.binding=null;if(message.type==='sound'&&state.binding)state.binding.sound=message.sound;if(message.type==='test'&&state.binding){state.banners++;for(const listener of state.listeners)listener({data:{type:'desktop-notification',binding:state.binding.binding,sound:state.binding.sound}});}ports[0].postMessage({ok:true});}}};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve(reg),register:async()=>reg,getRegistration:async()=>reg,addEventListener(_name,listener){state.listeners.push(listener);},removeEventListener(_name,listener){state.listeners=state.listeners.filter(x=>x!==listener);}}});
  class FakeAudio{state='running';currentTime=0;destination={};async resume(){}createOscillator(){return {frequency:{value:0},connect(){return this;},start(){state.chimes++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}}Object.defineProperty(window,'AudioContext',{value:FakeAudio});
 });
 const page=await context.newPage();"""
assert needle in s;s=s.replace(needle,insert,1)
s=s.replace(" else if(u.pathname==='/api/me/notifications')", " else if(u.pathname==='/api/me/push/config')data={publicKey:'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'};\n else if(u.pathname==='/api/me/push/subscription')data={enabled:true};\n else if(u.pathname==='/api/me/notifications')",1)
needle="await page.getByRole('button',{name:/^Notifications/}).click();await page.getByRole('button').filter"
insert="""await page.getByRole('button',{name:/^Notifications/}).click();check(await page.evaluate(()=>window.__desktopTest.permissionRequests)===0,'System notification permission is never requested without user action');await page.getByRole('button',{name:'Enable system notifications',exact:true}).click();await page.getByRole('button',{name:'Test on my device',exact:true}).waitFor();check(await page.evaluate(()=>window.__desktopTest.permissionRequests)===1,'Enable requests permission after user click');await page.getByRole('button',{name:'Test on my device',exact:true}).click();await page.waitForFunction(()=>window.__desktopTest.banners===1&&window.__desktopTest.chimes===2);checks++;await page.getByRole('checkbox',{name:'Play notification sound',exact:true}).uncheck();await page.getByRole('button',{name:'Test on my device',exact:true}).click();await page.waitForFunction(()=>window.__desktopTest.banners===2);check(await page.evaluate(()=>window.__desktopTest.chimes)===2,'Muted device does not play a page chime');await page.getByRole('button',{name:'Turn off here',exact:true}).click();await page.getByRole('button',{name:'Enable system notifications',exact:true}).waitFor();check(await page.evaluate(()=>localStorage.getItem('enforceflow-desktop-device'))===null,'Disable clears browser account binding');await page.getByRole('button').filter"""
assert needle in s;s=s.replace(needle,insert,1)
# All roles retain an entry point even when there are no personal alerts.
needle=" await page.emulateMedia({reducedMotion:'no-preference'});"
insert=""" await page.getByRole('button',{name:/^Notifications/}).click();check(await page.getByRole('button',{name:'Enable system notifications',exact:true}).count()===1,'System notification setup is available to staff roles');await page.getByRole('button',{name:'Close notification panel',exact:true}).click();
 await page.emulateMedia({reducedMotion:'no-preference'});"""
assert needle in s;s=s.replace(needle,insert,1)
p.write_text(s,encoding='utf-8')
p=Path('package.json');s=p.read_text(encoding='utf-8').replace('server/password-recovery.test.js"','server/password-recovery.test.js server/desktop-notifications.test.js"');p.write_text(s,encoding='utf-8')
