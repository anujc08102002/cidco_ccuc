import { ArrowLeft, ArrowRight, CheckCircle2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Role } from "../features/auth/SignIn";
import "./WelcomeWalkthrough.css";

type TourStep={target:string;selector?:string;title:string;copy:string};
const roleIntroductions:Record<Role,TourStep>={
 surveyor:{target:"role-introduction",selector:".hero-copy",title:"Your field-survey desk",copy:"Start site surveys, capture the site location, and create cases for CUC verification. Your dashboard shows the cases assigned to your surveyor account."},
 cuc:{target:"role-introduction",selector:".hero-copy",title:"Your verification desk",copy:"Review assigned survey submissions, check the case record, and record the verification decision and next action."},
 ccuc:{target:"role-introduction",selector:".hero-copy",title:"Your approval desk",copy:"Review case files at the approval stage, consult notices and orders, and monitor pending decisions through your register and reports."},
 legal:{target:"role-introduction",selector:".hero-copy",title:"Your legal-coordination desk",copy:"Review legal matters, maintain proceeding records, and keep the enforcement team informed of legal holds and updates."},
 master:{target:"role-introduction",selector:".hero-copy",title:"Your administration desk",copy:"Oversee enforcement cases and operational records across the available modules. Manage users, configuration, and account continuity from this workspace."}
};
const common={
 register:{target:"nav-register",title:"Case register",copy:"Open the register to search and filter cases. Select a case to inspect its stage, responsible officer, status, and next action."},
 newCase:{target:"new-case",title:"Create a survey case",copy:"Use New case to enter the property and site location, name the survey, and select the responsible CUC before submitting."},
 map:{target:"case-map",selector:".operations-map-card",title:"Cases by location",copy:"The map panel brings case locations and workflow colours together. Hover over an available marker to inspect its case summary."},
 account:{target:"account",title:"Your profile and account options",copy:"Open your profile to find Going on leave, Request transfer, Public disclosure, and Sign out."},
 leave:{target:"leave",title:"Record planned leave",copy:"Going on leave is inside this profile menu. Enter the start and end dates in the leave dialog; the dashboard displays the recorded duration."},
 transfer:{target:"transfer",title:"Request account transfer",copy:"Request transfer is in the same profile menu. Use it to begin the existing account-reassignment process."}
} satisfies Record<string,TourStep>;
const roleSteps:Record<Role,TourStep[]>={
 surveyor:[roleIntroductions.surveyor,common.newCase,{target:"nav-surveys",title:"Site surveys and findings",copy:"Use Site surveys to maintain inspection records. Keep the survey reference, findings, and supporting case information together."},common.map,common.register,{target:"nav-documents",title:"Notices and orders",copy:"Consult the notices and orders module for the formal records relevant to your enforcement work."},{target:"nav-hearings",title:"Hearing records",copy:"Use Hearings to review scheduled hearings and their recorded outcomes."},common.account,common.leave],
 cuc:[roleIntroductions.cuc,common.register,{target:"nav-surveys",title:"Review survey submissions",copy:"Use Site surveys alongside the assigned case register to review field information before recording your verification decision."},{target:"nav-documents",title:"Notice and order records",copy:"Consult formal notice and order records while reviewing the case file and final-order information."},{target:"nav-hearings",title:"Hearing outcomes",copy:"Review hearing records and their outcomes when checking a case's next required action."},{target:"nav-reports",title:"Verification reports",copy:"Open Intelligence for the report records available to your role."},common.account,{...common.leave,copy:"Record your leave dates here. Leave longer than 15 days is highlighted for continuity review by CCUC and the Master Administrator."}],
 ccuc:[roleIntroductions.ccuc,common.register,{target:"approval-summary",selector:".signal-strip>div:nth-child(2)",title:"Cases awaiting approval",copy:"This summary counts cases awaiting approval in the current view. Open the case register to review each file and its current stage."},{target:"nav-documents",title:"Authorized formal records",copy:"Review notices and orders as part of the approval process. The underlying case workflow remains the source of the recorded decision."},{target:"nav-reports",title:"Approval oversight",copy:"Use Intelligence to consult report records and monitor the work available to your role."},{target:"notifications",title:"Approval and continuity notifications",copy:"Open the notification bell to review listed exceptions. CUC leave exceeding 15 days is surfaced for continuity review."},common.account],
 legal:[roleIntroductions.legal,{target:"nav-legal",title:"Legal records",copy:"Open Legal tracking to maintain proceeding references, review details, and legal-record statuses."},common.register,{target:"legal-summary",selector:".legal-focus",title:"Legal holds in the current view",copy:"This panel counts cases on legal hold and provides a shortcut to legal records. Review the proceeding information before recording a legal update."},{target:"nav-reports",title:"Legal reporting",copy:"Use Intelligence for the reporting records available to the Legal Coordinator."},{target:"notifications",title:"Review legal exceptions",copy:"The notification bell opens the list of exceptions for review. Consult the legal record before taking the next case action."},common.account],
 master:[roleIntroductions.master,{target:"navigation",title:"All operational modules",copy:"Your navigation includes the enforcement register, surveys, notices, hearings, legal tracking, demolition, documents, reports, users, and configuration."},common.newCase,common.map,common.register,{target:"nav-staff",title:"People and access",copy:"Manage user records, role assignments, and temporary-password resets in People & access. Existing account rules still apply."},{target:"nav-settings",title:"Workflow configuration",copy:"Use Configuration to maintain the operational configuration records already supported by the portal."},{target:"notifications",title:"Administrative exceptions",copy:"Review notifications and account-continuity requests here, including reported transfer requests and extended CUC leave."},common.account,common.transfer]
};

