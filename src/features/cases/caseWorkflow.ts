import type { EnforcementCase } from '../../types';
export const stageNumber=(item:EnforcementCase)=>item.currentStage??Number.parseInt(item.stage,10);
export const canVerifyCase=(item:EnforcementCase,role:string)=>role==='cuc'&&!item.archived&&item.workflowStep!=='correction'&&(item.canVerify??([1,2].includes(stageNumber(item))&&['In progress','Awaiting approval','Overdue'].includes(item.status)&&!item.legal));
export const canApproveCcuc=(item:EnforcementCase,role:string)=>role==='ccuc'&&!item.archived&&stageNumber(item)===3&&item.status==='Awaiting approval'&&!item.legal;
export const hasLocation=(item:EnforcementCase)=>item.latitude!=null&&item.longitude!=null&&Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude))&&Math.abs(Number(item.latitude))<=90&&Math.abs(Number(item.longitude))<=180;
export const mapsUrl=(item:EnforcementCase)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`;
