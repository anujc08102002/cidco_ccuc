import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { cidcoLogo } from "../../assets/cidcoLogo";
import { enforcementApi } from "../../services/enforcementApi";
import "./SignIn.css";

export type Role = "surveyor" | "cuc" | "ccuc" | "legal" | "master";
export const accounts: Record<Role, { name: string; label: string; user: string }> = {
 surveyor:{name:"Field Surveyor",label:"Field Surveyor",user:""}, cuc:{name:"Controller of Unauthorized Constructions",label:"Controller of Unauthorized Constructions",user:""},
 ccuc:{name:"Chief Controller of Unauthorized Constructions",label:"Chief Controller of Unauthorized Constructions",user:""}, legal:{name:"Legal Coordinator",label:"Legal Coordinator · CIDCO Legal Cell",user:""}, master:{name:"Master Administrator",label:"Master Administrator · Full Control",user:""}
};
export function SignIn({onSuccess}:{onSuccess:(role:Role,name:string)=>void}) {
 const [username,setUsername]=useState(""); const [password,setPassword]=useState(""); const [newPassword,setNewPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState(""); const [pending,setPending]=useState<{role:Role;name:string;username:string;temporaryPassword:string}|null>(null); const [visible,setVisible]=useState(false); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
 const finish=(user:{role:Role;name:string;username:string;label:string})=>{accounts[user.role]={name:user.name,label:user.label,user:user.username};onSuccess(user.role,user.name)};
 const login=async()=>{setLoading(true);setError("");try{const user=await enforcementApi.login(username,password);if(typeof user.mustChangePassword!=="boolean")throw new Error("The API server is out of date. Stop its existing process and run npm run api again.");if(user.mustChangePassword){setPending({role:user.role,name:user.name,username:user.username,temporaryPassword:password});setNewPassword("");setConfirmPassword("")}else finish(user)}catch(e){setError(e instanceof Error?e.message:"Sign-in failed. Verify that the API and SQL Server are running.")}finally{setLoading(false)}};
 const changePassword=async()=>{if(newPassword.length<12)return setError("Your new password must contain at least 12 characters.");if(newPassword!==confirmPassword)return setError("The new-password entries do not match.");if(!pending)return;setLoading(true);setError("");try{await enforcementApi.changePassword(pending.username,pending.temporaryPassword,newPassword);finish({...pending,label:accounts[pending.role].label})}catch(e){setError(e instanceof Error?e.message:"Password update failed.")}finally{setLoading(false)}};

 const [recoveryHelp,setRecoveryHelp]=useState(false);
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(loading)return;
  if(pending)void changePassword();
  else if(username.trim()&&password)void login();
 };
 const passwordField=(id:string,value:string,setValue:(value:string)=>void,label:string,autoComplete:string)=>(
  <label className="ef-auth-field" htmlFor={id}>
   <span>{label}</span>
   <div className="ef-auth-input">
    <LockKeyhole size={17} aria-hidden="true"/>
    <input id={id} value={value} onChange={e=>setValue(e.target.value)} type={visible?"text":"password"} autoComplete={autoComplete} placeholder={label} required disabled={loading}/>
    <button type="button" onClick={()=>setVisible(v=>!v)} aria-label={visible?"Hide password":"Show password"} aria-pressed={visible}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button>
   </div>
  </label>
 );
 return (
  <main className="ef-auth-page">
   <header className="ef-auth-header">
    <img className="ef-auth-logo" src={cidcoLogo} alt="CIDCO — We Make Cities"/>
    <div className="ef-auth-location"><strong>Raigad Bhawan</strong><span>Navi Mumbai, Maharashtra</span></div>
   </header>
   <div className="ef-auth-center">
    <section className="ef-auth-story" aria-labelledby="auth-story-title"><div className="auth-story-content"><span className="auth-eyebrow"><span/> THE CIDCO ENFORCEMENT WORKSPACE</span><h2 id="auth-story-title">Better oversight.<br/>Clearer decisions.<br/><em>One workspace.</em></h2><p>From the first site visit to the final report, keep every case moving with clarity.</p><div className="auth-workflow" aria-label="Case journey"><span>Survey</span><ArrowRight size={14}/><span>Review</span><ArrowRight size={14}/><span>Action</span><ArrowRight size={14}/><span>Report</span></div></div><div className="auth-story-bottom"><ShieldCheck size={19}/><span><b>Purpose-built for public service</b><small>Connected records. Accountable decisions.</small></span></div></section>
    <section className="ef-auth-card" aria-labelledby="ef-auth-title">
     <header className="ef-auth-heading">
      <span className="auth-form-kicker">WELCOME TO YOUR WORKSPACE</span><h1 id="ef-auth-title">Enforce<span>Flow</span></h1>
      <p>Unauthorized Construction<br className="ef-auth-mobile-break"/> Enforcement System</p>
      
     </header>
     <form className="ef-auth-form" onSubmit={submit} aria-busy={loading}>
      <div className="ef-auth-form-intro"><h2>{pending?"Set your password":"Sign in"}</h2><p>{pending?"Create a personal password of at least 12 characters.":"Enter your official credentials to continue."}</p></div>
      {pending?<>
       {passwordField("ef-new-password",newPassword,setNewPassword,"New password","new-password")}
       {passwordField("ef-confirm-password",confirmPassword,setConfirmPassword,"Confirm new password","new-password")}
      </>:<>
       <label className="ef-auth-field" htmlFor="ef-username"><span>Official username</span><div className="ef-auth-input"><UserRound size={17} aria-hidden="true"/><input id="ef-username" value={username} onChange={e=>setUsername(e.target.value)} autoFocus autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="Enter your official username" required disabled={loading}/></div></label>
       {passwordField("ef-password",password,setPassword,"Password","current-password")}
       <div className="ef-auth-options"><span><ShieldCheck size={13} aria-hidden="true"/> Secure employee access</span><button type="button" onClick={()=>setRecoveryHelp(v=>!v)} aria-expanded={recoveryHelp} aria-controls="ef-recovery">Forgot password?</button></div>
       {recoveryHelp&&<p id="ef-recovery" className="ef-auth-help" role="status">Contact your Master Administrator to request a temporary password. Automated password recovery is not available.</p>}
      </>}
      {error&&<p className="ef-auth-error" role="alert">{error}</p>}
      <button type="submit" className="ef-auth-submit" disabled={loading||(pending?(!newPassword||!confirmPassword):(!username.trim()||!password))}>{loading?(pending?"Updating password…":"Verifying access…"):pending?"Continue to workspace":"Sign in to your workspace"}<ArrowRight size={17} aria-hidden="true"/></button>
     </form>
    </section>
   </div>
   <footer className="ef-auth-footer"><span>City and Industrial Development Corporation of Maharashtra Ltd.</span><a href="/public">View public notices <ArrowRight size={14}/></a></footer>
  </main>
 );
}
