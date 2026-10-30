import {AlertTriangle,ArrowLeft,CalendarDays,Check,CheckCircle2,FileSignature,FileText,Files,HardHat,History,LayoutDashboard,MapPin,Scale,UserRound} from 'lucide-react';
import {useEffect,useState} from 'react';
import type {EnforcementCase} from '../../types';
import {enforcementApi} from '../../services/enforcementApi';
import {displayDate,StatusPill} from '../../components/PortalUi';
import {SiteReport} from './SiteReport';
import {routeTo} from '../../components/navigation';
import {AdminCaseControls} from './AdminCaseControls';
import {CaseSurveyDetails} from './CaseSurveyDetails';
import {CaseLocation} from './CaseLocation';
import {canVerifyCase,canApproveCcuc,hasLocation,stageNumber} from './caseWorkflow';
import {CaseWorkflowPanel,type WorkflowSection} from './CaseWorkflowPanel';

const tabs:{label:string;section:WorkflowSection|'report';icon:typeof Files}[]=[{label:'Case record',section:'overview',icon:LayoutDashboard},{label:'Evidence',section:'evidence',icon:Files},{label:'Documents',section:'documents',icon:FileSignature},{label:'Hearings',section:'hearings',icon:CalendarDays},{label:'References',section:'references',icon:FileText},{label:'Legal & routing',section:'legal',icon:Scale},{label:'Demolition',section:'demolition',icon:HardHat},{label:'Audit history',section:'history',icon:History},{label:'Site report',section:'report',icon:FileText}];
const lifecycle=['Survey and registration','CUC verification','CCUC file approval','Notice preparation','Approval and publication','Hearing and monitoring','Final order','Demolition and closure'];
type Props={item:EnforcementCase;role:string;initialTab?:string;onBack:()=>void;onApproved:(item:EnforcementCase)=>void;onLegal:()=>void;onCaseChanged?:(item:EnforcementCase|null)=>void;onNotify?:(message:string)=>void};
export function CaseDetail({item,role,initialTab='Case record',onBack,onApproved,onCaseChanged,onNotify}:Props){
 const [tab,setTab]=useState(tabs.some(t=>t.label===initialTab)?initialTab:'Case record'),[locationConfirmed,setLocationConfirmed]=useState(false),[approving,setApproving]=useState(false),[approvalError,setApprovalError]=useState('');
 useEffect(()=>{if(tabs.some(t=>t.label===initialTab))setTab(initialTab);},[initialTab]);
 const selectTab=(label:string)=>{setTab(label);routeTo('detail',item.caseKey??item.id,label);};
 const section=tabs.find(t=>t.label===tab)?.section??'overview',currentStage=stageNumber(item),canVerify=canVerifyCase(item,role),canApprove=canApproveCcuc(item,role),validLocation=hasLocation(item);
 const approve=async()=>{setApproving(true);setApprovalError('');try{onApproved(await enforcementApi.approveCase(item.caseKey??item.id,locationConfirmed));}catch(e){setApprovalError(e instanceof Error?e.message:'The case could not be approved.');}finally{setApproving(false);}};
 return <div className="portal-case-page">
  <button className="back-link" onClick={onBack}><ArrowLeft size={14}/> Return to register</button>
  <section className="case-identity"><div className="case-monogram"><span>{item.node.slice(0,2).toUpperCase()}</span><small>NODE</small></div><div><span className="section-index">ENFORCEMENT CASE</span><h2>{item.id}</h2><p>{item.property} · {item.node}</p></div><div className="identity-status"><StatusPill tone={item.status==='Closed'?'green':item.legal?'red':item.status==='Awaiting approval'?'amber':'blue'}>{item.status}</StatusPill>{item.archived&&<StatusPill>Archived</StatusPill>}</div></section>
  {item.legal&&<div className="portal-message is-error" role="alert" style={{marginTop:16}}><AlertTriangle size={20}/><div><b>Enforcement restriction recorded</b><p>Review the authoritative legal record before proceeding. Restricted enforcement actions require authorized clearance.</p></div><button className="action-secondary" onClick={()=>selectTab('Legal & routing')}><Scale size={14}/> Review legal record</button></div>}
  {item.status==='Closed'&&<div className="report-completion"><CheckCircle2 size={22}/><div><b>Case completed. Your site report is ready.</b><p>Print the full record or save the PDF with its original attachments.</p></div><button className="action-primary" onClick={()=>selectTab('Site report')}>Open final report <FileText size={16}/></button></div>}
  <div className="portal-case-tabs" role="tablist" aria-label="Case sections">{tabs.map(t=><button key={t.label} role="tab" id={`case-tab-${t.section}`} aria-controls={`case-panel-${t.section}`} aria-selected={tab===t.label} tabIndex={tab===t.label?0:-1} onClick={()=>selectTab(t.label)} onKeyDown={e=>{if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=tabs.findIndex(x=>x.label===tab);const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[next].label);document.getElementById(`case-tab-${tabs[next].section}`)?.focus();}}><t.icon size={15}/>{t.label}</button>)}</div>
  <div className="portal-case-body"><main key={section} className="portal-case-main" role="tabpanel" id={`case-panel-${section}`} aria-labelledby={`case-tab-${section}`}>
   {section==='overview'&&<div className="portal-overview-content">
    <div className="property-grid"><div><MapPin size={19}/><span>Property identifier<b>{item.property}</b></span></div><div><UserRound size={19}/><span>Owner / occupier<b>{item.owner}</b></span></div><div><FileText size={19}/><span>Notice reference<b>{item.notice}</b></span></div></div>
    <CaseSurveyDetails item={item}/>
    {item.constructionType&&<p className="portal-construction-type"><b>Construction type:</b> {item.constructionType}</p>}
    <details className="portal-location-details"><summary><MapPin size={15}/> Recorded site location <span>{validLocation?`${Number(item.latitude).toFixed(6)}, ${Number(item.longitude).toFixed(6)}`:'Not recorded'}</span></summary><section className="case-site-panel"><CaseLocation item={item} preview/></section></details>
    {canVerify&&<section className="verification-panel"><span className="section-index">CUC VERIFICATION</span><h4>Verify the survey and recorded site location</h4><p>{validLocation?`${Number(item.latitude).toFixed(6)}, ${Number(item.longitude).toFixed(6)}${item.locationAccuracyMetres?` · accuracy ${item.locationAccuracyMetres} m`:''}`:'A valid recorded site location is required before verification.'}</p><label><input type="checkbox" checked={locationConfirmed} disabled={!validLocation||approving} onChange={e=>setLocationConfirmed(e.target.checked)}/> I have checked the geo-location and the case details.</label><button className="action-primary" disabled={!locationConfirmed||!validLocation||approving} onClick={()=>void approve()}><CheckCircle2 size={15}/>{approving?'Verifying…':'Verify & approve case'}</button>{approvalError&&<p className="verification-error" role="alert">{approvalError}</p>}</section>}
    {canApprove&&<section className="verification-panel"><span className="section-index">CCUC APPROVAL</span><h4>CUC verification completed</h4><p>Review the verified survey and recorded site location before approving notice preparation.</p><button className="action-primary" disabled={approving} onClick={()=>void approve()}><CheckCircle2 size={15}/>{approving?'Approving…':'Approve for notice generation'}</button>{approvalError&&<p className="verification-error" role="alert">{approvalError}</p>}</section>}
   </div>}
   {section==='report'?<SiteReport item={item}/>:<CaseWorkflowPanel item={item} role={role} section={section} onChanged={changed=>onCaseChanged?.(changed)}/>}
  </main><aside className="portal-case-sidebar">
   <section className="portal-side-card"><h3>Case responsibility</h3><dl><div><dt>Assigned CUC</dt><dd>{item.assignedCuc}</dd></div><div><dt>Surveyor</dt><dd>{item.surveyor}</dd></div><div><dt>Responsible officer</dt><dd>{item.officer}</dd></div><div><dt>Next deadline</dt><dd className={(item.overdueDays??0)>0?'red-text':''}>{item.nextActionAt?displayDate(item.nextActionAt):'Not scheduled'}{(item.overdueDays??0)>0&&<small> · {item.overdueDays} days overdue</small>}</dd></div><div><dt>Applicable sections</dt><dd>{item.applicableSections?.length?item.applicableSections.map(s=>`Sec. ${s}`).join(', '):'Not recorded'}</dd></div></dl></section>
   <section className="portal-side-card"><h3>Enforcement lifecycle</h3><ol className="portal-lifecycle">{lifecycle.map((label,i)=>{const complete=i+1<currentStage||item.status==='Closed';return <li key={label} className={complete?'is-done':i+1===currentStage?'is-current':''}><span>{complete?<Check size={12}/>:i+1}</span>{label}</li>})}</ol></section>
  </aside></div>
  {role==='master'&&<details className="portal-admin-details"><summary><ShieldIcon/> Administrator case controls</summary><AdminCaseControls item={item} onChanged={changed=>onCaseChanged?.(changed)} onNotify={onNotify??(()=>{})}/></details>}
 </div>;
}
function ShieldIcon(){return <CheckCircle2 size={15}/>}
