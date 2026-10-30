export const notificationKey=userId=>'enforceflow-notification-inbox:'+userId.toLowerCase();
export const accountNotificationId=item=>`account:${item.id}:${item.status}`;
export const caseNotificationId=item=>`case:${item.id}:${item.workflowStep??item.status}:${!!item.legal}:${item.nextActionAt?new Date(item.nextActionAt).getTime()<Date.now():(item.overdueDays??0)>0}`;
export function inboxEntry(entry,now=Date.now()){return {firstSeen:entry?.firstSeen??now,readAt:entry?.readAt??null};}
export function notificationVisible(entry,minutes,now=Date.now()){return !minutes||!entry||now-entry.firstSeen<minutes*60000;}
export function parseInbox(value){
 try{const data=JSON.parse(value??'{}');if(!data||Array.isArray(data)||typeof data!=='object')return {};
  return Object.fromEntries(Object.entries(data).filter(([id,item])=>id.length<=512&&item&&Number.isFinite(item.firstSeen)&&item.firstSeen>=0&&(item.readAt===null||Number.isFinite(item.readAt)&&item.readAt>=0)));
 }catch{return {};}
}
