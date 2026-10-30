import {useEffect,useRef} from 'react';

/** Keep keyboard focus in a modal and return it to the invoking control on close. */
export function useDialogFocus<T extends HTMLElement>(open:boolean,onClose:()=>void,blocked=false){
 const ref=useRef<T>(null),close=useRef(onClose),locked=useRef(blocked);close.current=onClose;locked.current=blocked;
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const frame=requestAnimationFrame(()=>{(ref.current?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')??ref.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();});
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!locked.current){event.preventDefault();close.current();return;}
   if(event.key!=='Tab')return;
   const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],summary,button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',keydown);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[open]);
 return ref;
}
