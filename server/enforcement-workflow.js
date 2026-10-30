import {normalizeEmail,completePasswordReset} from './password-recovery.js';
import {driveDateInput} from './drive-announcements.js';
import sql from 'mssql';
import {createSiteReport,reportFilename} from './site-report.js';
import crypto from 'node:crypto';
import {WorkflowError,fail,same,defaults,settingsValue,inferredStep,canOperate,transition,validateFile,publicProjection} from './workflow-policy.js';
import {retrieveLegalRecord} from './lts.js';
import {hashPassword} from './passwords.js';
import {registerNoticeRoutes} from './notice-routes.js';
import {buildDocument,readTemplate,validateTemplate,caseRecipient,parseContent,templateRevision} from './notice-model.js';
import {applyHandwrittenSignature,signatureImageMethod} from './signature-images.js';
import {noticeContext,resolveNoticeAuthority} from './notice-context.js';
import {pdfBytes} from './notice-pdf.js';

export const scopeSql=(alias='c')=>`(@role='master' OR (${alias}.IsArchived=0 AND ((@role='surveyor' AND ${alias}.AssignedSurveyorId=@actor) OR
 (@role='cuc' AND (${alias}.AssignedCucId=@actor OR EXISTS(SELECT 1 FROM enforcement.ChargeTransfers t WHERE t.CaseId=${alias}.CaseId AND t.ToUserId=@actor AND t.StartsAt<=SYSUTCDATETIME() AND t.EndsAt>SYSUTCDATETIME()))) OR
 (@role IN ('ccuc','legal')))))`;
