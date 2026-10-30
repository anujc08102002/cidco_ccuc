import type { EnforcementCase } from "../types";

export const baseUrl = import.meta.env.VITE_API_URL || "/api";
const tokenKey="enforceflow-session-token";
type SessionUser={id:string;username:string;email?:string|null;name:string;role:"surveyor"|"cuc"|"ccuc"|"legal"|"master";label:string;mustChangePassword:boolean;token?:string|null};
const token=()=>window.sessionStorage.getItem(tokenKey);
const remember=(user:SessionUser)=>{if(user.token)window.sessionStorage.setItem(tokenKey,user.token);return user;};
class ApiError extends Error { constructor(message:string,public status:number){super(message);} }

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token()?{Authorization:`Bearer ${token()}`}:{}), ...(init?.headers ?? {}) } });
  if(response.status===401&&!path.startsWith("/auth/"))window.dispatchEvent(new Event("enforcement:session-expired"));
  if (!response.ok) throw new ApiError((await response.json().catch(() => null))?.error ?? `API request failed (${response.status})`,response.status);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const enforcementApi = {
  login: (username: string, password: string) => request<SessionUser>("/auth/login", { method:"POST", body:JSON.stringify({ username, password }) }).then(remember),
  forgotPassword:(username:string,email:string)=>request<{message:string}>("/auth/forgot-password",{method:"POST",body:JSON.stringify({username,email})}),
  attention:()=>request<string[]>("/me/attention"),
  notifications:()=>request<AccountNotification[]>("/me/notifications"),
  driveAnnouncements:()=>request<{drives:DriveAnnouncement[];notifications:AccountNotification[]}>("/me/drive-announcements"),
  dismissNotification:(id:string)=>request<void>(`/me/notifications/${id}/dismiss`,{method:"POST",body:"{}"}),
  sendPasswordEmail:(id:string,temporaryPassword:string)=>request<{message:string}>(`/users/${id}/password-email`,{method:"POST",body:JSON.stringify({temporaryPassword})}),
  mailStatus:()=>request<{configured:boolean}>("/admin/mail-status"),
  changePassword: (username:string, temporaryPassword:string, newPassword:string) => request<SessionUser>("/auth/change-password", {method:"POST",body:JSON.stringify({username,temporaryPassword,newPassword})}).then(remember),
  restoreSession:()=>token()?request<SessionUser>("/auth/session"):Promise.resolve(null),
  signOut:()=>window.sessionStorage.removeItem(tokenKey),
  subscribeChanges(onChange:()=>void){
    const controller=new AbortController();
    let retry:number|undefined;
    const connect=async()=>{
      try{
        const response=await fetch(`${baseUrl}/events`,{headers:{Authorization:`Bearer ${token()??""}`},signal:controller.signal});
        if(response.status===401){window.dispatchEvent(new Event("enforcement:session-expired"));return;}
        if(!response.ok||!response.body)throw new Error("Live connection unavailable");
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
        while(!controller.signal.aborted){
          const {done,value}=await reader.read();if(done)break;
          buffer+=decoder.decode(value,{stream:true});
          let end;while((end=buffer.indexOf("\n\n"))!==-1){
            const message=buffer.slice(0,end);buffer=buffer.slice(end+2);
            if(message.startsWith("data:")){onChange();window.dispatchEvent(new Event("enforcement:changed"));}
          }
        }
      }catch{/* Background polling remains available while reconnecting. */}
      if(!controller.signal.aborted)retry=window.setTimeout(connect,3000);
    };
    void connect();return()=>{controller.abort();window.clearTimeout(retry)};
  },
  async isAvailable() { const health = await request<{ status: string }>("/health"); return health.status === "ok"; },
  listCases: () => request<EnforcementCase[]>("/ui/cases?includeArchived=1"),
  createCase: (item: EnforcementCase, assignments?:{cucId?:string}) => request<EnforcementCase>("/cases", { method: "POST", body: JSON.stringify({ propertyReference:item.property, sector:item.sector, node:item.node, ownerName:item.owner, surveyReference:item.survey, constructionType:item.constructionType,plotNumber:item.plotNumber,village:item.village, noticeReference:item.notice, cucId:assignments?.cucId, latitude:item.latitude, longitude:item.longitude, siteAddress:item.siteAddress, locationSource:item.locationSource, locationAccuracyMetres:item.locationAccuracyMetres, locationCapturedAt:item.locationCapturedAt,priority:item.priority,violationDescription:item.violationDescription,applicableSections:item.applicableSections }) }),
  approveCase: (caseNumber:string,locationConfirmed=false) => request<EnforcementCase>(`/cases/${encodeURIComponent(caseNumber)}/approve`, { method:"POST", body:JSON.stringify({locationConfirmed}) }),
  updateCase: (item: EnforcementCase) => request<EnforcementCase>(`/ui/cases/${encodeURIComponent(item.caseKey??item.id)}`, { method: "PATCH", body: JSON.stringify({ status:item.status, legal:item.legal, stage:item.stage, updated:item.updated }) })
  ,deleteCase: (caseNumber:string,confirmation:string) => request<void>(`/cases/${encodeURIComponent(caseNumber)}`,{method:"DELETE",body:JSON.stringify({confirmation})})
  ,editAdminCase:(item:EnforcementCase)=>request<EnforcementCase>(`/admin/cases/${encodeURIComponent(item.caseKey??item.id)}`,{method:"PATCH",body:JSON.stringify(item)})
  ,archiveCase:(caseNumber:string,days:number|null,reason:string)=>request<EnforcementCase>(`/admin/cases/${encodeURIComponent(caseNumber)}/archive`,{method:"POST",body:JSON.stringify({days,reason})})
  ,restoreCase:(caseNumber:string)=>request<EnforcementCase>(`/admin/cases/${encodeURIComponent(caseNumber)}/restore`,{method:"POST",body:"{}"})
  ,async downloadCaseBackup(format:"csv"|"json"){
    const response=await fetch(`${baseUrl}/admin/cases/backup?format=${format}`,{headers:{Authorization:`Bearer ${token()??""}`}});
    if(response.status===401)window.dispatchEvent(new Event("enforcement:session-expired"));
    if(!response.ok)throw new Error((await response.json().catch(()=>null))?.error??"Backup download failed.");
    const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]??`enforceflow-cases.${format}`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  ,listUsers: () => request<Array<{id:string;username:string;email?:string|null;name:string;role:"surveyor"|"cuc"|"ccuc"|"legal"|"master";label:string;active:boolean;mustChangePassword:boolean}>>("/users")
  ,createUser: (item:{username:string;email:string;name:string;password:string;role:string}) => request<unknown>("/users",{method:"POST",body:JSON.stringify(item)})
  ,updateUser: (id:string,item:{name?:string;email?:string;role?:string;active?:boolean;password?:string}) => request<unknown>(`/users/${id}`,{method:"PATCH",body:JSON.stringify(item)})
  ,deleteUser: (id:string,confirmation:string) => request<void>(`/users/${id}`,{method:"DELETE",body:JSON.stringify({confirmation})})
  ,listRecords: (category:string) => request<Array<{RecordId:string;Reference:string;Title:string;Details:string;Status:string;DueAt:string;UpdatedAt:string}>>(`/records/${category}`)
  ,createRecord: (category:string,item:{reference:string;title:string;details?:string;status?:string;dueAt?:string}) => request<unknown>(`/records/${category}`,{method:"POST",body:JSON.stringify(item)})
  ,updateRecord:(id:string,item:{title:string;details:string;status:string;dueAt:string|null})=>request<unknown>(`/records/${id}`,{method:"PATCH",body:JSON.stringify(item)})
  ,deleteRecord: (id:string) => request<void>(`/records/${id}`,{method:"DELETE"})
  ,dashboard: () => request<{OpenCases:number;AwaitingApproval:number;Overdue:number;LegalHolds:number;ClosedThisMonth:number}>("/dashboard")
};

export type DriveAnnouncement={DriveId:string;SerialNumber:string;PlannedAt:string;Node:string;Details:string;CreatedBy:string;CreatedAt:string};
export type AccountNotification={id:string;kind:"recovery"|"account"|"drive";title:string;status:string;createdAt:string;userId?:string|null;username?:string;name?:string|null;email?:string|null;submittedEmail?:string;driveId?:string;serial?:string;plannedAt?:string;node?:string;details?:string};
