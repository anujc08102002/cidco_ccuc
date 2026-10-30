import {createDesktopNotifications} from './desktop-notifications.js';
import {registerDriveAnnouncementRoutes} from './drive-announcements.js';
import {registerRecoveryPublicRoutes,registerRecoveryRoutes} from './password-recovery.js';
import dotenv from 'dotenv';
import {registerAccountWorkspaceRoutes} from './account-workspace.js';
import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import crypto from 'node:crypto';
import {issueSession,readSession,matchesSessionPassword} from './sessions.js';
import {validateSurveyFields,parseSections} from './survey-fields.js';
import {registerAdminCaseRoutes,requireMaster,restoreExpiredArchives} from './admin-cases.js';
import {registerPublicRoutes,registerWorkflowRoutes,scopeSql,scopedRequest,workflowSettings,refreshEscalations,propertyHoldSql} from './enforcement-workflow.js';
import {WorkflowError} from './workflow-policy.js';
import {hashPassword,verifyPassword} from './passwords.js';

dotenv.config({ override: true });

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, exposedHeaders:['Content-Disposition'] }));
app.use(express.json({ limit: '32mb' }));
app.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();});

const [databaseServer, databasePort] = (process.env.DB_SERVER || '').split(',');
const config = {
  server: databaseServer, port: databasePort ? Number(databasePort) : undefined, database: process.env.DB_DATABASE || 'EnforceFlow',
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  options: { encrypt: process.env.DB_ENCRYPT !== 'false', trustServerCertificate: process.env.DB_TRUST_CERTIFICATE === 'true' },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};
let poolReady;
let lastDatabaseError = '';
const hasDatabaseConfig = Boolean(process.env.DB_SERVER);
const getPool = () => {
  if (!hasDatabaseConfig) throw new Error('Database is not configured. Copy .env.example to .env and set DB_SERVER.');
  if (!poolReady) poolReady = new sql.ConnectionPool(config).connect().catch((error) => {
    lastDatabaseError = error?.originalError?.info?.message ?? error?.originalError?.message ?? error?.message ?? 'Database connection failed.';
    poolReady = undefined;
    throw error;
  });
  return poolReady;
};
const stages = [
  '1. Site Survey & Enforcement Case Creation', '2. File Verification by CUC', '3. File Approval by CCUC',
  '4. Notice Generation', '5. Digital Signing & Online Publication', '6. First Monitoring & Internal CIDCO Hearing',
  '7. Order Draft & Final Order', '8. Second Monitoring & Demolition Drive'
];
const caseCode = (value, fallback) => {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (compact || fallback).slice(0, 8);
};
const caseInitials = (value, fallback) => {
  const initials = String(value ?? '').toUpperCase().match(/[A-Z]+|\d+/g)?.map(part => part[0]).join('');
  return initials || fallback;
};
const toUiCase = (row, user) => ({
  id: /^CASE\/[0-9a-f]{8}-/i.test(row.CaseNumber)?`CASE/${new Date(row.CreatedAt).getUTCFullYear()}/${row.CaseNumber.slice(5,13).toUpperCase()}`:row.CaseNumber,
  caseKey:row.CaseNumber, currentStage:row.CurrentStage, canVerify: Boolean(user?.RoleCode === 'cuc' && (String(row.AssignedCucId).toLowerCase() === String(user.UserId).toLowerCase()||row.Delegated) && [1,2].includes(row.CurrentStage) && row.WorkflowStep!=='correction' && ['In progress','Awaiting approval','Overdue'].includes(row.Status) && !row.LegalHold && !row.IsArchived), property: row.PropertyReference, sector: row.Sector, node: row.Node, owner: row.OwnerName,
  stage: stages[Math.max(0, Math.min(7, row.CurrentStage - 1))], status: row.Status,
  updated: row.NextActionAt ? new Date(row.NextActionAt).toLocaleDateString('en-GB') : [1,2].includes(row.CurrentStage) && ['In progress','Awaiting approval','Overdue'].includes(row.Status) ? 'Awaiting CUC verification' : row.CurrentStage === 3 && row.Status === 'Awaiting approval' ? 'Awaiting CCUC approval' : 'Action required',
  legal: Boolean(row.LegalHold||row.PropertyLegalHold), notice: row.NoticeReference || 'Draft', survey: row.SurveyReference || 'Not recorded',
  officer: row.Status === 'Awaiting approval' && (row.CurrentStage===3||['notice-approval','order-approval'].includes(row.WorkflowStep)) ? 'Jurisdiction CCUC approval pending' : row.ResponsibleOfficer || 'Unassigned', surveyor: row.Surveyor || 'Unassigned', assignedCuc: row.AssignedCuc || 'Unassigned',
  latitude: row.Latitude, longitude: row.Longitude, siteAddress: row.SiteAddress, locationSource: row.LocationSource,
  locationAccuracyMetres: row.LocationAccuracyMetres, locationCapturedAt: row.LocationCapturedAt,
  priority:row.Priority??null,violationDescription:row.ViolationDescription??null,applicableSections:parseSections(row.ApplicableSections),createdAt:row.CreatedAt,
  plotNumber:row.PlotNumber,village:row.Village,constructionType:row.ConstructionType,workflowStep:row.WorkflowStep,escalatedAt:row.EscalatedAt,
  overdueDays:row.Status!=='Closed'&&row.NextActionAt?Math.max(0,Math.ceil((Date.now()-new Date(row.NextActionAt).getTime())/86400000)):0,
  archived:Boolean(row.IsArchived),archivedAt:row.ArchivedAt,archiveUntil:row.ArchiveUntil,archiveReason:row.ArchiveReason,
  surveyorId:row.AssignedSurveyorId,cucId:row.AssignedCucId,responsibleUserId:row.ResponsibleUserId,nextActionAt:row.NextActionAt,rowVersion:row.RowVersion?Buffer.from(row.RowVersion).toString('hex'):undefined
});
const requireConfigured = (req,res,next) => hasDatabaseConfig ? next() : res.status(503).json({ error: 'Database is not configured. Set DB_SERVER, DB_USER and DB_PASSWORD in .env.' });
/* SQL Server HASHBYTES on NVARCHAR hashes UTF-16LE bytes. */
const sha512 = hashPassword;
const passwordsMatch = verifyPassword;
const clients=new Set();
let desktopNotifications;
const publishChange=()=>{for(const response of clients)response.write('data: changed\n\n');void desktopNotifications?.dispatch().catch(()=>{});};
const sessionUser=user=>({id:user.UserId,username:user.Username,name:user.DisplayName,role:user.RoleCode,label:roleLabels[user.RoleCode],mustChangePassword:Boolean(user.MustChangePassword)});
const requireSession=async(req,res,next)=>{
 try{
  const session=readSession(req.headers.authorization?.replace(/^Bearer /i,''));
  if(!session)return res.status(401).json({error:'Your session has expired. Please sign in again.'});
  const p=await getPool();
  const result=await p.request().input('username',sql.NVarChar,session.username).query('SELECT * FROM enforcement.Users WHERE Username=@username AND IsActive=1');
  const user=result.recordset[0];
  if(!user||user.MustChangePassword||!matchesSessionPassword(session,user))return res.status(401).json({error:'Please sign in again.'});
  req.user=user;next();
 }catch(error){next(error);}
};
const roleLabels = { surveyor:'Field Surveyor', cuc:'Controller of Unauthorized Constructions', ccuc:'Chief Controller of Unauthorized Constructions', legal:'Legal Coordinator', master:'Master Administrator' };
registerPublicRoutes(app,{getPool});
registerRecoveryPublicRoutes(app,{getPool,publishChange});
app.post('/api/auth/login', requireConfigured, async (req,res,next) => { try {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const p = await getPool(); const result = await p.request().input('username', sql.NVarChar, username).query(`
    SELECT TOP 1 * FROM enforcement.Users WHERE Username=@username AND IsActive=1`);
  const user = result.recordset[0];
  if (!user || !passwordsMatch(user.PasswordHash, password)) return res.status(401).json({ error: 'Invalid username or password.' });
  res.json({...sessionUser(user),token:user.MustChangePassword?null:issueSession(user)});
} catch(error) { next(error); } });
app.post('/api/auth/change-password', requireConfigured, async (req,res,next) => { try {
  const { username, temporaryPassword, newPassword } = req.body;
  if (!username || !temporaryPassword || !newPassword) return res.status(400).json({ error: 'Username, temporary password and new password are required.' });
  if (newPassword.length < 12) return res.status(400).json({ error: 'Your new password must be at least 12 characters.' });
  const p = await getPool();
  const found = await p.request().input('username',sql.NVarChar,username).query('SELECT * FROM enforcement.Users WHERE Username=@username AND IsActive=1');
  const user = found.recordset[0];
  if (!user || !passwordsMatch(user.PasswordHash, temporaryPassword)) return res.status(401).json({ error: 'The temporary password is not valid.' });
  const newHash=hashPassword(newPassword);
  await p.request().input('username',sql.NVarChar,username).input('hash',sql.NVarChar,newHash).query('UPDATE enforcement.Users SET PasswordHash=@hash, MustChangePassword=0, UpdatedAt=SYSUTCDATETIME() WHERE Username=@username');
  const updated={...user,PasswordHash:newHash,MustChangePassword:false};
  res.json({...sessionUser(updated),token:issueSession(updated)});
} catch(error) { next(error); } });
app.get('/api/auth/session',requireConfigured,requireSession,(req,res)=>res.json(sessionUser(req.user)));
app.use('/api',(req,res,next)=>req.path==='/health'?next():requireSession(req,res,next));
desktopNotifications=createDesktopNotifications({getPool,holdSql:propertyHoldSql()});
desktopNotifications.register(app);
if(hasDatabaseConfig)desktopNotifications.start();
registerRecoveryRoutes(app,{getPool,publishChange,holdSql:propertyHoldSql()});
registerDriveAnnouncementRoutes(app,{getPool});
registerWorkflowRoutes(app,{getPool,publishChange,toUiCase});
registerAccountWorkspaceRoutes(app,{getPool,publishChange});
// Retain historical operational records for administrator inspection; they are not workflow instruments.
app.use('/api/records',(req,res,next)=>req.method==='GET'?requireMaster(req,res,next):res.status(410).json({error:'Use the linked case workflow. Generic operational records are retained read-only.'}));
registerAdminCaseRoutes(app,{getPool,publishChange,toUiCase});
app.get('/api/events', (req,res)=>{
 res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
 res.flushHeaders();res.write('data: connected\n\n');clients.add(res);
 const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),20000);
 req.on('close',()=>{clearInterval(heartbeat);clients.delete(res)});
});
app.get('/api/users', requireConfigured, async (req,res,next) => { try {
  const p=await getPool(); const result=await p.request().query(`SELECT UserId,Username,Email,DisplayName,RoleCode,IsActive,MustChangePassword,CreatedAt FROM enforcement.Users WHERE IsDeleted=0 ORDER BY DisplayName`);
   const visible=result.recordset.filter(user=>req.user.RoleCode==='master'||user.IsActive&&(['surveyor','master'].includes(req.user.RoleCode)||['cuc','ccuc','legal'].includes(user.RoleCode)||String(user.UserId).toLowerCase()===String(req.user.UserId).toLowerCase()));
  res.json(visible.map(user=>({id:user.UserId,username:req.user.RoleCode==='master'?user.Username:undefined,email:req.user.RoleCode==='master'?user.Email:undefined,name:user.DisplayName,role:user.RoleCode,label:roleLabels[user.RoleCode],active:user.IsActive,mustChangePassword:req.user.RoleCode==='master'?Boolean(user.MustChangePassword):undefined,createdAt:req.user.RoleCode==='master'?user.CreatedAt:undefined})));
} catch(error){next(error)} });
app.get('/api/records/:category', requireConfigured, async (req,res,next) => { try { const p=await getPool();const result=await p.request().input('category',sql.NVarChar,req.params.category).query(`SELECT RecordId,Category,Reference,Title,Details,Status,DueAt,UpdatedAt FROM enforcement.OperationalRecords WHERE Category=@category ORDER BY UpdatedAt DESC`);res.json(result.recordset);}catch(error){next(error)} });
app.post('/api/records/:category', requireConfigured, async (req,res,next) => { try { const {reference,title,details,status,dueAt}=req.body;if(!reference||!title)return res.status(400).json({error:'reference and title are required.'});const p=await getPool();const result=await p.request().input('category',sql.NVarChar,req.params.category).input('reference',sql.NVarChar,reference).input('title',sql.NVarChar,title).input('details',sql.NVarChar,details??null).input('status',sql.NVarChar,status||'Open').input('dueAt',sql.DateTime2,dueAt||null).query(`INSERT INTO enforcement.OperationalRecords (Category,Reference,Title,Details,Status,DueAt) OUTPUT inserted.* VALUES (@category,@reference,@title,@details,@status,@dueAt)`);publishChange();res.status(201).json(result.recordset[0]);}catch(error){next(error)} });
app.patch('/api/records/:id', requireConfigured, async (req,res,next) => { try {const {title,details,status,dueAt}=req.body;const p=await getPool();const result=await p.request().input('id',sql.UniqueIdentifier,req.params.id).input('title',sql.NVarChar,title??null).input('details',sql.NVarChar,details??null).input('status',sql.NVarChar,status??null).input('dueAt',sql.DateTime2,dueAt??null).input('setDueAt',sql.Bit,Object.hasOwn(req.body,'dueAt')).query(`UPDATE enforcement.OperationalRecords SET Title=COALESCE(@title,Title),Details=COALESCE(@details,Details),Status=COALESCE(@status,Status),DueAt=CASE WHEN @setDueAt=1 THEN @dueAt ELSE DueAt END OUTPUT inserted.* WHERE RecordId=@id`);if(!result.recordset[0])return res.status(404).json({error:'Record not found.'});publishChange();res.json(result.recordset[0]);}catch(error){next(error)} });
app.delete('/api/records/:id', requireConfigured, async (req,res,next) => { try {const p=await getPool();const result=await p.request().input('id',sql.UniqueIdentifier,req.params.id).query(`DELETE FROM enforcement.OperationalRecords OUTPUT deleted.RecordId WHERE RecordId=@id`);if(!result.recordset[0])return res.status(404).json({error:'Record not found.'});publishChange();res.status(204).end();}catch(error){next(error)} });
app.get('/api/dashboard', requireConfigured, async (req,res,next) => { try {const p=await getPool();await refreshEscalations(p);const result=await scopedRequest(p,req.user).query(`WITH permitted AS (SELECT c.*,${propertyHoldSql()} AS EffectiveHold FROM enforcement.Cases c WHERE IsArchived=0 AND ${scopeSql()}) SELECT COUNT(CASE WHEN Status<>'Closed' THEN 1 END) AS OpenCases,COUNT(CASE WHEN Status='Awaiting approval' THEN 1 END) AS AwaitingApproval,COUNT(CASE WHEN Status<>'Closed' AND NextActionAt<SYSUTCDATETIME() THEN 1 END) AS Overdue,COUNT(CASE WHEN EffectiveHold=1 THEN 1 END) AS LegalHolds,COUNT(CASE WHEN Status='Closed' AND ClosedAt>=DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0) THEN 1 END) AS ClosedThisMonth FROM permitted`);res.json(result.recordset[0]);}catch(error){next(error)} });
app.get('/api/health', async (_req,res) => { if (!hasDatabaseConfig) return res.status(503).json({ status: 'database-not-configured', setup: 'Set DB_SERVER, DB_USER and DB_PASSWORD in .env.' }); try { await getPool(); lastDatabaseError=''; res.json({ status: 'ok', version: 'temporary-password-policy-v1' }); } catch { res.status(503).json({ status: 'database-unavailable', detail:lastDatabaseError }); } });
app.get('/api/cases', requireConfigured, async (req,res,next) => { try {
  const p = await getPool(); const result = await scopedRequest(p,req.user).input('search', sql.NVarChar, `%${req.query.search ?? ''}%`).query(`
    SELECT CaseId, CaseNumber, PropertyReference, Node, OwnerName, CurrentStage, Status, LegalHold, NoticeReference, NextActionAt, UpdatedAt
    FROM enforcement.Cases c WHERE IsArchived=0 AND ${scopeSql()} AND (CaseNumber LIKE @search OR PropertyReference LIKE @search OR OwnerName LIKE @search) ORDER BY UpdatedAt DESC`);
  res.json(result.recordset);
} catch(error) { next(error); } });
app.get('/api/ui/cases', requireConfigured, async (req,res,next) => { try {
  const p = await getPool(); await restoreExpiredArchives(p,publishChange);await refreshEscalations(p); const result = await scopedRequest(p,req.user).input('includeArchived',sql.Bit,req.user.RoleCode==='master'&&req.query.includeArchived==='1').query(`
    SELECT c.*,${propertyHoldSql()} AS PropertyLegalHold,CASE WHEN EXISTS(SELECT 1 FROM enforcement.ChargeTransfers t WHERE t.CaseId=c.CaseId AND t.ToUserId=@actor AND t.StartsAt<=SYSUTCDATETIME() AND t.EndsAt>SYSUTCDATETIME()) THEN 1 ELSE 0 END AS Delegated, surveyor.DisplayName AS Surveyor, cuc.DisplayName AS AssignedCuc, responsible.DisplayName AS ResponsibleOfficer
    FROM enforcement.Cases c
    LEFT JOIN enforcement.Users surveyor ON surveyor.UserId=c.AssignedSurveyorId
    LEFT JOIN enforcement.Users cuc ON cuc.UserId=c.AssignedCucId
    LEFT JOIN enforcement.Users responsible ON responsible.UserId=c.ResponsibleUserId
    WHERE (c.IsArchived=0 OR @includeArchived=1) AND ${scopeSql()}
    ORDER BY c.UpdatedAt DESC`);
  res.json(result.recordset.map(row=>toUiCase(row,req.user)));
} catch(error) { next(error); } });
app.post('/api/cases', requireConfigured, async (req,res,next) => { try {
  if(!['surveyor','master'].includes(req.user.RoleCode))return res.status(403).json({error:'Your role cannot create cases.'});
  const {propertyReference:propertyInput,sector:sectorInput,node,ownerName,surveyReference,noticeReference,cucId,latitude,longitude,siteAddress,locationSource,locationAccuracyMetres,locationCapturedAt,priority="Normal",violationDescription="",applicableSections=[]}=req.body;
  const {plotNumber='',village=''}=req.body;
  if(typeof plotNumber!=='string'||typeof village!=='string'||plotNumber.length>80||village.length>160)return res.status(400).json({error:'Invalid plot number or village.'});
  const sector=typeof sectorInput==='string'&&sectorInput.trim()?sectorInput.trim():'Unspecified';
  const propertyReference=typeof propertyInput==='string'&&propertyInput.trim()?propertyInput.trim():plotNumber.trim()||`${village} / Survey ${surveyReference??''}`;
  if(!plotNumber.trim()&&(!village.trim()||!surveyReference?.trim()))return res.status(400).json({error:'Provide a plot number, or both village and survey number.'});
  if(noticeReference&&noticeReference!=='Draft')return res.status(400).json({error:'Create notice instruments through the approved case workflow.'});
  const surveyError=validateSurveyFields({priority,violationDescription,applicableSections});if(surveyError)return res.status(400).json({error:surveyError});
  if(![propertyReference,sector,node,ownerName,cucId].every(value=>typeof value==='string'&&value.trim()))return res.status(400).json({error:'Property, node, owner and responsible CUC are required.'});
  const lat=latitude===null||latitude===undefined||latitude===''?NaN:Number(latitude);
  const lng=longitude===null||longitude===undefined||longitude===''?NaN:Number(longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat>90||lng < -180||lng>180)return res.status(400).json({error:'A valid site latitude and longitude are required.'});
  const p=await getPool();
  const cuc=await p.request().input('id',sql.UniqueIdentifier,cucId).query("SELECT UserId, Username, DisplayName FROM enforcement.Users WHERE UserId=@id AND IsActive=1 AND RoleCode='cuc'");
  if(!cuc.recordset.length)return res.status(400).json({error:'Choose an active CUC.'});
  // A sequence is scoped to this exact surveyor / CUC / sector / node combination.
  const prefix=`EF${String(new Date().getUTCFullYear()).slice(-2)}-${caseInitials(req.user.DisplayName,'S')}-${caseInitials(cuc.recordset[0].DisplayName,'C')}-${caseInitials(sector,'S')}-${caseInitials(node,'N')}-`;
  const result=await p.request().input('construction',sql.NVarChar,typeof req.body.constructionType==='string'?req.body.constructionType.slice(0,160):null).input('plot',sql.NVarChar,plotNumber.trim()).input('village',sql.NVarChar,village.trim()).input('p',sql.NVarChar,propertyReference).input('sector',sql.NVarChar,sector.trim()).input('node',sql.NVarChar,node).input('owner',sql.NVarChar,ownerName).input('survey',sql.NVarChar,surveyReference??null).input('notice',sql.NVarChar,noticeReference??null).input('surveyor',sql.UniqueIdentifier,req.user.UserId).input('cuc',sql.UniqueIdentifier,cucId).input('prefix',sql.NVarChar,prefix).input('latitude',sql.Decimal(10,7),lat).input('longitude',sql.Decimal(10,7),lng).input('address',sql.NVarChar,siteAddress??null).input('source',sql.NVarChar,locationSource??null).input('accuracy',sql.Decimal(10,2),locationAccuracyMetres??null).input('capturedAt',sql.DateTime2,locationCapturedAt??new Date()).input('priority',sql.NVarChar,priority).input('violation',sql.NVarChar(sql.MAX),violationDescription).input('sections',sql.NVarChar,JSON.stringify(applicableSections)).query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @number BIGINT;
    SELECT @number=COALESCE(MAX(TRY_CONVERT(BIGINT,SUBSTRING(CaseNumber,LEN(@prefix)+1,40))),0)+1
    FROM enforcement.Cases WITH (TABLOCKX,HOLDLOCK) WHERE CaseNumber LIKE @prefix+'%';
    DECLARE @issued BIGINT;
    SELECT @issued=MAX(TRY_CONVERT(BIGINT,SUBSTRING(Detail,LEN(@prefix)+1,40)))
    FROM enforcement.AuditLog WHERE EntityType='Case' AND EventType='CaseCreated' AND Detail LIKE @prefix+'%';
    IF @issued>=@number SET @number=@issued+1;
    DECLARE @reference NVARCHAR(80)=CONCAT(@prefix,FORMAT(@number,'0000'));
    INSERT enforcement.Cases (CaseNumber,PropertyReference,Sector,Node,OwnerName,SurveyReference,NoticeReference,AssignedSurveyorId,AssignedCucId,ResponsibleUserId,Latitude,Longitude,SiteAddress,LocationSource,LocationAccuracyMetres,LocationCapturedAt,Priority,ViolationDescription,ApplicableSections,CurrentStage,Status,WorkflowStep,StageStartedAt,NextActionAt,PlotNumber,Village,ConstructionType)
    VALUES (@reference,@p,@sector,@node,@owner,@survey,NULL,@surveyor,@cuc,@cuc,@latitude,@longitude,@address,@source,@accuracy,@capturedAt,@priority,@violation,@sections,1,'Awaiting approval','review',SYSUTCDATETIME(),DATEADD(day,COALESCE(TRY_CONVERT(INT,(SELECT JSON_VALUE(Value,'$.reviewDays') FROM enforcement.Settings WHERE SettingKey='deadlines')),15),SYSUTCDATETIME()),@plot,@village,@construction);
    INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail)
    SELECT @surveyor,'Case',CaseId,'CaseCreated',@reference FROM enforcement.Cases WHERE CaseNumber=@reference;
    INSERT enforcement.Surveys(CaseId,VisitAt,Latitude,Longitude,EncroachmentDetails,SubmittedByUserId)
    SELECT CaseId,SYSUTCDATETIME(),@latitude,@longitude,@violation,@surveyor FROM enforcement.Cases WHERE CaseNumber=@reference;
    COMMIT;
    SELECT c.*,surveyor.DisplayName AS Surveyor,cuc.DisplayName AS AssignedCuc,cuc.DisplayName AS ResponsibleOfficer
    FROM enforcement.Cases c LEFT JOIN enforcement.Users surveyor ON surveyor.UserId=c.AssignedSurveyorId
    LEFT JOIN enforcement.Users cuc ON cuc.UserId=c.AssignedCucId WHERE c.CaseNumber=@reference;`);
  publishChange();res.status(201).json(toUiCase(result.recordset[0]));
} catch(error) { next(error); } });
app.post('/api/cases/:caseNumber/approve', requireConfigured, async (req,res,next) => { try {
  let cuc=req.user.RoleCode==='cuc',ccuc=req.user.RoleCode==='ccuc';
  const master=req.user.RoleCode==='master';
  if(master||!cuc&&!ccuc)return res.status(403).json({error:'Only the assigned CUC or authorized CCUC can approve this case.'});
  if(cuc&&req.body?.locationConfirmed!==true)return res.status(400).json({error:'Confirm the recorded geo-location and case details before verification.'});
  const p=await getPool();
  const transaction=new sql.Transaction(p);
  await transaction.begin();
  let row;
  try {
    const request=new sql.Request(transaction).input('caseNumber',sql.NVarChar,req.params.caseNumber);
    const found=await request.query('SELECT * FROM enforcement.Cases WITH (UPDLOCK,HOLDLOCK) WHERE CaseNumber=@caseNumber');
    row=found.recordset[0];
    if(master){cuc=[1,2].includes(row?.CurrentStage);ccuc=row?.CurrentStage===3;}
    const delegation=row?(await new sql.Request(transaction).input('id',sql.UniqueIdentifier,row.CaseId).input('u',sql.UniqueIdentifier,req.user.UserId).query('SELECT 1 AS allowed FROM enforcement.ChargeTransfers WHERE CaseId=@id AND ToUserId=@u AND StartsAt<=SYSUTCDATETIME() AND EndsAt>SYSUTCDATETIME()')).recordset.length:0;
    const assigned=row&&(String(row.AssignedCucId).toLowerCase()===String(req.user.UserId).toLowerCase()||delegation>0);

    let rejection;
    if(!row)rejection=[404,'Case not found.'];

    else if(row.WorkflowStep==='correction')rejection=[409,'The survey must be corrected and resubmitted.'];
    else if(row.IsArchived)rejection=[409,'Restore the archived case before recording workflow actions.'];
    else if(master&&!cuc&&!ccuc)rejection=[409,'Use administrator editing to change the workflow at this stage.'];
    else if(cuc&&req.body?.locationConfirmed!==true)rejection=[400,'Confirm the recorded geo-location and case details before verification.'];
    else if(cuc&&!master&&!assigned)rejection=[403,'Only the assigned CUC can verify this case.'];
    else if(row.LegalHold)rejection=[409,'Resolve the legal review hold before approving this case.'];
    else if(cuc&&(![1,2].includes(row.CurrentStage)||!['In progress','Awaiting approval','Overdue'].includes(row.Status)))rejection=[409,'This case is no longer awaiting CUC verification.'];
    else if(ccuc&&(row.CurrentStage!==3||row.Status!=='Awaiting approval'))rejection=[409,'CUC verification must be completed before CCUC approval.'];
    else if(row.Latitude==null||row.Longitude==null||!Number.isFinite(Number(row.Latitude))||!Number.isFinite(Number(row.Longitude))||Math.abs(Number(row.Latitude))>90||Math.abs(Number(row.Longitude))>180)rejection=[400,'A valid recorded geo-location is required before approval.'];
    if(rejection){await transaction.rollback();return res.status(rejection[0]).json({error:rejection[1]});}
    await new sql.Request(transaction).input('id',sql.UniqueIdentifier,row.CaseId).input('user',sql.UniqueIdentifier,req.user.UserId)
      .input('stage',sql.TinyInt,cuc?3:4).input('status',sql.NVarChar,cuc?'Awaiting approval':'In progress')
      .input('actionStage',sql.TinyInt,cuc?2:3).input('action',sql.NVarChar,cuc?'CUC verification and approval':'CCUC approval')
      .input('event',sql.NVarChar,cuc?'CucCaseApproved':'CcucCaseApproved')
      .input('notes',sql.NVarChar,cuc?'CUC confirmed site coordinates '+row.Latitude+', '+row.Longitude+' and reviewed the case details.':'CCUC reviewed the verified case and approved notice generation.')
      .query(`
        UPDATE enforcement.Cases SET CurrentStage=@stage,Status=@status,WorkflowStep=CASE WHEN @stage=3 THEN 'file-approval' ELSE 'notice-draft' END,StageStartedAt=SYSUTCDATETIME(),NextActionAt=DATEADD(day,COALESCE(TRY_CONVERT(INT,(SELECT JSON_VALUE(Value,CASE WHEN @stage=3 THEN '$.reviewDays' ELSE '$.noticeDays' END) FROM enforcement.Settings WHERE SettingKey='deadlines')),15),SYSUTCDATETIME()),EscalatedAt=NULL,ResponsibleUserId=CASE WHEN @stage=3 THEN NULL ELSE AssignedCucId END WHERE CaseId=@id;
        INSERT enforcement.CaseActions(CaseId,ActionType,Stage,Notes,PerformedByUserId) VALUES(@id,@action,@actionStage,@notes,@user);
        INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) VALUES(@user,'Case',@id,@event,@notes);
      `);
    await transaction.commit();
  } catch(error){try{await transaction.rollback();}catch{}throw error;}
  const result=await p.request().input('id',sql.UniqueIdentifier,row.CaseId).query(`
    SELECT c.*,surveyor.DisplayName AS Surveyor,cuc.DisplayName AS AssignedCuc,responsible.DisplayName AS ResponsibleOfficer
    FROM enforcement.Cases c LEFT JOIN enforcement.Users surveyor ON surveyor.UserId=c.AssignedSurveyorId
    LEFT JOIN enforcement.Users cuc ON cuc.UserId=c.AssignedCucId LEFT JOIN enforcement.Users responsible ON responsible.UserId=c.ResponsibleUserId
    WHERE c.CaseId=@id`);
  publishChange();res.json(toUiCase(result.recordset[0],req.user));
} catch(error) { next(error); } });
app.patch('/api/ui/cases/:caseNumber', requireConfigured, async (req,res,next) => { try {
  if (req.user.RoleCode === 'surveyor') return res.status(403).json({ error:'Surveyors can register cases but cannot record workflow actions.' });
  res.status(405).json({ error:'Use the dedicated workflow approval action for this case.' });
} catch(error) { next(error); } });
app.use((error,_req,res,_next) => {
  const detail = error?.originalError?.info?.message ?? error?.originalError?.message ?? error?.message ?? 'Unexpected server error.';
  console.error('Database/API error:', detail);
  if(error instanceof WorkflowError)return res.status(error.status).json({error:error.message});
  if(error.type==='entity.too.large')return res.status(413).json({error:'Upload exceeds the request size limit.'});
  res.status(500).json({ error: 'The request could not be completed. Check the input or contact the administrator.' });
});
const port = Number(process.argv.find(argument=>argument.startsWith('--port='))?.split('=')[1] || process.env.PORT || 3001);
if(hasDatabaseConfig){let restoringArchives=false;setInterval(async()=>{if(restoringArchives)return;restoringArchives=true;try{const p=await getPool();await restoreExpiredArchives(p,publishChange);await refreshEscalations(p);}catch(error){console.error('Maintenance check failed:',error.message);}finally{restoringArchives=false;}},60000).unref();}
const server = app.listen(port, () => console.log(`EnforceFlow API listening on port ${port} · database ${process.env.DB_SERVER}/${process.env.DB_DATABASE} · SQL login ${process.env.DB_USER}`));
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing API process or set PORT to another value in .env.`);
    process.exitCode = 1;
    return;
  }
  console.error('API failed to start:', error.message);
  process.exitCode = 1;
});
