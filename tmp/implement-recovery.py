from pathlib import Path
p=Path('server/enforcement-workflow.js')
s=p.read_text(encoding='utf-8')
s="import {normalizeEmail,completePasswordReset} from './password-recovery.js';\n"+s
s=s.replace("username:u.Username,name:u.DisplayName,role:u.RoleCode", "username:u.Username,email:u.Email??null,name:u.DisplayName,role:u.RoleCode")
s=s.replace("const p=await getPool();const u=await transaction(p,async tx=>", "fail(!normalizeEmail(b.email),'A valid official email address is required.');\n  const p=await getPool();const u=await transaction(p,async tx=>",1)
s=s.replace(".input('name',sql.NVarChar,b.name.trim()).input('role'", ".input('name',sql.NVarChar,b.name.trim()).input('email',sql.NVarChar,normalizeEmail(b.email)).input('role'",1)
s=s.replace('INSERT enforcement.Users(Username,DisplayName,RoleCode,PasswordHash,MustChangePassword) OUTPUT inserted.* VALUES(@username,@name,@role,@hash,1)', 'INSERT enforcement.Users(Username,DisplayName,Email,RoleCode,PasswordHash,MustChangePassword) OUTPUT inserted.* VALUES(@username,@name,@email,@role,@hash,1)',1)
s=s.replace("fail(same(req.params.id,req.user.UserId)&&(b.active", "fail(b.email!==undefined&&!normalizeEmail(b.email),'Enter a valid official email address.');\n  fail(same(req.params.id,req.user.UserId)&&(b.active",1)
s=s.replace(".input('name',sql.NVarChar,b.name?.trim()??before.DisplayName).input('role'", ".input('name',sql.NVarChar,b.name?.trim()??before.DisplayName).input('email',sql.NVarChar,b.email===undefined?before.Email:normalizeEmail(b.email)).input('role'",1)
s=s.replace('SET DisplayName=@name,RoleCode=@role,IsActive=@active,PasswordHash=@hash', 'SET DisplayName=@name,Email=@email,RoleCode=@role,IsActive=@active,PasswordHash=@hash',1)
s=s.replace("await audit(tx,req.user,before.UserId,'UserAccessChanged'", "if(b.password)await completePasswordReset(tx,before,req.user);await audit(tx,req.user,before.UserId,'UserAccessChanged'",1)
p.write_text(s,encoding='utf-8')
p=Path('server/index.js');s=p.read_text(encoding='utf-8')
s="import {registerRecoveryPublicRoutes,registerRecoveryRoutes} from './password-recovery.js';\n"+s
s=s.replace("registerPublicRoutes(app,{getPool});", "registerPublicRoutes(app,{getPool});\nregisterRecoveryPublicRoutes(app,{getPool,publishChange});")
s=s.replace("registerWorkflowRoutes(app,{getPool,publishChange,toUiCase});", "registerRecoveryRoutes(app,{getPool,publishChange});\nregisterWorkflowRoutes(app,{getPool,publishChange,toUiCase});")
s=s.replace('SELECT UserId,Username,DisplayName,RoleCode,IsActive,MustChangePassword,CreatedAt FROM enforcement.Users', 'SELECT UserId,Username,Email,DisplayName,RoleCode,IsActive,MustChangePassword,CreatedAt FROM enforcement.Users',1)
s=s.replace("username:req.user.RoleCode==='master'?user.Username:undefined,name:", "username:req.user.RoleCode==='master'?user.Username:undefined,email:req.user.RoleCode==='master'?user.Email:undefined,name:",1)
# Remove unreachable duplicate mutation handlers; the audited workflow routes own these operations.
start=s.index("app.post('/api/users', requireConfigured, requireMaster,")
end=s.index("app.get('/api/records/:category'",start)
s=s[:start]+s[end:]
p.write_text(s,encoding='utf-8')
p=Path('src/services/enforcementApi.ts');s=p.read_text()
s=s.replace('  changePassword:', '  forgotPassword:(username:string,email:string)=>request<{message:string}>("/auth/forgot-password",{method:"POST",body:JSON.stringify({username,email})}),\n  notifications:()=>request<AccountNotification[]>("/me/notifications"),\n  dismissNotification:(id:string)=>request<void>(`/me/notifications/${id}/dismiss`,{method:"POST",body:"{}"}),\n  sendPasswordEmail:(id:string,temporaryPassword:string)=>request<{message:string}>(`/users/${id}/password-email`,{method:"POST",body:JSON.stringify({temporaryPassword})}),\n  mailStatus:()=>request<{configured:boolean}>("/admin/mail-status"),\n  changePassword:',1)
s=s.replace('id:string;username:string;name:string;role:"surveyor"', 'id:string;username:string;email?:string|null;name:string;role:"surveyor"')
s=s.replace('item:{username:string;name:string;password:string;role:string}', 'item:{username:string;email:string;name:string;password:string;role:string}')
s=s.replace('item:{name?:string;role?:string;active?:boolean;password?:string}', 'item:{name?:string;email?:string;role?:string;active?:boolean;password?:string}')
s+='\nexport type AccountNotification={id:string;kind:"recovery"|"account";title:string;status:string;createdAt:string;userId?:string|null;username?:string;name?:string|null;email?:string|null;submittedEmail?:string};\n'
p.write_text(s)
