import type {EnforcementCase} from '../../types';
export const severityLegend=[{priority:'Urgent',label:'Urgent / highest severity',colour:'#dc3545',rank:3},{priority:'High',label:'High severity',colour:'#d97706',rank:2},{priority:'Normal',label:'Normal severity',colour:'#16865b',rank:1},{priority:null,label:'Priority not recorded',colour:'#64748b',rank:0}] as const;
export const severityFor=(item:EnforcementCase)=>severityLegend.find(level=>level.priority===item.priority)??severityLegend[3];
export const groupSeverity=(items:EnforcementCase[])=>items.map(severityFor).sort((a,b)=>b.rank-a.rank)[0]??severityLegend[3];
export function pinHtml(colour:string,count=1){
 return `<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true"><path d="M18 46C14 39 2 27 2 18a16 16 0 1 1 32 0c0 9-12 21-16 28Z" fill="${colour}" stroke="white" stroke-width="2"/><circle cx="18" cy="18" r="8" fill="white"/>${count>1?`<text x="18" y="22" text-anchor="middle" font-size="11" font-family="Arial" font-weight="700" fill="${colour}">${count}</text>`:`<circle cx="18" cy="18" r="4" fill="${colour}"/>`}</svg>`;
}
