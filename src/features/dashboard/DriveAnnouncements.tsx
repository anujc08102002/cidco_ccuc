import {useState} from 'react';
import {CalendarDays,HardHat,X} from 'lucide-react';
import type {AccountNotification,DriveAnnouncement} from '../../services/enforcementApi';
import {useDialogFocus} from '../../components/useDialogFocus';

export const driveDate=(value:string)=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'full',timeStyle:'short'})+' IST';
export function DriveDashboard({drives,error,onRetry}:{drives:DriveAnnouncement[];error:string;onRetry:()=>void}){
 return <section className="drive-dashboard" aria-labelledby="drive-dashboard-title" id="demolition-drives"><header><HardHat size={22}/><div><span className="section-index">CCUC ANNOUNCEMENTS</span><h3 id="drive-dashboard-title">Upcoming demolition drives</h3></div></header>{error?<div role="alert"><p>{error}</p><button className="action-secondary" onClick={onRetry}>Retry drive announcements</button></div>:drives.length?<div className="drive-dashboard-list">{drives.map(d=><article key={d.DriveId}><h4>{d.SerialNumber} <span>{d.Node}</span></h4><p><CalendarDays size={15}/><strong>{driveDate(d.PlannedAt)}</strong></p><p className="drive-plan-details">{d.Details}</p></article>)}</div>:<p>No upcoming demolition drives announced.</p>}</section>;
}
const readSeen=(key:string):string[]=>{try{const saved=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(saved)?saved.filter(x=>typeof x==='string'):[];}catch{return [];}};
export function DriveAlert({items,userId,enabled,onDashboard}:{items:AccountNotification[];userId:string;enabled:boolean;onDashboard:()=>void}){
 const key=`enforceflow-drive-alerts:${userId.toLowerCase()}`;
 const [seen,setSeen]=useState(()=>readSeen(key));
 const item=enabled?items.find(n=>n.kind==='drive'&&!seen.includes(n.id)):undefined;
 const dismiss=()=>{if(!item)return;const next=[...seen,item.id];setSeen(next);try{localStorage.setItem(key,JSON.stringify(next.filter(id=>!id.endsWith(':today')).slice(-2000)));}catch{/* Keep acknowledgement in this session. */}};
 const ref=useDialogFocus<HTMLDivElement>(!!item,dismiss);
 if(!item)return null;
 return <div className="drive-alert-overlay"><div ref={ref} className="drive-alert" role="alertdialog" aria-modal="true" aria-labelledby="drive-alert-title" aria-describedby="drive-alert-details"><button className="drive-alert-close" aria-label="Acknowledge drive alert" onClick={dismiss}><X size={20}/></button><HardHat size={30}/><span className="section-index">CCUC DEMOLITION DRIVE</span><h2 id="drive-alert-title">{item.title}</h2><div id="drive-alert-details"><p><strong>{item.node}</strong></p><p>{item.plannedAt&&driveDate(item.plannedAt)}</p><p className="drive-plan-details">{item.details}</p><small>Drive details remain available on your dashboard.</small></div><footer><button className="action-secondary" onClick={dismiss}>Acknowledge</button><button className="action-primary" onClick={()=>{dismiss();onDashboard();}}>View dashboard</button></footer></div></div>;
}
