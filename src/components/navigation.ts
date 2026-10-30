import type {View} from './AppShell';

export const pageHelp:Record<View,{key:string;description:string}>={
 personalize:{key:'m',description:'Make the workspace yours. Your personal choices do not change your designation or access.'},
 continuity:{key:'v',description:'Record leave and holidays, request transfer, or manage authorized staff handovers and returns.'},
 dashboard:{key:'d',description:'Start here. See what needs attention and open your working cases.'},
 register:{key:'c',description:'Find a property or owner, then open the case to review records or take the next action.'},
 surveys:{key:'s',description:'Review site observations and submitted surveys. Open a case to check its details.'},
 documents:{key:'n',description:'Prepare, review and issue notices and orders from the linked case.'},
 hearings:{key:'h',description:'Find scheduled hearings and open a case to record attendance and proceedings.'},
 legal:{key:'l',description:'Review sourced court information and any restrictions before enforcement.'},
 demolition:{key:'e',description:'Plan enforcement drives, link cases and record completion with evidence.'},
 complaints:{key:'r',description:'Find incoming correspondence and record a response in the relevant case.'},
 reports:{key:'i',description:'Choose a register, apply filters and print or export. For a complete site report, open its case.'},
 staff:{key:'u',description:'Manage staff accounts and access. Open an account to update its details.'},
 settings:{key:'t',description:'Manage approved templates, officer signatures and workflow time limits.'},
 public:{key:'p',description:'Search the notices and orders that have been approved for public disclosure.'},
 archived:{key:'a',description:'Find retained cases, review their history or restore them to the working register.'},
 detail:{key:'',description:'Follow the case sections from site observations to the final report. Available actions depend on your role.'},
};

export const pageLabels:Record<string,string>={dashboard:'Overview',register:'Case register',surveys:'Site surveys',documents:'Notices & orders',hearings:'Hearings',legal:'Legal tracking',demolition:'Demolition',complaints:'References & complaints',reports:'Reports & exports',staff:'People & access',settings:'Settings',public:'Public disclosure',archived:'Archived cases',personalize:'My workspace',continuity:'Leave & transfers'};

export function readRoute(){
 const [path,query='']=window.location.hash.replace(/^#\/?/,'').split('?');
 const params=new URLSearchParams(query);
 return {view:(Object.prototype.hasOwnProperty.call(pageHelp,path)?path:'dashboard') as View,key:params.get('case'),tab:params.get('tab')??'Case record'};
}
export function routeTo(view:View,key?:string,tab?:string){
 const params=new URLSearchParams();if(key)params.set('case',key);if(tab)params.set('tab',tab);
 const hash=`#/${view}${params.size?'?'+params:''}`;
 if(window.location.hash!==hash)window.location.hash=hash;
}