export const scopedRequest=(p,user)=>p.request().input('actor',sql.UniqueIdentifier,user.UserId).input('role',sql.NVarChar,user.RoleCode);
export const propertyMatchSql=(other='related',current='c')=>`(${other}.CaseId=${current}.CaseId OR (${other}.Node=${current}.Node AND ((NULLIF(LTRIM(RTRIM(${current}.PlotNumber)),'') IS NOT NULL AND ${other}.PlotNumber=${current}.PlotNumber) OR (NULLIF(LTRIM(RTRIM(${current}.Village)),'') IS NOT NULL AND NULLIF(LTRIM(RTRIM(${current}.SurveyReference)),'') IS NOT NULL AND ${other}.Village=${current}.Village AND ${other}.SurveyReference=${current}.SurveyReference))))`;
export const propertyHoldSql=(current='c',lock=false)=>`CASE WHEN EXISTS(SELECT 1 FROM enforcement.Cases related ${lock?'WITH (UPDLOCK,HOLDLOCK)':''} WHERE related.LegalHold=1 AND ${propertyMatchSql('related',current)}) THEN 1 ELSE 0 END`;
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
const request=tx=>new sql.Request(tx);
const json=value=>JSON.stringify(value);
async function audit(tx,user,id,event,detail){const entity=event.startsWith('User')||event.startsWith('HandwrittenSignature')?'User':event.startsWith('DrivePlan')?'Drive':event.includes('Settings')||event.startsWith('Reporting')?'Configuration':event.includes('Template')?'Template':'Case';await request(tx).input('entity',sql.NVarChar,entity).input('actor',sql.UniqueIdentifier,user.UserId).input('id',sql.UniqueIdentifier,id).input('event',sql.NVarChar,event).input('detail',sql.NVarChar(sql.MAX),json(detail)).query("INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) VALUES(@actor,@entity,@id,@event,@detail)");}
export async function workflowSettings(p){const r=await p.request().query("SELECT Value FROM enforcement.Settings WHERE SettingKey='deadlines'");return settingsValue(r.recordset[0]?JSON.parse(r.recordset[0].Value):defaults);}
export async function refreshEscalations(p){
 const config=await workflowSettings(p);
 await p.request().input('days',sql.Int,config.escalateDays).query(`SET XACT_ABORT ON; BEGIN TRANSACTION;
 DECLARE @changed TABLE(CaseId UNIQUEIDENTIFIER);
 UPDATE enforcement.Cases SET EscalatedAt=SYSUTCDATETIME() OUTPUT inserted.CaseId INTO @changed
 WHERE IsArchived=0 AND Status<>'Closed' AND NextActionAt IS NOT NULL AND EscalatedAt IS NULL AND DATEADD(day,@days,NextActionAt)<SYSUTCDATETIME();
 INSERT enforcement.AuditLog(EntityType,EntityId,EventType,Detail) SELECT 'Case',CaseId,'DeadlineEscalated','Deadline exceeded; visible in the CCUC oversight queue.' FROM @changed; COMMIT;`);
}
async function loadCase(tx,key,user,lock=false){
 const r=await request(tx).input('key',sql.NVarChar,key).input('actor',sql.UniqueIdentifier,user.UserId).input('role',sql.NVarChar,user.RoleCode).query(`SELECT c.*,${propertyHoldSql('c',lock)} AS PropertyLegalHold,
 (SELECT TOP(1) h.HearingAt FROM enforcement.Hearings h WHERE h.CaseId=c.CaseId ORDER BY h.CreatedAt DESC,h.HearingId DESC) AS NoticeHearingAt,
 (SELECT TOP(1) h.Proceedings FROM enforcement.Hearings h WHERE h.CaseId=c.CaseId ORDER BY h.CreatedAt DESC,h.HearingId DESC) AS NoticeProceedings,
 CASE WHEN EXISTS(SELECT 1 FROM enforcement.ChargeTransfers t WHERE t.CaseId=c.CaseId AND t.ToUserId=@actor AND t.StartsAt<=SYSUTCDATETIME() AND t.EndsAt>SYSUTCDATETIME()) THEN 1 ELSE 0 END AS Delegated
 FROM enforcement.Cases c ${lock?'WITH (UPDLOCK,HOLDLOCK)':''} WHERE c.CaseNumber=@key AND ${scopeSql()}`);
 fail(!r.recordset[0],'Case not found or access denied.',404);return {...r.recordset[0],LegalHold:Boolean(r.recordset[0].LegalHold||r.recordset[0].PropertyLegalHold),Delegated:Boolean(r.recordset[0].Delegated)};
}
async function transaction(p,fn){const tx=new sql.Transaction(p);await tx.begin();try{const result=await fn(tx);await tx.commit();return result;}catch(e){try{await tx.rollback();}catch{}throw e;}}
async function ownedDocument(tx,c,id){fail(typeof id!=='string','Choose a document.');const r=await request(tx).input('id',sql.UniqueIdentifier,id).input('case',sql.UniqueIdentifier,c.CaseId).query('SELECT * FROM enforcement.Documents WITH (UPDLOCK,HOLDLOCK) WHERE DocumentId=@id AND CaseId=@case');fail(!r.recordset[0],'Document does not belong to this case.',404);return r.recordset[0];}
const version=c=>Buffer.from(c.RowVersion).toString('hex');
const ensureVersion=(c,b)=>fail(b.rowVersion!==version(c),'Case changed. Reload before retrying.',409);
export function registerPublicRoutes(app,{getPool}){
 app.get('/api/public/search',wrap(async(req,res)=>{
  fail(Object.keys(req.query).some(k=>!['field','q'].includes(k)),'Unsupported public search parameter.');
  const column={name:'OwnerName',plot:'PlotNumber',survey:'SurveyReference'}[req.query.field];fail(!column,'Choose Name, Plot Number or Survey Number.');
  fail(typeof req.query.q!=='string'||req.query.q.trim().length<2||req.query.q.length>160,'Enter 2 to 160 characters.');
  const recipientField={name:'owner',plot:'plot',survey:null}[req.query.field];
  const recipientMatch=recipientField?` OR EXISTS (SELECT 1 FROM OPENJSON(CASE WHEN ISJSON(d.Content)=1 THEN d.Content ELSE '{}' END,'$.recipients') WITH (Value nvarchar(240) '$.${recipientField}') recipient WHERE recipient.Value LIKE @q)`:'';
  const p=await getPool();const r=await p.request().input('q',sql.NVarChar,'%'+req.query.q.trim().replace(/[\[\]%_]/g,m=>'['+m+']')+'%').query(`SELECT TOP(100) d.DocumentId,d.DocumentType,d.ReferenceNumber,d.VersionNumber,d.PublishedAt,d.Content AS NoticeContent,c.OwnerName,c.PlotNumber,c.SurveyReference,c.Node FROM enforcement.Documents d JOIN enforcement.Cases c ON c.CaseId=d.CaseId WHERE c.IsArchived=0 AND d.IsPublished=1 AND d.IssuedAt IS NOT NULL AND d.ApprovalState='Issued' AND d.DocumentType IN ('Notice','Order') AND (c.${column} LIKE @q${recipientMatch}) ORDER BY d.PublishedAt DESC`);
  res.set('Cache-Control','no-store').json(r.recordset.map(row=>{const recipients=parseContent(row.NoticeContent)?.recipients;if(Array.isArray(recipients)){row.OwnerName=recipients.map(r=>r.owner).join('; ');row.PlotNumber=[...new Set(recipients.map(r=>r.plot))].join(', ');}return publicProjection(row);}));
 }));
 app.get('/api/public/documents/:id',wrap(async(req,res)=>{
  const p=await getPool();const r=await p.request().input('id',sql.UniqueIdentifier,req.params.id).query(`SELECT d.Content,d.ReferenceNumber,d.FileContent,d.MimeType,d.CreatedAt FROM enforcement.Documents d JOIN enforcement.Cases c ON c.CaseId=d.CaseId WHERE d.DocumentId=@id AND d.IsPublished=1 AND d.IssuedAt IS NOT NULL AND d.ApprovalState='Issued' AND d.DocumentType IN ('Notice','Order') AND c.IsArchived=0`);
  fail(!r.recordset[0],'Published document not found.',404);const d=r.recordset[0];res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Disposition':'inline; filename=notice.pdf'}).type('application/pdf').send(d.FileContent&&d.MimeType==='application/pdf'?d.FileContent:await pdfBytes(d.Content,{reference:d.ReferenceNumber,createdAt:d.CreatedAt}));
 }));
}
export function registerWorkflowRoutes(app,{getPool,publishChange,toUiCase}){
 app.use('/api/workflow',(req,res,next)=>{
  if(['POST','PUT','PATCH'].includes(req.method)){
   if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')return res.status(400).json({error:'A JSON object is required.'});
   for(const [key,max] of Object.entries({reason:1000,owner:200,name:160,reference:80,source:160,status:80,node:80,serial:80,venue:250,court:160,approvalReference:250}))if(req.body[key]!==undefined&&(typeof req.body[key]!=='string'||req.body[key].length>max))return res.status(400).json({error:`Invalid ${key}: maximum ${max} characters.`});
  }next();
 });
 registerNoticeRoutes(app,{getPool,loadCase,ownedDocument,transaction,audit,wrap,publishChange});
 const userView=u=>({id:u.UserId,username:u.Username,email:u.Email??null,name:u.DisplayName,role:u.RoleCode,active:u.IsActive,mustChangePassword:Boolean(u.MustChangePassword)});
 const roles=['master','surveyor','cuc','ccuc','legal'];
 app.post('/api/users',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required.',403);const b=req.body;
  fail(typeof b.username!=='string'||!b.username.trim()||b.username.length>80||typeof b.name!=='string'||!b.name.trim()||b.name.length>160||!roles.includes(b.role)||typeof b.password!=='string'||b.password.length<12,'Valid username, staff name, role and password of at least 12 characters are required.');
  fail(!normalizeEmail(b.email),'A valid official email address is required.');
  const p=await getPool();const u=await transaction(p,async tx=>{const r=await request(tx).input('username',sql.NVarChar,b.username.trim()).input('name',sql.NVarChar,b.name.trim()).input('email',sql.NVarChar,normalizeEmail(b.email)).input('role',sql.NVarChar,b.role).input('hash',sql.NVarChar,hashPassword(b.password)).query('INSERT enforcement.Users(Username,DisplayName,Email,RoleCode,PasswordHash,MustChangePassword) OUTPUT inserted.* VALUES(@username,@name,@email,@role,@hash,1)');await audit(tx,req.user,r.recordset[0].UserId,'UserCreated',{username:b.username,name:b.name,role:b.role});return r.recordset[0];});publishChange();res.status(201).json(userView(u));
 }));
 app.patch('/api/users/:id',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required.',403);const b=req.body;
  fail(b.role!==undefined&&!roles.includes(b.role)||b.name!==undefined&&(typeof b.name!=='string'||!b.name.trim()||b.name.length>160)||b.active!==undefined&&typeof b.active!=='boolean'||b.password!==undefined&&(typeof b.password!=='string'||b.password.length<12),'Invalid staff name, role, active status or temporary password.');
  fail(b.email!==undefined&&!normalizeEmail(b.email),'Enter a valid official email address.');
  fail(same(req.params.id,req.user.UserId)&&(b.active===false||b.role&&b.role!=='master'),'You cannot remove your own administrator access.',409);
  const p=await getPool();const user=await transaction(p,async tx=>{const before=(await request(tx).input('id',sql.UniqueIdentifier,req.params.id).query('SELECT * FROM enforcement.Users WITH (UPDLOCK,HOLDLOCK) WHERE UserId=@id')).recordset[0];fail(!before,'User not found.',404);fail(before.IsDeleted,'This account has been deleted and cannot be reactivated.',409);const r=await request(tx).input('id',sql.UniqueIdentifier,req.params.id).input('name',sql.NVarChar,b.name?.trim()??before.DisplayName).input('email',sql.NVarChar,b.email===undefined?before.Email:normalizeEmail(b.email)).input('role',sql.NVarChar,b.role??before.RoleCode).input('active',sql.Bit,b.active??before.IsActive).input('hash',sql.NVarChar,b.password?hashPassword(b.password):before.PasswordHash).input('change',sql.Bit,b.password?true:before.MustChangePassword).query('UPDATE enforcement.Users SET DisplayName=@name,Email=@email,RoleCode=@role,IsActive=@active,PasswordHash=@hash,MustChangePassword=@change,UpdatedAt=SYSUTCDATETIME() OUTPUT inserted.* WHERE UserId=@id');if(b.password)await completePasswordReset(tx,before,req.user);await audit(tx,req.user,before.UserId,'UserAccessChanged',{before:userView(before),after:userView(r.recordset[0]),passwordReset:Boolean(b.password)});return r.recordset[0];});publishChange();res.json(userView(user));
 }));
 app.delete('/api/users/:id',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required.',403);
  fail(same(req.params.id,req.user.UserId),'You cannot delete your own administrator account.',409);
  const p=await getPool();await transaction(p,async tx=>{
   const before=(await request(tx).input('id',sql.UniqueIdentifier,req.params.id).query('SELECT * FROM enforcement.Users WITH (UPDLOCK,HOLDLOCK) WHERE UserId=@id')).recordset[0];
   fail(!before||before.IsDeleted,'User not found.',404);
   fail(typeof req.body?.confirmation!=='string'||req.body.confirmation.trim().toLowerCase()!=='confirm','Type confirm to confirm account deletion.');
   if(before.RoleCode==='master'&&before.IsActive){
    const count=(await request(tx).query("SELECT COUNT(*) AS n FROM enforcement.Users WITH (UPDLOCK,HOLDLOCK) WHERE RoleCode='master' AND IsActive=1 AND IsDeleted=0")).recordset[0].n;
    fail(count<=1,'The last active administrator account cannot be deleted.',409);
   }
   await audit(tx,req.user,before.UserId,'UserAccountDeleted',{account:userView(before),historicalAttributionRetained:true});
   // A deleted identity is a tombstone, not a disabled account: it cannot log in, be listed or reactivated.
   // Keep its stable ID/name for signed documents, audit authorship and existing case responsibility.
   await request(tx).input('id',sql.UniqueIdentifier,before.UserId).input('hash',sql.NVarChar,hashPassword(crypto.randomUUID()+crypto.randomUUID())).query(`UPDATE enforcement.Users SET IsActive=0,IsDeleted=1,DeletedAt=SYSUTCDATETIME(),PasswordHash=@hash,MustChangePassword=1,UpdatedAt=SYSUTCDATETIME() WHERE UserId=@id;
    UPDATE enforcement.ChargeTransfers SET EndsAt=CASE WHEN StartsAt>=SYSUTCDATETIME() THEN DATEADD(second,1,StartsAt) ELSE SYSUTCDATETIME() END WHERE (FromUserId=@id OR ToUserId=@id) AND EndsAt>SYSUTCDATETIME();`);
  });publishChange();res.status(204).end();
 }));
 app.get('/api/workflow/templates',wrap(async(req,res)=>{res.json((await (await getPool()).request().query('SELECT TemplateId,Name,DocumentType,Body,ApprovalReference,CreatedAt FROM enforcement.DocumentTemplates ORDER BY CreatedAt DESC,TemplateId')).recordset.map(t=>({...t,Revision:templateRevision(t)})));}));
 app.patch('/api/workflow/templates/:id',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required to edit departmental templates.',403);const b=req.body;
  fail(!b.name?.trim()||typeof b.body!=='string'||!b.body.trim()||!b.approvalReference?.trim(),'Name, approved template text and approval reference are required.');validateTemplate(readTemplate(b.body));
  await transaction(await getPool(),async tx=>{
   const before=(await request(tx).input('id',sql.UniqueIdentifier,req.params.id).query('SELECT * FROM enforcement.DocumentTemplates WITH (UPDLOCK,HOLDLOCK) WHERE TemplateId=@id')).recordset[0];
   fail(!before,'Template not found.',404);fail(b.expectedRevision!==templateRevision(before),'Template changed. Reload the saved template before editing.',409);fail(b.type!==before.DocumentType,'The type of an existing template cannot be changed.');
   await request(tx).input('id',sql.UniqueIdentifier,req.params.id).input('name',sql.NVarChar,b.name.trim()).input('body',sql.NVarChar(sql.MAX),b.body).input('approval',sql.NVarChar,b.approvalReference.trim()).query('UPDATE enforcement.DocumentTemplates SET Name=@name,Body=@body,ApprovalReference=@approval WHERE TemplateId=@id');
   await audit(tx,req.user,before.TemplateId,'DepartmentalTemplateUpdated',{previousRevision:templateRevision(before),name:b.name,approvalReference:b.approvalReference});
  });publishChange();res.json({saved:true,Revision:templateRevision({Name:b.name.trim(),DocumentType:b.type,Body:b.body,ApprovalReference:b.approvalReference.trim()})});
 }));
 app.post('/api/workflow/templates',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required to register departmental templates.',403);const b=req.body;
  fail(!['Notice','Order'].includes(b.type)||!b.name?.trim()||!b.body?.trim()||!b.approvalReference?.trim(),'Name, type, approved template text and departmental approval reference are required.');
  validateTemplate(readTemplate(b.body));
  const p=await getPool();await transaction(p,async tx=>{await request(tx).input('name',sql.NVarChar,b.name).input('type',sql.NVarChar,b.type).input('body',sql.NVarChar(sql.MAX),b.body).input('approval',sql.NVarChar,b.approvalReference).input('actor',sql.UniqueIdentifier,req.user.UserId).query('INSERT enforcement.DocumentTemplates(Name,DocumentType,Body,ApprovalReference,CreatedBy) VALUES(@name,@type,@body,@approval,@actor)');await audit(tx,req.user,null,'DepartmentalTemplateRegistered',{name:b.name,type:b.type,approvalReference:b.approvalReference});});publishChange();res.status(201).json({saved:true});
 }));
 app.get('/api/workflow/settings',wrap(async(req,res)=>{res.json(await workflowSettings(await getPool()));}));
 app.put('/api/workflow/settings',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator access required.',403);fail(!req.body.reason?.trim(),'Record the reason for changing deadlines.');
  const value=settingsValue(req.body.values),p=await getPool();
  await transaction(p,async tx=>{const before=await workflowSettings(p);await request(tx).input('value',sql.NVarChar(sql.MAX),json(value)).input('actor',sql.UniqueIdentifier,req.user.UserId).query(`UPDATE enforcement.Settings WITH (UPDLOCK,SERIALIZABLE) SET Value=@value,UpdatedBy=@actor,UpdatedAt=SYSUTCDATETIME() WHERE SettingKey='deadlines'; IF @@ROWCOUNT=0 INSERT enforcement.Settings(SettingKey,Value,UpdatedBy) VALUES('deadlines',@value,@actor);`);await audit(tx,req.user,null,'DeadlineSettingsChanged',{before,after:value,reason:req.body.reason});});
  publishChange();res.json(value);
 }));
 async function caseSnapshot(tx,key,user){
   const c=await loadCase(tx,key,user),result={case:toUiCase(c,user),step:inferredStep(c),rowVersion:version(c),closedAt:c.ClosedAt,RecipientDefaults:caseRecipient(c)};
   result.NoticeContext=await noticeContext(tx,c);
   result.CucOptions=(await request(tx).query("SELECT UserId AS id,DisplayName AS name FROM enforcement.Users WHERE IsActive=1 AND RoleCode='cuc' ORDER BY DisplayName")).recordset;
   result.DriveOptions=(await request(tx).input('node',sql.NVarChar,c.Node).query('SELECT DriveId AS id,SerialNumber AS name FROM enforcement.DrivePlans WHERE Node=@node ORDER BY PlannedAt DESC')).recordset;
   result.Documents=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query(`SELECT d.DocumentId,d.DocumentType,d.ReferenceNumber,d.VersionNumber,d.FileName,d.MimeType,d.Content,d.ApprovalState,d.ApprovedAt,d.IssuedAt,d.IsPublished,d.PublishedAt,d.CreatedAt,d.SupersedesId,d.ChangeReason,d.SignedAt,d.SignatureMethod,d.TemplateId,CASE WHEN d.FileContent IS NOT NULL THEN 1 ELSE 0 END AS HasPdf,COALESCE((SELECT TOP(1) JSON_VALUE(a.Detail,'$.signerName') FROM enforcement.AuditLog a WHERE a.EntityId=d.CaseId AND a.EventType IN ('DocumentDigitallySigned','DocumentSignatureApplied') AND ISJSON(a.Detail)=1 AND JSON_VALUE(a.Detail,'$.documentId')=CONVERT(nvarchar(36),d.DocumentId) ORDER BY a.AuditId DESC),signer.DisplayName) AS SignedByName,CONVERT(varchar(64),d.DigitalSignatureHash,2) AS SignatureFingerprint FROM enforcement.Documents d LEFT JOIN enforcement.Users signer ON signer.UserId=d.SignedByUserId WHERE d.CaseId=@id AND d.DocumentType<>'CaseReport' ORDER BY d.CreatedAt,d.DocumentId`)).recordset;
   result.Documents=result.Documents.map(d=>{const parsed=parseContent(d.Content);return {...d,AuthorityName:parsed?.authority?.name||result.NoticeContext.defaultAuthority?.name||'',AuthorityUserId:parsed?.authority?.id||null,NeedsRevision:['Notice','Order'].includes(d.DocumentType)&&!d.SignedAt&&(parsed?.format!=='cidco-document-v2'||!parsed?.authority?.id||parsed?.needsRevision)};});
   for(const table of ['Surveys','Hearings','LegalUpdates','DemolitionDrives','CaseReferences','CaseActions','ChargeTransfers'])result[table]=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query(`SELECT * FROM enforcement.${table} WHERE CaseId=@id`)).recordset;
   result.LegalUpdates=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query(`SELECT l.*,related.CaseNumber AS SourceCaseNumber FROM enforcement.LegalUpdates l JOIN enforcement.Cases related ON related.CaseId=l.CaseId CROSS JOIN enforcement.Cases c WHERE c.CaseId=@id AND ${propertyMatchSql()} ORDER BY l.SynchronizedAt DESC`)).recordset;
   result.AuditLog=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query('SELECT a.AuditId,a.EventType,a.Detail,a.OccurredAt,u.DisplayName FROM enforcement.AuditLog a LEFT JOIN enforcement.Users u ON a.UserId=u.UserId WHERE a.EntityId=@id ORDER BY a.AuditId DESC')).recordset;
   result.CaseActions=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query('SELECT a.*,u.DisplayName AS PerformedByName FROM enforcement.CaseActions a LEFT JOIN enforcement.Users u ON a.PerformedByUserId=u.UserId WHERE a.CaseId=@id ORDER BY a.OccurredAt,a.ActionId')).recordset;
   result.ChargeTransfers=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query('SELECT t.*,f.DisplayName AS FromName,u.DisplayName AS ToName FROM enforcement.ChargeTransfers t LEFT JOIN enforcement.Users f ON f.UserId=t.FromUserId LEFT JOIN enforcement.Users u ON u.UserId=t.ToUserId WHERE t.CaseId=@id ORDER BY t.StartsAt')).recordset;
   return result;
 }
 async function storeSiteReport(tx,c,user){
  const snapshot=await caseSnapshot(tx,c.CaseNumber,user);
  const files=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT DocumentId,DocumentType,FileName,MimeType,FileContent FROM enforcement.Documents WHERE CaseId=@id AND DocumentType<>'CaseReport' AND FileContent IS NOT NULL ORDER BY CreatedAt,DocumentId")).recordset;
  const report=await createSiteReport(snapshot,{actor:user.DisplayName,files});
  const id=crypto.randomUUID(),hash=crypto.createHash('sha256').update(report.bytes).digest('hex');
  await request(tx).input('id',sql.UniqueIdentifier,id).input('case',sql.UniqueIdentifier,c.CaseId).input('ref',sql.NVarChar,report.reportId).input('name',sql.NVarChar,reportFilename(c.CaseNumber)).input('bytes',sql.VarBinary(sql.MAX),report.bytes).input('state',sql.NVarChar,snapshot.case.status==='Closed'?'FinalReport':'InterimReport').input('actor',sql.UniqueIdentifier,user.UserId).query("INSERT enforcement.Documents(DocumentId,CaseId,DocumentType,ReferenceNumber,FileName,MimeType,FileContent,ApprovalState,CreatedByUserId) VALUES(@id,@case,'CaseReport',@ref,@name,'application/pdf',@bytes,@state,@actor)");
  await audit(tx,user,c.CaseId,'SiteReportGenerated',{reportId:report.reportId,documentId:id,sha256:hash,caseVersion:snapshot.rowVersion,status:snapshot.case.status,pages:report.pageCount});
  return report.bytes;
 }
 app.get('/api/workflow/cases/:key',wrap(async(req,res)=>{
  const p=await getPool();res.json(await transaction(p,tx=>caseSnapshot(tx,req.params.key,req.user)));
 }));
 app.get('/api/workflow/cases/:key/report',wrap(async(req,res)=>{
  const p=await getPool();let filename;
  const bytes=await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);filename=reportFilename(c.CaseNumber);
   if(c.Status==='Closed'){
    const saved=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT TOP(1) FileContent FROM enforcement.Documents WHERE CaseId=@id AND DocumentType='CaseReport' AND ApprovalState='FinalReport' ORDER BY CreatedAt DESC,DocumentId DESC")).recordset[0];
    if(saved)return saved.FileContent;
   }
   return storeSiteReport(tx,c,req.user);
  });
  res.set({'Content-Disposition':`inline; filename="${filename}"`,'Cache-Control':'no-store'}).type('application/pdf').send(bytes);
 }));
 app.post('/api/workflow/cases/:key/actions',wrap(async(req,res)=>{
  const b=req.body,p=await getPool(),config=await workflowSettings(p);
  await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);
   const next=transition(req.user,c,b.action,b,config);
   fail(b.action==='issue-notice'&&b.previewReviewed!==true,'Review the signed notice preview before issuing it.',409);
   if(/notice|order/.test(b.action)){
    const type=b.action.includes('notice')?'Notice':'Order',d=await ownedDocument(tx,c,b.documentId);
    fail(d.DocumentType!==type,'Incorrect document type.');
    const latest=(await request(tx).input('case',sql.UniqueIdentifier,c.CaseId).input('type',sql.NVarChar,type).query('SELECT MAX(VersionNumber) AS v FROM enforcement.Documents WHERE CaseId=@case AND DocumentType=@type')).recordset[0].v;
    fail(d.VersionNumber!==latest,'Use the latest document version.',409);
    const op=b.action.split('-')[0];
    if(b.action==='publish-notice')next.due=new Date(new Date(d.IssuedAt).getTime()+config.hearingDays*86400000);
    if(['submit-order','approve-order'].includes(b.action)&&c.NextActionAt)next.due=c.NextActionAt;
    fail(op==='submit'&&d.ApprovalState!=='Draft'||op==='approve'&&d.ApprovalState!=='Review'||op==='issue'&&d.ApprovalState!=='Approved'||op==='publish'&&d.ApprovalState!=='Issued'||op==='return'&&d.ApprovalState!=='Review','Document state does not permit this action.',409);
    if(op==='issue')fail(!d.DigitalSignatureHash||!d.SignedByUserId,'The CCUC must approve and apply their signature before this document can be issued.',409);
    if(op==='submit'){const parsed=parseContent(d.Content);fail(parsed?.format!=='cidco-document-v2'||!parsed.authority?.id||parsed.needsRevision,'Regenerate and save this notice with the recipient, authority and response period before submitting it.',409);}
    let signed=null;
    if(op==='approve'){
     fail(b.previewReviewed!==true,'Open and verify the document preview before signing.',409);
     const image=(await request(tx).input('key',sql.NVarChar,'signature-image:'+String(req.user.UserId).toLowerCase()).query('SELECT Value FROM enforcement.Settings WITH (HOLDLOCK) WHERE SettingKey=@key')).recordset[0];
     const registered=image?JSON.parse(image.Value):null;
     fail(registered&&b.signatureImageHash!==registered.hash,'Your signature registration changed. Refresh the signature status before applying it.',409);
     signed=await applyHandwrittenSignature(d,req.user,registered);
    }
    const signature=signed?.hash??null;
    await request(tx).input('id',sql.UniqueIdentifier,d.DocumentId).input('actor',sql.UniqueIdentifier,req.user.UserId).input('signature',sql.VarBinary(32),signature).input('pdf',sql.VarBinary(sql.MAX),signed?.pdf??null).input('state',sql.NVarChar,({submit:'Review',approve:'Approved',issue:'Issued',publish:'Issued',return:'Draft'})[op]).input('op',sql.NVarChar,op).query(`UPDATE enforcement.Documents SET FileContent=CASE WHEN @op='approve' THEN @pdf ELSE FileContent END,MimeType=CASE WHEN @op='approve' THEN 'application/pdf' ELSE MimeType END,FileName=CASE WHEN @op='approve' THEN 'signed-document.pdf' ELSE FileName END,ApprovalState=@state,ApprovedBy=CASE WHEN @op='approve' THEN @actor ELSE ApprovedBy END,ApprovedAt=CASE WHEN @op='approve' THEN SYSUTCDATETIME() ELSE ApprovedAt END,DigitalSignatureHash=CASE WHEN @op='approve' THEN @signature ELSE DigitalSignatureHash END,SignedByUserId=CASE WHEN @op='approve' THEN @actor ELSE SignedByUserId END,SignedAt=CASE WHEN @op='approve' THEN SYSUTCDATETIME() ELSE SignedAt END,SignatureMethod=CASE WHEN @op='approve' THEN 'Admin-registered handwritten signature' ELSE SignatureMethod END,IssuedAt=CASE WHEN @op='issue' THEN SYSUTCDATETIME() ELSE IssuedAt END,IsPublished=CASE WHEN @op='publish' THEN 1 ELSE IsPublished END,PublishedAt=CASE WHEN @op='publish' THEN SYSUTCDATETIME() ELSE PublishedAt END WHERE DocumentId=@id`);
    if(op==='approve')await audit(tx,req.user,c.CaseId,'DocumentSignatureApplied',{documentId:d.DocumentId,type,version:d.VersionNumber,fingerprint:signature.toString('hex'),imageHash:signed.imageHash,registeredImageHash:signed.registeredImageHash,signerName:signed.name,method:signed.method});
    if(type==='Notice'&&op==='issue')await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('ref',sql.NVarChar,d.ReferenceNumber).query('UPDATE enforcement.Cases SET NoticeReference=@ref WHERE CaseId=@id');
   }
   if(b.action==='complete-hearing'){
    const h=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT TOP(1) * FROM enforcement.Hearings WHERE CaseId=@id ORDER BY CreatedAt DESC,HearingId DESC")).recordset[0];
    fail(!h||h.Status!=='Completed'||new Date(h.HearingAt)>new Date(),'Complete a hearing with proceedings before preparing the order.',409);
    next.due=new Date(new Date(h.HearingAt).getTime()+config.orderDays*86400000);
   }
   if(b.action==='complete-demolition'){
    fail(!b.outcome?.trim(),'Record the demolition outcome.');
    const evidence=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT DocumentType FROM enforcement.Documents WHERE CaseId=@id AND DocumentType IN ('before-demolition','after-demolition') AND FileContent IS NOT NULL")).recordset;
    fail(!['before-demolition','after-demolition'].every(t=>evidence.some(e=>e.DocumentType===t)),'Before and after demolition photographs are required.',409);
    const drive=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query('SELECT TOP(1) * FROM enforcement.DemolitionDrives WHERE CaseId=@id AND CompletedAt IS NULL ORDER BY PlannedAt DESC')).recordset[0];fail(!drive,'Link a demolition drive plan before completing enforcement.',409);
    await request(tx).input('id',sql.UniqueIdentifier,drive.DemolitionDriveId).input('outcome',sql.NVarChar(sql.MAX),b.outcome).query('UPDATE enforcement.DemolitionDrives SET CompletedAt=SYSUTCDATETIME(),Outcome=@outcome WHERE DemolitionDriveId=@id');
   }
   if(b.action==='close'){
    const r=await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query(`SELECT (SELECT COUNT(*) FROM enforcement.CaseReferences WHERE CaseId=@id AND Status<>'Completed') AS Pending,(SELECT COUNT(*) FROM enforcement.DemolitionDrives WHERE CaseId=@id AND CompletedAt IS NOT NULL) AS Done,(SELECT COUNT(*) FROM enforcement.Documents WHERE CaseId=@id AND DocumentType='Order' AND IsPublished=1) AS Published`);
    fail(r.recordset[0].Pending||!r.recordset[0].Done||!r.recordset[0].Published,'Complete references, demolition and order publication before closure.',409);
   }
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('step',sql.NVarChar,next.step).input('stage',sql.TinyInt,next.stage).input('status',sql.NVarChar,next.status).input('due',sql.DateTime2,next.due).query(`UPDATE enforcement.Cases SET WorkflowStep=@step,CurrentStage=@stage,Status=@status,StageStartedAt=SYSUTCDATETIME(),NextActionAt=@due,EscalatedAt=NULL,ResponsibleUserId=CASE WHEN @step IN ('notice-approval','order-approval') THEN NULL WHEN @step='correction' THEN AssignedSurveyorId ELSE AssignedCucId END,ClosedAt=CASE WHEN @status='Closed' THEN SYSUTCDATETIME() ELSE ClosedAt END WHERE CaseId=@id`);
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('actor',sql.UniqueIdentifier,req.user.UserId).input('action',sql.NVarChar,b.action).input('stage',sql.TinyInt,next.stage).input('notes',sql.NVarChar(sql.MAX),b.reason).query('INSERT enforcement.CaseActions(CaseId,ActionType,Stage,Notes,PerformedByUserId) VALUES(@id,@action,@stage,@notes,@actor)');
   await audit(tx,req.user,c.CaseId,'WorkflowTransition',{from:inferredStep(c),to:next.step,previousDeadline:c.NextActionAt,action:b.action,documentId:b.documentId,reason:b.reason,previewReviewed:b.previewReviewed});
   if(b.action==='close')await storeSiteReport(tx,c,req.user);
  });publishChange();res.json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/survey',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);fail(req.user.RoleCode!=='surveyor'||!same(req.user.UserId,c.AssignedSurveyorId)||inferredStep(c)!=='correction','Only the assigned Surveyor can correct a returned survey.',403);
   const lat=Number(b.latitude),lng=Number(b.longitude);fail(b.latitude===''||b.longitude===''||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!b.owner?.trim()||!b.reason?.trim(),'Owner, valid coordinates and correction reason required.');
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('owner',sql.NVarChar,b.owner).input('lat',sql.Decimal(10,7),lat).input('lng',sql.Decimal(10,7),lng).input('violation',sql.NVarChar(sql.MAX),b.violation??c.ViolationDescription).input('reason',sql.NVarChar(sql.MAX),b.reason).input('actor',sql.UniqueIdentifier,req.user.UserId).query(`UPDATE enforcement.Cases SET OwnerName=@owner,Latitude=@lat,Longitude=@lng,ViolationDescription=@violation,LocationSource='Survey correction',LocationCapturedAt=SYSUTCDATETIME() WHERE CaseId=@id; INSERT enforcement.Surveys(CaseId,VisitAt,Latitude,Longitude,EncroachmentDetails,Remarks,SubmittedByUserId) VALUES(@id,SYSUTCDATETIME(),@lat,@lng,@violation,@reason,@actor)`);
   await audit(tx,req.user,c.CaseId,'SurveyCorrected',{before:{owner:c.OwnerName,latitude:c.Latitude,longitude:c.Longitude,violation:c.ViolationDescription},after:b});
  });publishChange();res.json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/documents',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);fail(!canOperate(req.user,c),'Assigned CUC required.',403);fail(c.IsArchived||c.Status==='Closed','Case is archived or closed.',409);
   fail(!['Notice','Order'].includes(b.type),'Choose Notice or Order.');
   fail(!(b.type==='Notice'?['notice-draft','notice-publication','hearing']:['order-draft','order-publication','demolition']).includes(inferredStep(c)),'A draft cannot be prepared at this stage.',409);
   fail(typeof b.reference!=='string'||!b.reference.trim()||b.reference.length>80,'Use the existing departmental notice/outward reference.');
   fail(!b.reason?.trim(),'Draft or revision reason is required.');
   const template=(await request(tx).input('id',sql.UniqueIdentifier,b.templateId).query('SELECT * FROM enforcement.DocumentTemplates WHERE TemplateId=@id')).recordset[0];fail(!template||template.DocumentType!==b.type,'Select a registered departmental template of the correct type.');
   c.NoticeAuthority=await resolveNoticeAuthority(tx,c,b.authorityId);
   if(b.body!==undefined)b.content=JSON.stringify(buildDocument(c,b,template));
   else {fail(typeof b.content!=='string'||!b.content.trim()||b.content.length>100000,'Document content is required.');b.content=JSON.stringify(buildDocument(c,{...b,body:b.content,recipients:b.recipients||[{}]},template));}
   // Render before saving so unprintable or overflowing layouts cannot enter review.
   await pdfBytes(b.content,{reference:b.reference});
   const previous=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('type',sql.NVarChar,b.type).query('SELECT TOP(1) * FROM enforcement.Documents WHERE CaseId=@id AND DocumentType=@type ORDER BY VersionNumber DESC')).recordset[0];
   const duplicate=(await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('type',sql.NVarChar,b.type).input('ref',sql.NVarChar,b.reference).query('SELECT TOP(1) DocumentId FROM enforcement.Documents WITH (UPDLOCK,HOLDLOCK) WHERE CaseId<>@id AND DocumentType=@type AND ReferenceNumber=@ref')).recordset[0];fail(Boolean(duplicate),'This instrument reference belongs to another case.',409);
   fail(previous&&b.reference!==previous.ReferenceNumber,'Revisions must preserve the existing reference.');
   await request(tx).input('template',sql.UniqueIdentifier,template.TemplateId).input('id',sql.UniqueIdentifier,c.CaseId).input('actor',sql.UniqueIdentifier,req.user.UserId).input('type',sql.NVarChar,b.type).input('reference',sql.NVarChar,b.reference).input('content',sql.NVarChar(sql.MAX),b.content).input('reason',sql.NVarChar,b.reason).input('v',sql.Int,(previous?.VersionNumber??0)+1).input('previous',sql.UniqueIdentifier,previous?.DocumentId??null).query('INSERT enforcement.Documents(CaseId,DocumentType,ReferenceNumber,Content,CreatedByUserId,VersionNumber,SupersedesId,ChangeReason,TemplateId) VALUES(@id,@type,@reference,@content,@actor,@v,@previous,@reason,@template)');
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('step',sql.NVarChar,b.type==='Notice'?'notice-draft':'order-draft').input('stage',sql.TinyInt,b.type==='Notice'?4:7).query("UPDATE enforcement.Cases SET WorkflowStep=@step,CurrentStage=@stage,Status='In progress' WHERE CaseId=@id");
   await audit(tx,req.user,c.CaseId,'DocumentVersionCreated',{type:b.type,reference:b.reference,version:(previous?.VersionNumber??0)+1,reason:b.reason});
  });publishChange();res.status(201).json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/evidence',wrap(async(req,res)=>{
  const b=req.body,file=validateFile(b),p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);fail(!canOperate(req.user,c)&&!(req.user.RoleCode==='surveyor'&&same(req.user.UserId,c.AssignedSurveyorId)),'Assigned field staff required.',403);fail(c.IsArchived||c.Status==='Closed','Case is archived or closed.',409);
   if(b.category.startsWith('signed-')){const instrument=await ownedDocument(tx,c,b.instrumentId);fail(instrument.DocumentType!==(b.category==='signed-notice'?'Notice':'Order'),'Select the correct instrument to sign.');}
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('actor',sql.UniqueIdentifier,req.user.UserId).input('instrument',sql.UniqueIdentifier,b.category.startsWith('signed-')?b.instrumentId:null).input('type',sql.NVarChar,b.category).input('name',sql.NVarChar,b.fileName).input('mime',sql.NVarChar,file.mime).input('bytes',sql.VarBinary(sql.MAX),file.bytes).query('INSERT enforcement.Documents(CaseId,DocumentType,FileName,MimeType,FileContent,CreatedByUserId,SupersedesId) VALUES(@id,@type,@name,@mime,@bytes,@actor,@instrument)');
   await audit(tx,req.user,c.CaseId,'EvidenceUploaded',{category:b.category,fileName:b.fileName,size:file.bytes.length});
  });publishChange();res.status(201).json({saved:true});
 }));
 app.get('/api/workflow/cases/:key/evidence/:id',wrap(async(req,res)=>{
  const p=await getPool();const file=await transaction(p,async tx=>{const c=await loadCase(tx,req.params.key,req.user);return ownedDocument(tx,c,req.params.id);});fail(!file.FileContent,'File content is unavailable.',404);res.set({'Content-Type':file.MimeType,'Content-Disposition':`attachment; filename="${file.FileName.replace(/["\r\n]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).send(file.FileContent);
 }));
 app.post('/api/workflow/cases/:key/hearings',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);fail(!canOperate(req.user,c),'Assigned CUC required.',403);fail(inferredStep(c)!=='hearing','Case is not at hearing stage.',409);
   const d=await ownedDocument(tx,c,b.noticeId);fail(d.DocumentType!=='Notice'||!d.IssuedAt,'Choose an issued notice.');
   const date=new Date(b.hearingAt);fail(!Number.isFinite(date.getTime())||date<new Date(d.IssuedAt),'Enter a valid hearing date after notice issuance.');
   fail(!['Scheduled','Completed','Adjourned','Rescheduled'].includes(b.status)||!b.venue?.trim()||!b.proceedings?.trim(),'Venue, proceedings/reason and hearing status are required.');
   fail(b.status==='Completed'&&date>new Date(),'A future hearing cannot be completed.');
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('notice',sql.UniqueIdentifier,d.DocumentId).input('date',sql.DateTime2,date).input('venue',sql.NVarChar,b.venue).input('status',sql.NVarChar,b.status).input('attendance',sql.NVarChar(sql.MAX),b.attendance??'').input('proceedings',sql.NVarChar(sql.MAX),b.proceedings).input('actor',sql.UniqueIdentifier,req.user.UserId).query('INSERT enforcement.Hearings(CaseId,NoticeId,HearingAt,Venue,Status,AttendanceNotes,Proceedings,CreatedByUserId) VALUES(@id,@notice,@date,@venue,@status,@attendance,@proceedings,@actor)');
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('date',sql.DateTime2,date).query('UPDATE enforcement.Cases SET NextActionAt=@date,EscalatedAt=NULL WHERE CaseId=@id');
   await audit(tx,req.user,c.CaseId,'HearingRecorded',{...b,previousDeadline:c.NextActionAt});
  });publishChange();res.status(201).json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/references',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);fail(!canOperate(req.user,c)&&!(req.user.RoleCode==='surveyor'&&same(req.user.UserId,c.AssignedSurveyorId)),'Assigned field staff required.',403);fail(c.IsArchived||c.Status==='Closed','Case is archived or closed.',409);
   fail(!['Government','Department','Grievance portal','Email','Physical letter'].includes(b.source)||!b.reference?.trim()||!b.date||!Number.isFinite(Date.parse(b.date))||!['Pending','Completed'].includes(b.status),'Valid source, reference, date and status are required.');
   fail(b.status==='Completed'&&(!b.response?.trim()||!b.respondedAt||!Number.isFinite(Date.parse(b.respondedAt))),'Completed references require a response and response date.');
   if(b.documentId){const d=await ownedDocument(tx,c,b.documentId);fail(d.DocumentType!=='reference','Choose reference evidence.');}
   await request(tx).input('rid',sql.UniqueIdentifier,b.referenceId??null).input('id',sql.UniqueIdentifier,c.CaseId).input('source',sql.NVarChar,b.source).input('ref',sql.NVarChar,b.reference).input('date',sql.Date,b.date).input('status',sql.NVarChar,b.status).input('details',sql.NVarChar(sql.MAX),b.details??'').input('response',sql.NVarChar(sql.MAX),b.response??null).input('responded',sql.Date,b.respondedAt||null).input('doc',sql.UniqueIdentifier,b.documentId||null).input('actor',sql.UniqueIdentifier,req.user.UserId).query(`IF @rid IS NULL INSERT enforcement.CaseReferences(CaseId,Source,ReferenceNumber,ReferenceDate,Status,Details,Response,RespondedAt,DocumentId,CreatedBy) VALUES(@id,@source,@ref,@date,@status,@details,@response,@responded,@doc,@actor); ELSE BEGIN UPDATE enforcement.CaseReferences SET Status=@status,Response=@response,RespondedAt=@responded,DocumentId=@doc WHERE ReferenceId=@rid AND CaseId=@id; IF @@ROWCOUNT=0 THROW 50001,'Reference not found.',1; END`);
   await audit(tx,req.user,c.CaseId,'ReferenceRecorded',b);
  });publishChange();res.status(201).json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/legal',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);fail(!['legal','ccuc'].includes(req.user.RoleCode),'Authorized legal reviewer or CCUC required.',403);
   fail(!b.reference?.trim()||!b.source?.trim()||!b.status?.trim()||!b.reason?.trim()||typeof b.restricts!=='boolean','Reference, authoritative source, status, restriction decision and review reason are required.');
   fail(c.LegalHold&&!b.restricts&&req.user.RoleCode!=='ccuc','CCUC clearance is required to release an existing restriction.',403);
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('actor',sql.UniqueIdentifier,req.user.UserId).input('ref',sql.NVarChar,b.reference).input('source',sql.NVarChar,b.source).input('status',sql.NVarChar,b.status).input('court',sql.NVarChar,b.court??null).input('notes',sql.NVarChar(sql.MAX),b.reason).input('hold',sql.Bit,b.restricts).query(`INSERT enforcement.LegalUpdates(CaseId,LegalReference,LegalStatus,CourtReference,Notes,SynchronizedByUserId,Source,RestrictsEnforcement,ClearanceReason) VALUES(@id,@ref,@status,@court,@notes,@actor,@source,@hold,CASE WHEN @hold=0 THEN @notes ELSE NULL END); UPDATE enforcement.Cases SET LegalHold=@hold WHERE CaseId=@id`);
   await audit(tx,req.user,c.CaseId,b.restricts?'LegalRestrictionRecorded':'LegalReviewRecorded',{...b,previousHold:c.LegalHold});
  });publishChange();res.status(201).json({saved:true});
 }));
 app.get('/api/workflow/cases/:key/lts',wrap(async(req,res)=>{const p=await getPool();await transaction(p,tx=>loadCase(tx,req.params.key,req.user));res.status(503).json(await retrieveLegalRecord());}));
 app.post('/api/workflow/cases/:key/routing',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);fail(!canOperate(req.user,c)&&req.user.RoleCode!=='master','Assigned CUC or administrator required.',403);fail(!b.reason?.trim(),'Record the routing reason.');
   const target=(await request(tx).input('id',sql.UniqueIdentifier,b.cucId).query("SELECT UserId FROM enforcement.Users WHERE UserId=@id AND RoleCode='cuc' AND IsActive=1")).recordset[0];fail(!target,'Choose an active CUC.');
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('cuc',sql.UniqueIdentifier,b.cucId).query('UPDATE enforcement.Cases SET AssignedCucId=@cuc,ResponsibleUserId=CASE WHEN ResponsibleUserId=AssignedCucId THEN @cuc ELSE ResponsibleUserId END WHERE CaseId=@id');
   await audit(tx,req.user,c.CaseId,'CaseForwarded',{from:c.AssignedCucId,to:b.cucId,reason:b.reason});
  });publishChange();res.json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/transfer',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{
   const c=await loadCase(tx,req.params.key,req.user,true);fail(req.user.RoleCode!=='ccuc','CCUC authorization is required.',403);fail(!b.reason?.trim()||!Number.isFinite(Date.parse(b.startsAt))||!Number.isFinite(Date.parse(b.endsAt))||new Date(b.endsAt)<=new Date(b.startsAt),'Reason and valid charge period required.');
   const target=(await request(tx).input('id',sql.UniqueIdentifier,b.cucId).query("SELECT UserId FROM enforcement.Users WHERE UserId=@id AND IsActive=1 AND RoleCode='cuc'")).recordset[0];fail(!target,'Replacement must be an active CUC.');
   await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('from',sql.UniqueIdentifier,c.AssignedCucId).input('to',sql.UniqueIdentifier,b.cucId).input('actor',sql.UniqueIdentifier,req.user.UserId).input('start',sql.DateTime2,new Date(b.startsAt)).input('end',sql.DateTime2,new Date(b.endsAt)).input('reason',sql.NVarChar,b.reason).query('INSERT enforcement.ChargeTransfers(CaseId,FromUserId,ToUserId,AuthorizedBy,StartsAt,EndsAt,Reason) VALUES(@id,@from,@to,@actor,@start,@end,@reason)');
   await audit(tx,req.user,c.CaseId,'TemporaryChargeAuthorized',b);
  });publishChange();res.json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/deadline',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();await transaction(p,async tx=>{const c=await loadCase(tx,req.params.key,req.user,true);ensureVersion(c,b);fail(req.user.RoleCode!=='master','Administrator required.',403);fail(!b.reason?.trim()||!Number.isFinite(Date.parse(b.dueAt)),'Valid due date and change reason required.');await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('date',sql.DateTime2,new Date(b.dueAt)).query('UPDATE enforcement.Cases SET NextActionAt=@date,EscalatedAt=NULL WHERE CaseId=@id');await audit(tx,req.user,c.CaseId,'DeadlineRecalculated',{before:c.NextActionAt,after:b.dueAt,reason:b.reason});});publishChange();res.json({saved:true});
 }));
 app.get('/api/workflow/drives',wrap(async(req,res)=>{const p=await getPool();res.json((await scopedRequest(p,req.user).query(`SELECT d.*,(SELECT COUNT(*) FROM enforcement.DemolitionDrives x WHERE x.DriveId=d.DriveId) AS LinkedCases,(SELECT COUNT(*) FROM enforcement.DemolitionDrives x WHERE x.DriveId=d.DriveId AND x.CompletedAt IS NOT NULL) AS CompletedCases FROM enforcement.DrivePlans d `)).recordset);}));
 app.post('/api/workflow/drives',wrap(async(req,res)=>{
  const b=req.body,p=await getPool();fail(req.user.RoleCode!=='ccuc','CCUC required to maintain drive plans.',403);fail(!b.serial?.trim()||!b.node?.trim()||!b.details?.trim()||!Number.isFinite(Date.parse(driveDateInput(b.date))),'Serial, date, node and plan details required.');
  await transaction(p,async tx=>{await request(tx).input('serial',sql.NVarChar,b.serial).input('date',sql.DateTime2,new Date(driveDateInput(b.date))).input('node',sql.NVarChar,b.node).input('details',sql.NVarChar(sql.MAX),b.details).input('actor',sql.UniqueIdentifier,req.user.UserId).query('INSERT enforcement.DrivePlans(SerialNumber,PlannedAt,Node,Details,CreatedBy) VALUES(@serial,@date,@node,@details,@actor)');await audit(tx,req.user,null,'DrivePlanCreated',b);});publishChange();res.status(201).json({saved:true});
 }));
 app.patch('/api/workflow/drives/:id',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='ccuc','CCUC required.',403);const b=req.body;fail(!b.details?.trim()||!Number.isFinite(Date.parse(driveDateInput(b.date)))||!b.reason?.trim(),'Revised date, plan details and change reason required.');
  const p=await getPool();await transaction(p,async tx=>{const before=(await request(tx).input('id',sql.UniqueIdentifier,req.params.id).query('SELECT d.* FROM enforcement.DrivePlans d WITH (UPDLOCK,HOLDLOCK) WHERE DriveId=@id')).recordset[0];fail(!before,'Drive not found or access denied.',404);await request(tx).input('id',sql.UniqueIdentifier,req.params.id).input('date',sql.DateTime2,new Date(driveDateInput(b.date))).input('details',sql.NVarChar(sql.MAX),b.details).query('UPDATE enforcement.DrivePlans SET PlannedAt=@date,Details=@details WHERE DriveId=@id');await audit(tx,req.user,before.DriveId,'DrivePlanRevised',{before,after:b});});publishChange();res.json({saved:true});
 }));
 app.post('/api/workflow/cases/:key/drive',wrap(async(req,res)=>{
  const p=await getPool();await transaction(p,async tx=>{const c=await loadCase(tx,req.params.key,req.user,true);fail(!canOperate(req.user,c)&&req.user.RoleCode!=='ccuc','Assigned CUC or CCUC required.',403);fail(inferredStep(c)!=='demolition','Issue and publish the order before linking demolition.',409);const d=(await request(tx).input('id',sql.UniqueIdentifier,req.body.driveId).input('node',sql.NVarChar,c.Node).query('SELECT * FROM enforcement.DrivePlans WHERE DriveId=@id AND Node=@node')).recordset[0];fail(!d,'Choose a drive in the case jurisdiction.');await request(tx).input('id',sql.UniqueIdentifier,c.CaseId).input('drive',sql.UniqueIdentifier,d.DriveId).input('date',sql.DateTime2,d.PlannedAt).input('actor',sql.UniqueIdentifier,req.user.UserId).query('INSERT enforcement.DemolitionDrives(CaseId,DriveId,PlannedAt,CreatedByUserId) VALUES(@id,@drive,@date,@actor)');await audit(tx,req.user,c.CaseId,'CaseLinkedToDrive',{driveId:d.DriveId});});publishChange();res.json({saved:true});
 }));
 app.get('/api/workflow/reports',wrap(async(req,res)=>{
  const p=await getPool();await refreshEscalations(p);const rows=(await scopedRequest(p,req.user).query(`SELECT c.*,${propertyHoldSql()} AS PropertyLegalHold,u.DisplayName AS ResponsibleOfficer FROM enforcement.Cases c LEFT JOIN enforcement.Users u ON u.UserId=c.ResponsibleUserId WHERE c.IsArchived=0 AND ${scopeSql()}`)).recordset;
  const filtered=rows.filter(c=>{
   const overdue=c.Status!=='Closed'&&c.NextActionAt&&new Date(c.NextActionAt)<new Date();
   return ['node','sector','plot','survey','officer'].every(k=>!req.query[k]||String(c[{node:'Node',sector:'Sector',plot:'PlotNumber',survey:'SurveyReference',officer:'ResponsibleOfficer'}[k]]??'').toLowerCase().includes(String(req.query[k]).toLowerCase()))
    &&(!req.query.stage||inferredStep(c)===req.query.stage)
    &&(!req.query.status||(req.query.status==='Overdue'?overdue:c.Status===req.query.status))
    &&(!req.query.from||new Date(c.CreatedAt)>=new Date(req.query.from))
    &&(!req.query.to||new Date(c.CreatedAt)<new Date(new Date(req.query.to).getTime()+86400000));
  });
  const ids=new Set(filtered.map(c=>c.CaseId));const result={cases:filtered.map(c=>({...toUiCase(c,req.user),step:inferredStep(c),closedAt:c.ClosedAt,stageStartedAt:c.StageStartedAt}))};
  for(const table of ['Documents','Hearings','DemolitionDrives','LegalUpdates','CaseReferences','CaseActions'])result[table]=(await scopedRequest(p,req.user).query(`SELECT ${table==='Documents'?'r.DocumentId,r.CaseId,r.DocumentType,r.ReferenceNumber,r.VersionNumber,r.ApprovalState,r.ApprovedAt,r.IssuedAt,r.IsPublished,r.PublishedAt,r.FileName,r.CreatedAt':'r.*'} FROM enforcement.${table} r JOIN enforcement.Cases c ON c.CaseId=r.CaseId WHERE c.IsArchived=0 AND ${scopeSql()}`)).recordset.filter(r=>ids.has(r.CaseId));
  result.AuditLog=(await scopedRequest(p,req.user).query(`SELECT r.* FROM enforcement.AuditLog r JOIN enforcement.Cases c ON c.CaseId=r.EntityId WHERE c.IsArchived=0 AND ${scopeSql()}`)).recordset.filter(r=>ids.has(r.EntityId));
  result.nodes=Object.values(filtered.reduce((out,c)=>{out[c.Node]??={node:c.Node,cases:0,closed:0,overdue:0,caseIds:[]};out[c.Node].cases++;out[c.Node].caseIds.push(c.CaseNumber);out[c.Node].closed+=c.Status==='Closed'?1:0;out[c.Node].overdue+=c.Status!=='Closed'&&c.NextActionAt&&new Date(c.NextActionAt)<new Date()?1:0;return out;},{}));
  const caseNumber=id=>filtered.find(c=>same(c.CaseId,id))?.CaseNumber;
  for(const table of ['Documents','Hearings','DemolitionDrives','LegalUpdates','CaseReferences','CaseActions'])result[table]=result[table].map(r=>({...r,caseNumber:caseNumber(r.CaseId)}));
  result.NoticeRegister=result.Documents.filter(d=>d.DocumentType==='Notice');
  result.PublicationRegister=result.Documents.filter(d=>['Notice','Order'].includes(d.DocumentType)&&d.IsPublished);
  result.OrderRegister=result.Documents.filter(d=>d.DocumentType==='Order');
  result.Compliance=result.cases.map(c=>({caseNumber:c.caseKey,node:c.node,step:c.step,responsible:c.officer,due:c.nextActionAt,status:c.status}));
  result.OverdueEscalation=result.cases.filter(c=>c.overdueDays>0).map(c=>({caseNumber:c.caseKey,stage:c.step,responsible:c.officer,due:c.nextActionAt,overdueDays:c.overdueDays,escalatedAt:c.escalatedAt}));
  result.Closures=result.cases.filter(c=>c.status==='Closed').map(c=>({caseNumber:c.caseKey,node:c.node,closedAt:c.closedAt}));
  result.WorkflowDurations=filtered.flatMap(c=>{const events=result.AuditLog.filter(a=>same(a.EntityId,c.CaseId)&&['WorkflowTransition','CucCaseApproved','CcucCaseApproved'].includes(a.EventType)).sort((a,b)=>new Date(a.OccurredAt)-new Date(b.OccurredAt));const stages=[{step:'review',at:c.CreatedAt},...events.map(a=>({step:a.EventType==='WorkflowTransition'?JSON.parse(a.Detail).to:a.EventType==='CucCaseApproved'?'file-approval':'notice-draft',at:a.OccurredAt}))];return stages.filter(a=>a.step!=='closed').map((a,i)=>({caseNumber:c.CaseNumber,stage:a.step,started:a.at,ended:stages[i+1]?.at??c.ClosedAt??null,durationHours:Math.max(0,((stages[i+1]?new Date(stages[i+1].at):c.ClosedAt?new Date(c.ClosedAt):new Date())-new Date(a.at))/3600000),historyQuality:events.length?'Recorded events':'Legacy transition history unavailable'}));});
  result.LegalExceptions=result.cases.filter(c=>c.legal||!result.LegalUpdates.some(l=>caseNumber(l.CaseId)===c.caseKey)).map(c=>({caseNumber:c.caseKey,node:c.node,restriction:c.legal,legalData:result.LegalUpdates.some(l=>caseNumber(l.CaseId)===c.caseKey)?'Recorded':'Not recorded'}));
  result.DateSummary=Object.values(filtered.reduce((out,c)=>{const date=new Date(c.CreatedAt).toISOString().slice(0,10);out[date]??={date,cases:0,caseNumbers:[]};out[date].cases++;out[date].caseNumbers.push(c.CaseNumber);return out;},{}));
  result.nodes=result.nodes.map(n=>{const nodeIds=new Set(filtered.filter(c=>c.Node===n.node).map(c=>c.CaseId));return {...n,notices:new Set(result.NoticeRegister.filter(d=>nodeIds.has(d.CaseId)&&d.IssuedAt).map(d=>d.CaseId)).size,orders:new Set(result.OrderRegister.filter(d=>nodeIds.has(d.CaseId)&&d.IssuedAt).map(d=>d.CaseId)).size,demolitions:new Set(result.DemolitionDrives.filter(d=>nodeIds.has(d.CaseId)&&d.CompletedAt).map(d=>d.CaseId)).size};});
  if(req.user.RoleCode==='master'){result.UserAccess=(await p.request().query('SELECT UserId,Username,DisplayName,RoleCode,IsActive FROM enforcement.Users')).recordset.map(u=>({...u,permissions:u.RoleCode}));result.AuditLog=(await p.request().query('SELECT TOP(10000) AuditId,UserId,EntityType,EntityId,EventType,Detail,OccurredAt FROM enforcement.AuditLog ORDER BY AuditId DESC')).recordset;}
  res.json(result);
 }));
}
