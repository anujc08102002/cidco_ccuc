import {request} from '../../services/enforcementApi';
import type {PersonalPreferences,PersonalWorkspace} from '../../../shared/account-preferences';
export type ContinuityRecord={id:string;kind:'leave'|'transfer';status:string;sourceUserId:string;name:string;role:string;reason:string;start:string|null;end:string|null;version:string;replacementName:string|null;replacementId:string|null;affectedCases:number;restoredCases:number;returnReason:string|null;decisionReason:string|null;eligible:boolean;elapsedDays?:number;plannedDays?:number;inProgress?:boolean;createdAt:string};
export type ContinuityData={records:ContinuityRecord[];options:{id:string;name:string;role:string}[];serverDay:string;thresholdDays:number};
export const accountApi={
 load:()=>request<PersonalWorkspace>('/me/workspace'),
 save:(preferences:PersonalPreferences,revision:string)=>request<PersonalWorkspace>('/me/workspace',{method:'PUT',body:JSON.stringify({preferences,revision})}),
 photo:(image:string|null,revision:string)=>request<PersonalWorkspace>('/me/avatar',{method:'PUT',body:JSON.stringify({image,revision})}),
 continuity:()=>request<ContinuityData>('/me/continuity'),
 record:(body:{kind:'leave'|'transfer';start?:string;end?:string;reason:string})=>request('/me/continuity',{method:'POST',body:JSON.stringify(body)}),
 action:(record:ContinuityRecord,action:'assign'|'restore'|'return'|'cancel',reason:string,replacementId?:string)=>request(`${['return','cancel'].includes(action)?'/me':''}/continuity/${record.id}/${action}`,{method:'POST',body:JSON.stringify({version:record.version,reason,...(replacementId?{replacementId}:{})})})
};
