export type InboxEntry={firstSeen:number;readAt:number|null};
export type Inbox=Record<string,InboxEntry>;
export function notificationKey(userId:string):string;
export function accountNotificationId(item:{id:string;status:string}):string;
export function caseNotificationId(item:{id:string;status:string;workflowStep?:string|null;legal:boolean;nextActionAt?:string|null;overdueDays?:number}):string;
export function inboxEntry(entry?:InboxEntry,now?:number):InboxEntry;
export function notificationVisible(entry:InboxEntry|undefined,minutes:number,now?:number):boolean;
export function parseInbox(value:string|null):Inbox;
