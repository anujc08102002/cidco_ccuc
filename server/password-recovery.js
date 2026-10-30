import sql from 'mssql';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import {WorkflowError,fail} from './workflow-policy.js';
import {verifyPassword} from './passwords.js';
import {passwordMail} from '../shared/password-mail.js';

const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
export const normalizeEmail=value=>typeof value==='string'&&validEmail(value.trim())?value.trim().toLowerCase():null;
const request=tx=>new sql.Request(tx);
const isAdmin=user=>user?.RoleCode==='master';
const requireAdmin=user=>fail(!isAdmin(user),'Administrator required.',403);
const guid=value=>typeof value==='string'&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
async function transaction(pool,fn){const tx=new sql.Transaction(pool);await tx.begin();try{const value=await fn(tx);await tx.commit();return value;}catch(error){try{await tx.rollback();}catch{}throw error;}}
async function audit(tx,actor,id,event,detail={}){await request(tx).input('actor',sql.UniqueIdentifier,actor??null).input('id',sql.UniqueIdentifier,id).input('event',sql.NVarChar,event).input('detail',sql.NVarChar(sql.MAX),JSON.stringify(detail)).query("INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) VALUES(@actor,'User',@id,@event,@detail)");}

// Called in the same transaction as changing the password. Never persist plaintext passwords.
export async function completePasswordReset(tx,user,actor){
 await request(tx).input('id',sql.UniqueIdentifier,user.UserId).query("UPDATE enforcement.OperationalRecords SET Status='Resolved',UpdatedAt=SYSUTCDATETIME() WHERE Category='PasswordRecovery' AND CreatedByUserId=@id AND Status='Pending'");
 await request(tx).input('id',sql.UniqueIdentifier,user.UserId).input('reference',sql.NVarChar,crypto.randomUUID()).query("INSERT enforcement.OperationalRecords(Category,Reference,Title,Details,Status,CreatedByUserId) VALUES('PasswordReset',@reference,'Your password was reset','Your administrator reset your password. Choose a new personal password at sign-in.','Unread',@id)");
 await audit(tx,actor.UserId,user.UserId,'UserPasswordReset');
}

// Public endpoint is registered before session middleware. It never changes account credentials.
export function registerRecoveryPublicRoutes(app,{getPool,publishChange,now=()=>Date.now()}){
 const attempts=new Map();
 const allowed=key=>{const current=now();const entry=attempts.get(key);if(entry&&entry.until>current){if(entry.n>=8)return false;entry.n++;}else attempts.set(key,{n:1,until:current+15*60000});if(attempts.size>10000){for(const [k,v]of attempts)if(v.until<=current)attempts.delete(k);if(attempts.size>10000)attempts.delete(attempts.keys().next().value);}return true;};
 app.post('/api/auth/forgot-password',wrap(async(req,res)=>{
  const b=req.body;fail(!b||Object.keys(b).some(k=>!['username','email'].includes(k))||typeof b.username!=='string'||!b.username.trim()||b.username.length>80||!normalizeEmail(b.email),'Enter your official username and a valid registered email address.');
  const username=b.username.trim(),email=normalizeEmail(b.email);
  fail(!allowed('ip:'+req.ip)||!allowed('user:'+username.toLowerCase()),'Too many recovery attempts. Please try again in 15 minutes.',429);
  const matched=await transaction(await getPool(),async tx=>{
   const user=(await request(tx).input('username',sql.NVarChar,username).query('SELECT * FROM enforcement.Users WITH (UPDLOCK,HOLDLOCK) WHERE Username=@username AND IsActive=1 AND IsDeleted=0')).recordset[0];
   const match=!!user&&normalizeEmail(user.Email)===email;
   const status=match?'Pending':'Mismatch';
   // One open matched request per account; unsuccessful attempts are coalesced for ten minutes.
   const duplicate=(await request(tx).input('status',sql.NVarChar,status).input('username',sql.NVarChar,username.toLowerCase()).query("SELECT TOP(1) RecordId FROM enforcement.OperationalRecords WITH (UPDLOCK,HOLDLOCK) WHERE Category='PasswordRecovery' AND Status=@status AND JSON_VALUE(Details,'$.username')=@username AND (@status='Pending' OR CreatedAt>DATEADD(minute,-10,SYSUTCDATETIME()))")).recordset[0];
   if(!duplicate){await request(tx).input('reference',sql.NVarChar,crypto.randomUUID()).input('title',sql.NVarChar,match?`${user.DisplayName} (${user.Username}) forgot their password`:`Recovery details did not match: ${username}`).input('details',sql.NVarChar(sql.MAX),JSON.stringify({username:username.toLowerCase(),submittedEmail:email,matched:match})).input('status',sql.NVarChar,status).input('owner',sql.UniqueIdentifier,user?.UserId??null).query("INSERT enforcement.OperationalRecords(Category,Reference,Title,Details,Status,CreatedByUserId) VALUES('PasswordRecovery',@reference,@title,@details,@status,@owner)");await audit(tx,null,user?.UserId??null,match?'UserRecoveryRequested':'UserRecoveryMismatch',{username,matched:match});}
   return match;
  });
  publishChange();
  if(!matched)return res.status(400).json({error:'The username and email do not match an active account in the administrator records. Check both details or contact your administrator.'});
  res.status(202).json({message:'Your recovery request has been sent to the Master Administrator. They will contact you at your registered email after resetting your password.'});
 }));
}

