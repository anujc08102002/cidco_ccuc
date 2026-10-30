import {PasswordDelivery} from './PasswordDelivery';

import {useEffect,useRef,useState,type FormEvent} from 'react';

import {KeyRound,RefreshCw,Search,ShieldCheck,Trash2,UserCheck,UserPlus,Users,X} from 'lucide-react';

import type {View} from '../../components/AppShell';

import {WorkspaceEditButton} from './WorkspaceEditButton';

import {enforcementApi} from '../../services/enforcementApi';

import {EmptyState,LoadState,StatusPill,WorkspaceHeader} from '../../components/PortalUi';



type UserItem={id:string;username:string;email?:string|null;name:string;role:string;label:string;active:boolean;mustChangePassword:boolean};

const roleLabels:Record<string,string>={surveyor:'Field Surveyor',cuc:'CUC',ccuc:'CCUC',legal:'Legal Coordinator',master:'Master Administrator'};

export function WorkspacePage({role,onNotify,focusUserId}:{kind:Exclude<View,'dashboard'|'register'|'detail'|'public'>;role:string;focusUserId?:string|null;onAction:(type?:'user')=>void;onNotify:(message:string)=>void}){

 const [users,setUsers]=useState<UserItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[compose,setCompose]=useState(false),[busy,setBusy]=useState(false),[query,setQuery]=useState('');

 const [resetUser,setResetUser]=useState<UserItem|null>(null),[resetPassword,setResetPassword]=useState(''),[formError,setFormError]=useState('');

 const [form,setForm]=useState({username:'',email:'',name:'',password:'',role:'surveyor'});

 const [delivery,setDelivery]=useState<{user:UserItem;password:string}|null>(null);

 const [deleteUser,setDeleteUser]=useState<UserItem|null>(null),[confirmUsername,setConfirmUsername]=useState('');

 const focusApplied=useRef<string|null>(null);
 const load=async()=>{setLoading(true);try{setUsers(await enforcementApi.listUsers());setError('');}catch(e){setError(e instanceof Error?e.message:'Staff records could not be loaded.');}finally{setLoading(false);}};

 useEffect(()=>{void load();const changed=()=>void load();window.addEventListener('enforcement:changed',changed);return()=>window.removeEventListener('enforcement:changed',changed);},[]);

 useEffect(()=>{if(focusUserId&&!loading&&focusApplied.current!==focusUserId){const user=users.find(u=>u.id===focusUserId);setQuery(user?.username??focusUserId);focusApplied.current=focusUserId;}},[focusUserId,users,loading]);

 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setFormError('');try{await enforcementApi.createUser(form);setForm({username:'',email:'',name:'',password:'',role:'surveyor'});setCompose(false);await load();onNotify('Staff account created. A password change is required at first sign-in.');}catch(e){setFormError(e instanceof Error?e.message:'The staff account could not be created.');}finally{setBusy(false);}};

 const reset=async(e:FormEvent)=>{e.preventDefault();if(!resetUser)return;setBusy(true);setFormError('');try{const updated=await enforcementApi.updateUser(resetUser.id,{password:resetPassword}) as UserItem;setDelivery({user:{...resetUser,...updated},password:resetPassword});setResetUser(null);setResetPassword('');await load();onNotify('Temporary password updated. The staff member must change it at next sign-in.');}catch(e){setFormError(e instanceof Error?e.message:'The password could not be reset.');}finally{setBusy(false);}};

 const shown=users.filter(u=>`${u.name} ${u.username} ${u.email??''} ${u.label}`.toLowerCase().includes(query.toLowerCase()));

 return <div className="portal-workspace">

  <WorkspaceHeader title="People and access" kicker="STAFF ADMINISTRATION" description="Manage departmental accounts, roles and access while retaining case history." icon={Users} actions={<><button className="action-secondary" disabled={loading} onClick={()=>void load()}><RefreshCw size={14} className={loading?'portal-spin':''}/> Refresh</button>{role==='master'&&<button className="action-primary" onClick={()=>{setCompose(!compose);setFormError('');setResetUser(null);}}><UserPlus size={15}/> Add staff member</button>}</>}/>

  <LoadState error={error} loading={loading&&!users.length} onRetry={()=>void load()}/>

  {delivery&&<PasswordDelivery user={delivery.user} password={delivery.password} onClose={()=>setDelivery(null)}/>}

  {deleteUser&&role==='master'&&<section className="portal-delete-confirm"><form onSubmit={async event=>{event.preventDefault();if(confirmUsername.trim().toLowerCase()!=='confirm'||busy)return;setBusy(true);setFormError('');try{await enforcementApi.deleteUser(deleteUser.id,confirmUsername);setDeleteUser(null);setConfirmUsername('');await load();onNotify('Account deleted and access revoked. Historical case authorship is retained.');}catch(e){setFormError(e instanceof Error?e.message:'Account deletion failed.');}finally{setBusy(false);}}}><h3>Delete account: {deleteUser.name}?</h3><p>The account will disappear from the directory, all sign-in access will be revoked, and reporting links will be removed. It cannot be reactivated. Historical staff identity and case responsibility are retained for audit; reassign their open cases separately. You cannot delete your own account.</p><label className="portal-field">Type confirm to delete<input autoComplete="off" required value={confirmUsername} onChange={event=>setConfirmUsername(event.target.value)}/></label>{formError&&<p className="portal-form-error" role="alert">{formError}</p>}<div className="admin-form-footer"><button type="button" className="action-secondary" disabled={busy} onClick={()=>setDeleteUser(null)}>Cancel</button><button className="action-danger" disabled={busy||confirmUsername.trim().toLowerCase()!=='confirm'}><Trash2 size={14}/>{busy?'Deleting…':'Confirm account deletion'}</button></div></form></section>}

  <div className="portal-stats"><div className="portal-stat"><Users size={20}/><div><strong>{users.length}</strong><span>Staff accounts</span></div></div><div className="portal-stat"><UserCheck size={20}/><div><strong>{users.filter(u=>u.active).length}</strong><span>Active accounts</span></div></div><div className="portal-stat"><ShieldCheck size={20}/><div><strong>{users.filter(u=>!u.active).length}</strong><span>Inactive accounts</span></div></div></div>

  {compose&&<section className="portal-settings-section"><div className="portal-section-title"><h3>Create staff account</h3><button className="portal-icon-button" aria-label="Close staff form" onClick={()=>setCompose(false)}><X size={16}/></button></div><form className="portal-filter-grid" onSubmit={submit}><label className="portal-field">Full name<input required maxLength={160} autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="portal-field">Username<input required maxLength={80} autoComplete="off" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label><label className="portal-field">Official email address<input type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="portal-field">Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="portal-field">Temporary password<input type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><small className="portal-field-help">At least 12 characters. The staff member must replace it on first sign-in.</small></label>{formError&&<p className="portal-form-error" role="alert">{formError}</p>}<div className="portal-filter-actions"><button type="button" className="action-secondary" onClick={()=>setCompose(false)}>Cancel</button><button className="action-primary" disabled={busy}><UserPlus size={14}/>{busy?'Creating…':'Create account'}</button></div></form></section>}

  {resetUser&&<section className="portal-settings-section"><h3>Reset temporary password</h3><p>Set a temporary password for <b>{resetUser.name} ({resetUser.username})</b> · {resetUser.email||'No registered email'}. Existing sessions will be invalidated.</p><form className="portal-filter-grid" onSubmit={reset}><label className="portal-field">New temporary password<input autoFocus type="password" required minLength={12} autoComplete="new-password" value={resetPassword} onChange={e=>setResetPassword(e.target.value)}/></label>{formError&&<p className="portal-form-error" role="alert">{formError}</p>}<div className="portal-filter-actions"><button type="button" className="action-secondary" onClick={()=>{setResetUser(null);setResetPassword('');}}>Cancel</button><button className="action-primary" disabled={busy}><KeyRound size={14}/>{busy?'Updating…':'Update temporary password'}</button></div></form></section>}

  <section className="portal-table-card"><header className="portal-table-heading"><div><h3>Staff directory<span className="portal-count">{shown.length}</span></h3><p>Disable accounts when staff leave. Historical responsibility remains attached to the staff record.</p></div><label className="portal-search"><Search size={15}/><input aria-label="Search staff" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search staff or role…"/></label></header>

   {shown.length?<div className="portal-table-scroll" tabIndex={0} role="region" aria-label="Scrollable records table"><table className="portal-table"><thead><tr><th>Staff member</th><th>Role</th><th>Account status</th><th>Access actions</th></tr></thead><tbody>{shown.map(user=><tr key={user.id}><td><strong>{user.name}</strong><small>{user.username}</small><small>{user.email||'Email not registered — add using Edit'}</small></td><td>{roleLabels[user.role]??user.label}</td><td><StatusPill tone={!user.active?'neutral':user.mustChangePassword?'amber':'green'}>{!user.active?'Inactive':user.mustChangePassword?'Password change required':'Active'}</StatusPill></td><td><div className="portal-control-actions">{role==='master'&&<><WorkspaceEditButton key={JSON.stringify(user)} user={user} onSaved={()=>{void load();onNotify('Staff access updated.');}}/><button className="action-secondary" onClick={()=>{setDelivery(null);setResetUser(user);setResetPassword('');setFormError('');setCompose(false);setDeleteUser(null);window.scrollTo({top:0,behavior:'smooth'});}}><KeyRound size={13}/> Reset password</button><button className="action-danger" aria-label={`Delete account for ${user.name}`} onClick={()=>{setDeleteUser(user);setConfirmUsername('');setFormError('');setCompose(false);setResetUser(null);window.scrollTo({top:0,behavior:'smooth'});}}><Trash2 size={13}/> Delete account</button></>}</div></td></tr>)}</tbody></table></div>:!loading&&!error&&<EmptyState icon={Users} title={query?'No matching staff':'No staff accounts found'} description={query?'Try another name, username or role.':'Create a departmental staff account to get started.'}/>}

   <footer className="portal-table-footer"><span>{shown.length} staff account{shown.length===1?'':'s'}</span><span>Administration access only</span></footer>

  </section>

 </div>;

}

