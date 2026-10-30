export class WorkflowError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const fail=(condition,message,status=400)=>{if(condition)throw new WorkflowError(message,status);};
export const same=(a,b)=>a!=null&&b!=null&&String(a).toLowerCase()===String(b).toLowerCase();
export const defaults={hearingDays:15,orderDays:15,noticeDays:15,reviewDays:15,demolitionDays:15,publicationDays:15,closureDays:15,escalateDays:1,dueSoonDays:3};
export function settingsValue(value){
 const result={...defaults,...value};
 for(const [key,number] of Object.entries(result))fail(!(key in defaults)||!Number.isInteger(number)||number<0||number>3650,`Invalid setting: ${key}`);
 return result;
}
export const dueDate=(start,days)=>new Date(new Date(start).getTime()+days*86400000);
export const inferredStep=c=>c.WorkflowStep??({1:'review',2:'review',3:'file-approval',4:'notice-draft',5:'notice-approval',6:'hearing',7:'order-draft',8:'demolition'}[c.CurrentStage]);
export function canOperate(user,c){return user.RoleCode==='cuc'&&(same(user.UserId,c.AssignedCucId)||c.Delegated===true);}
export function transition(user,c,action,data,config,now=new Date()){
 const step=inferredStep(c),operational=canOperate(user,c),supervisory=user.RoleCode==='ccuc';
 fail(c.IsArchived||c.Status==='Closed','Case is archived or closed.',409);
 const definitions={
  'return-survey':[['review'],operational,'correction',1,'reviewDays'],
  'resubmit':[['correction'],user.RoleCode==='surveyor'&&same(user.UserId,c.AssignedSurveyorId),'review',1,'reviewDays'],
  'submit-notice':[['notice-draft'],operational,'notice-approval',5,'noticeDays'],
  'approve-notice':[['notice-approval'],supervisory,'notice-issue',5,'noticeDays'],
  'return-notice':[['notice-approval'],supervisory,'notice-draft',4,'noticeDays'],
  'issue-notice':[['notice-issue'],operational,'notice-publication',5,'publicationDays'],
  'publish-notice':[['notice-publication'],operational,'hearing',6,'hearingDays'],
  'complete-hearing':[['hearing'],operational,'order-draft',7,'orderDays'],
  'submit-order':[['order-draft'],operational,'order-approval',7,'orderDays'],
  'approve-order':[['order-approval'],supervisory,'order-issue',7,'orderDays'],
  'return-order':[['order-approval'],supervisory,'order-draft',7,'orderDays'],
  'issue-order':[['order-issue'],operational,'order-publication',7,'publicationDays'],
  'publish-order':[['order-publication'],operational,'demolition',8,'demolitionDays'],
  'complete-demolition':[['demolition'],operational,'record-update',8,'publicationDays'],
  'update-record':[['record-update'],operational,'closure',8,'closureDays'],
  close:[['closure'],operational,'closed',8,null]
 };
 const rule=definitions[action];fail(!rule,'Unknown workflow action.');
 fail(!rule[1],'Your role or assignment cannot perform this action.',403);
 fail(!rule[0].includes(step),`Action is not available at ${step}.`,409);
 fail(c.LegalHold&&['issue-notice','issue-order','complete-demolition','close'].includes(action),'An active legal restriction blocks this action.',409);
 fail(typeof data.reason!=='string'||!data.reason.trim(),'Record a reason or review remark.');
 return {step:rule[2],stage:rule[3],status:action==='close'?'Closed':rule[2].endsWith('approval')?'Awaiting approval':'In progress',due:rule[4]?dueDate(now,config[rule[4]]):null};
}
export function publicProjection(row){return {documentId:row.DocumentId,type:row.DocumentType,reference:row.ReferenceNumber,version:row.VersionNumber,publishedAt:row.PublishedAt,name:row.OwnerName,plot:row.PlotNumber,survey:row.SurveyReference,node:row.Node};}
export function validateFile(b){
 fail(!['site-photo','before-demolition','after-demolition','evidence','hearing-report','reference','signed-notice','signed-order'].includes(b.category),'Invalid evidence category.');
 fail(typeof b.fileName!=='string'||b.fileName.length>200||!b.fileName||/[\\/\r\n]/.test(b.fileName),'Invalid file name.');
 fail(typeof b.base64!=='string'||b.base64.length>7_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64),'Invalid file data.');
 const bytes=Buffer.from(b.base64,'base64');fail(!bytes.length||bytes.length>5*1024*1024,'File must be between 1 byte and 5 MiB.');
 const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':null;
 fail(!mime,'Only PDF, JPEG and PNG files with matching signatures are accepted.');
 fail(!({ 'application/pdf':/\.pdf$/i,'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i }[mime]).test(b.fileName),'File extension does not match its contents.');
 fail(['site-photo','before-demolition','after-demolition'].includes(b.category)&&mime==='application/pdf','Photograph categories require an image.');
 return {bytes,mime};
}