export async function readAttentionRows(pool,user,holdSql='c.LegalHold'){
  const rows=(await pool.request().input('actor',sql.UniqueIdentifier,user.UserId).input('role',sql.NVarChar,user.RoleCode).query(`SELECT c.CaseNumber,c.WorkflowStep,c.Status,c.NextActionAt,${holdSql} AS EffectiveHold FROM enforcement.Cases c WHERE c.IsArchived=0 AND c.Status<>'Closed' AND
  (${holdSql}=1 OR c.NextActionAt<SYSUTCDATETIME() OR (@role IN ('master','ccuc') AND c.Status='Awaiting approval') OR
   (@role='surveyor' AND c.WorkflowStep='correction') OR (@role='cuc' AND c.WorkflowStep IN ('review','notice-draft','notice-issue','notice-publication','hearing','order-draft','order-issue','order-publication','demolition','record-update','closure'))) AND
  (@role='master' OR c.ResponsibleUserId=@actor OR (@role='surveyor' AND c.AssignedSurveyorId=@actor) OR
  (@role='cuc' AND (c.AssignedCucId=@actor OR EXISTS(SELECT 1 FROM enforcement.ChargeTransfers t WHERE t.CaseId=c.CaseId AND t.ToUserId=@actor AND t.StartsAt<=SYSUTCDATETIME() AND t.EndsAt>SYSUTCDATETIME()))) OR
  (@role='ccuc' AND c.Status='Awaiting approval') OR (@role='legal' AND ${holdSql}=1))`)).recordset;
  return rows;
}
export async function readAccountNotifications(pool,user){
  const rows=(await pool.request().input('actor',sql.UniqueIdentifier,user.UserId).input('admin',sql.Bit,isAdmin(user)).query("SELECT r.RecordId,r.Category,r.Title,r.Details,r.Status,r.CreatedAt,r.CreatedByUserId,u.DisplayName,u.Username,u.Email FROM enforcement.OperationalRecords r LEFT JOIN enforcement.Users u ON u.UserId=r.CreatedByUserId WHERE (@admin=1 AND r.Category='PasswordRecovery' AND r.Status IN ('Pending','Mismatch')) OR (r.Category='PasswordReset' AND r.CreatedByUserId=@actor AND r.Status='Unread') ORDER BY r.CreatedAt DESC")).recordset;
  return rows.map(r=>({id:r.RecordId,kind:r.Category==='PasswordRecovery'?'recovery':'account',title:r.Title,status:r.Status,createdAt:r.CreatedAt,...(r.Category==='PasswordRecovery'?{userId:r.CreatedByUserId,username:r.Username??JSON.parse(r.Details).username,name:r.DisplayName??null,email:r.Email??null,submittedEmail:JSON.parse(r.Details).submittedEmail}: {})}));
}