type Box={top:number;left:number;width:number;height:number};
type Position={top:number;left:number};
const sameBox=(a:Box|null,b:Box|null)=>a===b||Boolean(a&&b&&a.top===b.top&&a.left===b.left&&a.width===b.width&&a.height===b.height);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(v,Math.max(min,max)));
function placePopover(box:Box|null,width:number,height:number):Position{
 const margin=16,gap=16,vw=window.innerWidth,vh=window.innerHeight;
 if(!box)return {left:(vw-width)/2,top:(vh-height)/2};
 const candidates=[
  {left:box.left+box.width+gap,top:box.top},
  {left:box.left-width-gap,top:box.top},
  {left:box.left,top:box.top+box.height+gap},
  {left:box.left,top:box.top-height-gap}
 ].map(candidate=>{
  const position={left:clamp(candidate.left,margin,vw-width-margin),top:clamp(candidate.top,margin,vh-height-margin)};
  const overlapWidth=Math.max(0,Math.min(position.left+width,box.left+box.width)-Math.max(position.left,box.left));
  const overlapHeight=Math.max(0,Math.min(position.top+height,box.top+box.height)-Math.max(position.top,box.top));
  return {...position,score:overlapWidth*overlapHeight+Math.abs(candidate.left-position.left)+Math.abs(candidate.top-position.top)};
 });
 candidates.sort((a,b)=>a.score-b.score);
 return candidates[0];
}

