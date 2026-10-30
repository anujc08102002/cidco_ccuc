import {AlertCircle,ArrowRight,Inbox,Loader2,RefreshCw,type LucideIcon} from 'lucide-react';
import type {ReactNode} from 'react';

export const readable=(value:unknown)=>String(value??'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/^./,s=>s.toUpperCase()).replace(/\bCuc\b/gi,'CUC').replace(/\bCcuc\b/gi,'CCUC').replace(/\bLts\b/gi,'LTS');
export const displayDate=(value:unknown,withTime=false)=>{
 if(!value)return '—';const date=new Date(String(value));
 return Number.isNaN(date.getTime())?'—':date.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})});
};
export const stepLabels:Record<string,string>={review:'CUC verification',correction:'Survey correction','file-approval':'CCUC file approval','notice-draft':'Notice preparation','notice-approval':'Notice approval','notice-issue':'Notice issuance','notice-publication':'Notice publication',hearing:'Hearing','order-draft':'Final order preparation','order-approval':'Final order approval','order-issue':'Final order issuance','order-publication':'Final order publication',demolition:'Demolition action','record-update':'Record update',closure:'Case closure',closed:'Closed'};
export const stepLabel=(value?:string|null)=>value?stepLabels[value]??readable(value):'Not recorded';
export function StatusPill({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'blue'|'green'|'amber'|'red'}){return <span className={`portal-pill tone-${tone}`}>{children}</span>}
export function EmptyState({title,description,icon:Icon=Inbox,action}:{title:string;description:string;icon?:LucideIcon;action?:ReactNode}){return <div className="portal-empty"><span className="portal-empty-icon"><Icon size={23}/></span><h3>{title}</h3><p>{description}</p>{action}</div>}
export function LoadState({error,loading,onRetry}:{error?:string;loading?:boolean;onRetry?:()=>void}){
 if(error)return <div className="portal-message is-error" role="alert"><AlertCircle size={19}/><div><b>Unable to load records</b><p>{error}</p></div>{onRetry&&<button className="action-secondary" onClick={onRetry}><RefreshCw size={14}/> Retry</button>}</div>;
 if(loading)return <div className="portal-loading" role="status"><Loader2 size={18} className="portal-spin"/> Loading records…</div>;
 return null;
}
export function WorkspaceHeader({title,description,kicker,icon:Icon,actions}:{title:string;description:string;kicker:string;icon:LucideIcon;actions?:ReactNode}){return <header className="portal-page-header"><span className="portal-page-icon"><Icon size={23}/></span><div><span className="section-index">{kicker}</span><h2>{title}</h2><p>{description}</p></div><div className="portal-header-actions">{actions}</div></header>}
export function OpenCaseButton({onClick,children='Open case'}:{onClick:()=>void;children?:ReactNode}){return <button className="portal-link" onClick={onClick}>{children}<ArrowRight size={14}/></button>}