export function registerRecoveryRoutes(app,{getPool,publishChange,mailTransport,holdSql='c.LegalHold'}){
 app.get('/api/me/attention',wrap(async(req,res)=>res.json((await readAttentionRows(await getPool(),req.user,holdSql)).map(row=>row.CaseNumber))));
 app.get('/api/me/notifications',wrap(async(req,res)=>res.json(await readAccountNotifications(await getPool(),req.user))));
 app.post('/api/me/notifications/:id/dismiss',wrap(async(req,res)=>{
  fail(!guid(req.params.id),'Invalid notification.');const result=await (await getPool()).request().input('id',sql.UniqueIdentifier,req.params.id).input('actor',sql.UniqueIdentifier,req.user.UserId).input('admin',sql.Bit,isAdmin(req.user)).query("UPDATE enforcement.OperationalRecords SET Status='Read',UpdatedAt=SYSUTCDATETIME() OUTPUT inserted.RecordId WHERE RecordId=@id AND ((Category='PasswordReset' AND CreatedByUserId=@actor AND Status='Unread') OR (@admin=1 AND Category='PasswordRecovery' AND Status='Mismatch'))");fail(!result.recordset[0],'Notification not found or not dismissible.',404);publishChange();res.status(204).end();
 }));
 app.get('/api/admin/mail-status',wrap(async(req,res)=>{requireAdmin(req.user);res.json({configured:!!(process.env.SMTP_HOST&&process.env.SMTP_FROM)});}));
 app.post('/api/users/:id/password-email',wrap(async(req,res)=>{
  requireAdmin(req.user);fail(!guid(req.params.id),'Choose a valid staff account.');
  fail(!req.body||Object.keys(req.body).some(k=>k!=='temporaryPassword')||typeof req.body.temporaryPassword!=='string'||req.body.temporaryPassword.length<12||req.body.temporaryPassword.length>256,'Provide the current temporary password.');
  const p=await getPool(),user=(await p.request().input('id',sql.UniqueIdentifier,req.params.id).query('SELECT * FROM enforcement.Users WHERE UserId=@id AND IsActive=1 AND IsDeleted=0')).recordset[0];
  fail(!user||!user.MustChangePassword||!verifyPassword(user.PasswordHash,req.body.temporaryPassword),'This temporary password is no longer valid. Reset the password again before sending.',409);fail(!normalizeEmail(user.Email),'Save a valid official email address for this account first.');
  fail(!mailTransport&&(!process.env.SMTP_HOST||!process.env.SMTP_FROM),'Application email is not configured. Use Gmail, Outlook or your email app, or configure the departmental SMTP sender.',503);
  // Only the saved recipient and fixed password-reset message are accepted, never arbitrary mail.
  const transport=mailTransport??nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});
  const mail=passwordMail({name:user.DisplayName,username:user.Username},req.body.temporaryPassword,process.env.APP_PUBLIC_URL||'');
  try {const result=await transport.sendMail({from:process.env.SMTP_FROM,to:user.Email,subject:mail.subject,text:mail.text});fail(result.rejected?.length>0,'The mail server rejected the recipient.',502);}catch(error){if(error instanceof WorkflowError)throw error;throw new WorkflowError('The email could not be sent. Check the mail-server configuration or use a Gmail / Outlook draft.',502);}
  await audit(p,req.user.UserId,user.UserId,'UserPasswordEmailSent',{recipient:user.Email});res.json({message:'The mail server accepted the password email for the registered recipient.'});
 }));
}
