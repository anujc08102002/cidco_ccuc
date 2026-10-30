import {fail,same} from './workflow-policy.js';
export const continuityCategory='StaffContinuity';
export const activeContinuityStates=['Recorded','Assigned','Return requested'];
const day=86400000;
export const indiaDay=(now=new Date())=>new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
export function calendarDay(value){
 fail(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value),'Choose a valid calendar date.');
 const date=new Date(value+'T00:00:00Z');fail(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value,'Choose a valid calendar date.');return +date;
}
export function leaveWindow(start,end,now=new Date()){
 const first=calendarDay(start),last=calendarDay(end),today=calendarDay(indiaDay(now));fail(last<first||last-first>3650*day,'The leave end must follow its start and be within 10 years.');
 const plannedDays=Math.round((last-first)/day)+1,elapsedDays=Math.max(0,Math.floor((Math.min(today,last)-first)/day)+1);
 return {plannedDays,elapsedDays,inProgress:today>=first&&today<=last,eligible:elapsedDays>15&&today<=last};
}
export function mayManage(actor,sourceRole){return actor.RoleCode==='master'||actor.RoleCode==='ccuc'&&['cuc','surveyor'].includes(sourceRole);}
export function assertHandover(actor,source,target,record,now=new Date()){
 fail(!mayManage(actor,source.RoleCode)||record.kind==='transfer'&&actor.RoleCode!=='master','Administrator authorization is required for this handover.',403);
 fail(same(actor.UserId,source.UserId),'Another authorized officer must process your request.',403);
 fail(!target||!target.IsActive||target.IsDeleted||target.RoleCode!==source.RoleCode||same(target.UserId,source.UserId),'Choose a different active replacement with the same designation.');
 fail(!source.IsActive||source.IsDeleted,'The source account is inactive or deleted.',409);
 if(record.kind==='leave')fail(!leaveWindow(record.start,record.end,now).eligible,'Temporary handover becomes available after 15 elapsed leave days, while the recorded leave is ongoing.',409);
}
export function assignmentFields(row,source){return ['AssignedCucId','AssignedSurveyorId','ResponsibleUserId'].filter(key=>same(row[key],source));}