export function WelcomeWalkthrough({role,roleLabel,onClose,onTargetChange}:{role:Role;roleLabel:string;onClose:()=>void;onTargetChange:(target:string|null)=>void}){
 const steps=useMemo(()=>roleSteps[role],[role]);
 const [step,setStep]=useState(0),[box,setBox]=useState<Box|null>(null);
 const [popoverPosition,setPopoverPosition]=useState<Position>({top:16,left:16});
 const popover=useRef<HTMLElement>(null),nextButton=useRef<HTMLButtonElement>(null);
 const current=steps[step];
 const next=useCallback(()=>step===steps.length-1?onClose():setStep(value=>value+1),[step,steps.length,onClose]);
 const previous=useCallback(()=>setStep(value=>Math.max(0,value-1)),[]);
 const position=useCallback(()=>{
  const element=document.querySelector<HTMLElement>(current.selector??`[data-tour="${current.target}"]`);
  const rect=element?.getBoundingClientRect();
  const visible=Boolean(rect&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<window.innerHeight&&rect.left<window.innerWidth);
  const target=visible&&rect?{top:Math.max(6,rect.top-6),left:Math.max(6,rect.left-6),width:Math.max(0,Math.min(window.innerWidth-6,rect.right+6)-Math.max(6,rect.left-6)),height:Math.max(0,Math.min(window.innerHeight-6,rect.bottom+6)-Math.max(6,rect.top-6))}:null;
  setBox(old=>sameBox(old,target)?old:target);
  const panel=popover.current?.getBoundingClientRect();
  if(panel){
   const placed=placePopover(target,panel.width,panel.height);
   setPopoverPosition(old=>old.top===placed.top&&old.left===placed.left?old:placed);
  }
 },[current]);
 useLayoutEffect(()=>{
  onTargetChange(current.target);
  let frame=0;
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position)};
  const element=document.querySelector<HTMLElement>(current.selector??`[data-tour="${current.target}"]`);
  if(element&&element.getBoundingClientRect().width>0){
   const rect=element.getBoundingClientRect();
   if(rect.top<70||rect.bottom>window.innerHeight-20)element.scrollIntoView({block:"center",behavior:"instant"});
  }
  position();schedule();
  const mutations=new MutationObserver(schedule);
  mutations.observe(document.querySelector(".new-shell")??document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  const sizes=new ResizeObserver(schedule);
  if(popover.current)sizes.observe(popover.current);
  window.addEventListener("resize",schedule);
  window.addEventListener("scroll",schedule,true);
  return()=>{cancelAnimationFrame(frame);mutations.disconnect();sizes.disconnect();window.removeEventListener("resize",schedule);window.removeEventListener("scroll",schedule,true)};
 },[current,onTargetChange,position]);
 useEffect(()=>{nextButton.current?.focus({preventScroll:true})},[step]);
 useEffect(()=>{
  const previousFocus=document.activeElement as HTMLElement|null;
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();onClose()}
   else if(event.key==="ArrowRight"){event.preventDefault();event.stopImmediatePropagation();next()}
   else if(event.key==="ArrowLeft"){event.preventDefault();event.stopImmediatePropagation();previous()}
   else if(event.key.toLowerCase()==="n"||event.key==="/"||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k")){event.preventDefault();event.stopImmediatePropagation()}
   else if(event.key==="Tab"){
    const buttons=Array.from(popover.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")??[]);
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    const destination=event.shiftKey?(index<=0?buttons.length-1:index-1):(index>=buttons.length-1?0:index+1);
    event.preventDefault();event.stopImmediatePropagation();buttons[destination]?.focus();
   }
  };
  window.addEventListener("keydown",keyboard,true);
  return()=>{window.removeEventListener("keydown",keyboard,true);previousFocus?.focus({preventScroll:true})};
 },[next,previous,onClose]);
 const shadePanels=box?[
  {top:0,left:0,right:0,height:box.top},
  {top:box.top,left:0,width:box.left,height:box.height},
  {top:box.top,left:box.left+box.width,right:0,height:box.height},
  {top:box.top+box.height,left:0,right:0,bottom:0}
 ]:[{inset:0}];
 return <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-copy">
  {shadePanels.map((style,index)=><div key={index} className="tour-shade" style={style as CSSProperties}/>)}
  {box&&<div className="tour-spotlight" style={box}/>}
  <section ref={popover} className="tour-popover" style={popoverPosition}>
   <button className="tour-close" onClick={onClose} aria-label="Close introduction"><X size={18}/></button>
   <span className="section-index">YOUR WORKSPACE · {roleLabel.split(" · ")[0].toUpperCase()}</span>
   <h2 id="tour-title">{current.title}</h2><p id="tour-copy">{current.copy}</p>
   <div className="walkthrough-progress"><span>{step+1} of {steps.length}</span><div role="progressbar" aria-label="Introduction progress" aria-valuenow={step+1} aria-valuemin={1} aria-valuemax={steps.length}><i style={{width:`${((step+1)/steps.length)*100}%`}}/></div></div>
   <footer><button className="tour-skip" onClick={onClose}>Skip tour</button><div><button className="action-secondary" onClick={previous} disabled={step===0} aria-label="Previous highlight"><ArrowLeft size={15}/><span>Back</span></button><button ref={nextButton} className="action-primary" onClick={next}>{step===steps.length-1?<>Start working <CheckCircle2 size={15}/></>:<>Next <ArrowRight size={15}/></>}</button></div></footer>
  </section>
 </div>;
}
