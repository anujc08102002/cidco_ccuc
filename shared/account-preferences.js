export const widgetIds=['hero','drives','metrics','shortcuts','operations','insights'];
export const accountPages=['personalize','continuity'];
export const rolePages={
 surveyor:['dashboard','register','surveys','hearings','documents','complaints','public',...accountPages],
 cuc:['dashboard','register','surveys','documents','hearings','complaints','reports','public',...accountPages],
 ccuc:['dashboard','register','documents','demolition','legal','reports','public',...accountPages],
 legal:['dashboard','register','legal','reports','public',...accountPages],
 master:['dashboard','register','surveys','documents','hearings','legal','demolition','complaints','reports','staff','settings','public','archived',...accountPages]
};
export function defaultPreferences(){return {theme:'light',accent:'congress',density:'comfortable',textSize:'normal',sidebarSide:'left',sidebarCollapsed:false,contentWidth:'fluid',cardStyle:'soft',motion:'system',singleKeys:true,homePage:'dashboard',navOrder:[],hiddenNav:[],dashboardOrder:[...widgetIds],hiddenWidgets:[],dashboardLayout:'split',dashboardTitle:'',notificationRetentionMinutes:1440,desktopNotificationSeconds:10};}
const choices={theme:['light','dark'],accent:['congress','regal'],density:['comfortable','compact'],textSize:['normal','large','extra-large'],sidebarSide:['left','right'],contentWidth:['fluid','focused'],cardStyle:['soft','outlined'],motion:['system','reduced'],dashboardLayout:['split','stacked']};
export function validatePreferences(value,role){
 if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Provide personal workspace settings.');
 const defaults=defaultPreferences(),out={...defaults},pages=rolePages[role]??[];
 for(const key of Object.keys(value))if(!Object.prototype.hasOwnProperty.call(defaults,key))throw Error(`Personal settings cannot change ${key}. Official identity, designation and access are managed by administrators.`);
 for(const [key,allowed] of Object.entries({notificationRetentionMinutes:[0,1,5,15,60,1440,10080,43200],desktopNotificationSeconds:[0,5,10,30,60]})){if(value[key]!==undefined&&!allowed.includes(value[key]))throw Error(`Choose a valid ${key}.`);out[key]=value[key]??defaults[key];}
 for(const [key,allowed] of Object.entries(choices)){if(value[key]!==undefined&&!allowed.includes(value[key]))throw Error(`Choose a valid ${key}.`);out[key]=value[key]??defaults[key];}
 for(const key of ['sidebarCollapsed','singleKeys']){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error(`Invalid ${key}.`);out[key]=value[key]??defaults[key];}
 if(value.homePage!==undefined&&!pages.includes(value.homePage))throw Error('Choose a home page available to your designation.');out.homePage=value.homePage??'dashboard';
 for(const [key,allowed] of [['navOrder',pages],['hiddenNav',pages.filter(p=>p!=='dashboard')],['dashboardOrder',widgetIds],['hiddenWidgets',widgetIds]]){
  const list=value[key]??defaults[key];if(!Array.isArray(list)||list.length>allowed.length||new Set(list).size!==list.length||list.some(id=>!allowed.includes(id)))throw Error(`Invalid ${key}.`);out[key]=[...list];
 }
 // Existing accounts gain the new section beneath their welcome panel without losing their layout.
 if(!out.dashboardOrder.includes('drives'))out.dashboardOrder.splice(out.dashboardOrder.indexOf('hero')+1,0,'drives');
 out.dashboardOrder=[...out.dashboardOrder,...widgetIds.filter(id=>!out.dashboardOrder.includes(id))];
 if(value.dashboardTitle!==undefined&&(typeof value.dashboardTitle!=='string'||value.dashboardTitle.length>80))throw Error('Use up to 80 characters for your dashboard heading.');out.dashboardTitle=value.dashboardTitle?.trim()??'';
 return out;
}
