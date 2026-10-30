import sql from 'mssql';
import {validateSurveyFields} from './survey-fields.js';

export const requireMaster=(req,res,next)=>req.user?.RoleCode==='master'?next():res.status(403).json({error:'Only the Master Administrator can perform this action.'});
const statuses=['Overdue','In progress','Awaiting approval','Closed','Review hold'];
const guid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const joinedCase=`SELECT c.*,surveyor.DisplayName AS Surveyor,cuc.DisplayName AS AssignedCuc,responsible.DisplayName AS ResponsibleOfficer
 FROM enforcement.Cases c LEFT JOIN enforcement.Users surveyor ON surveyor.UserId=c.AssignedSurveyorId
 LEFT JOIN enforcement.Users cuc ON cuc.UserId=c.AssignedCucId LEFT JOIN enforcement.Users responsible ON responsible.UserId=c.ResponsibleUserId`;
export async function restoreExpiredArchives(pool,publishChange){
 const result=await pool.request().query(`
  SET XACT_ABORT ON; BEGIN TRANSACTION;
  DECLARE @restored TABLE(CaseId UNIQUEIDENTIFIER,CaseNumber NVARCHAR(80));
  UPDATE enforcement.Cases SET IsArchived=0,ArchiveUntil=NULL,ArchivedAt=NULL,ArchiveReason=NULL,ArchivedByUserId=NULL
  OUTPUT inserted.CaseId,inserted.CaseNumber INTO @restored
  WHERE IsArchived=1 AND ArchiveUntil IS NOT NULL AND ArchiveUntil<=SYSUTCDATETIME();
  INSERT enforcement.AuditLog(EntityType,EntityId,EventType,Detail)
  SELECT 'Case',CaseId,'CaseArchiveExpired',CaseNumber FROM @restored;
  COMMIT; SELECT COUNT(*) AS Restored FROM @restored;`);
 if(result.recordset[0].Restored>0)publishChange();
}
export function csvCell(value){
 let text=value==null?'':value instanceof Date?value.toISOString():Buffer.isBuffer(value)?value.toString('hex'):String(value);
 if(/^[\s\uFEFF]*[=+@-]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function registerAdminCaseRoutes(app,{getPool,publishChange,toUiCase}){
 const execute=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){next(error);}};
 const load=async(pool,key,user)=>{
  const result=await pool.request().input('key',sql.NVarChar,key).query(joinedCase+' WHERE c.CaseNumber=@key');
  return result.recordset[0]?toUiCase(result.recordset[0],user):null;
 };
 app.delete('/api/admin/resources/:kind/:id',requireMaster,execute(async(req,res)=>{
  const resource={templates:{table:'DocumentTemplates',id:'TemplateId',name:'Name',dependent:'Documents',foreignKey:'TemplateId',entity:'Template'},drives:{table:'DrivePlans',id:'DriveId',name:'SerialNumber',dependent:'DemolitionDrives',foreignKey:'DriveId',entity:'Drive'}}[req.params.kind];
  if(!resource||!guid.test(req.params.id))return res.status(400).json({error:'Choose a valid template or drive plan.'});
  const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try{
   const row=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,req.params.id).query(`SELECT * FROM enforcement.${resource.table} WITH (UPDLOCK,HOLDLOCK) WHERE ${resource.id}=@id`)).recordset[0];
   if(!row){await tx.rollback();return res.status(404).json({error:'Record not found.'});}
   if(typeof req.body?.confirmation!=='string'||req.body.confirmation.trim().toLowerCase()!=='confirm'){await tx.rollback();return res.status(400).json({error:'Type confirm to confirm deletion.'});}
   const used=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,req.params.id).query(`SELECT TOP(1) 1 AS used FROM enforcement.${resource.dependent} WHERE ${resource.foreignKey}=@id`)).recordset[0];
   if(used){await tx.rollback();return res.status(409).json({error:'This record is linked to enforcement cases. Remove those cases first, or retain the shared record to preserve their references.'});}
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,req.params.id).input('actor',sql.UniqueIdentifier,req.user.UserId).input('entity',sql.NVarChar,resource.entity).input('snapshot',sql.NVarChar(sql.MAX),JSON.stringify(row)).query(`INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) VALUES(@actor,@entity,@id,'AdminResourceDeleted',@snapshot); DELETE enforcement.${resource.table} WHERE ${resource.id}=@id`);
   await tx.commit();
  }catch(error){try{await tx.rollback();}catch{}throw error;}
  publishChange();res.status(204).end();
 }));
 app.patch('/api/admin/cases/:caseNumber',requireMaster,execute(async(req,res)=>{
  const b=req.body??{};
  const surveyError=validateSurveyFields(b);if(surveyError)return res.status(400).json({error:surveyError});
  for(const [field,max] of [['property',250],['sector',80],['node',80],['owner',200]])if(typeof b[field]!=='string'||!b[field].trim()||b[field].length>max)return res.status(400).json({error:`${field} is required (maximum ${max} characters).`});
  if(!Number.isInteger(b.currentStage)||b.currentStage<1||b.currentStage>8||!statuses.includes(b.status)||typeof b.legal!=='boolean')return res.status(400).json({error:'Choose a valid workflow stage, status and legal-hold setting.'});
  const lat=b.latitude==null||b.latitude===''?null:Number(b.latitude),lng=b.longitude==null||b.longitude===''?null:Number(b.longitude);
  if((lat==null)!==(lng==null)||(lat!=null&&(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)))return res.status(400).json({error:'Enter both valid latitude and longitude, or leave both empty.'});
  const deadline=b.nextActionAt?new Date(b.nextActionAt):null;
  if(deadline&&Number.isNaN(deadline.getTime()))return res.status(400).json({error:'Invalid next-action date.'});
  for(const field of ['surveyorId','cucId','responsibleUserId'])if(b[field]&&!guid.test(b[field]))return res.status(400).json({error:'Invalid officer assignment.'});
  for(const [field,max] of [['survey',80],['notice',80],['siteAddress',500]])if(b[field]!=null&&(typeof b[field]!=='string'||b[field].length>max))return res.status(400).json({error:`Invalid ${field}.`});
  const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin();
  try{
   const found=await new sql.Request(tx).input('key',sql.NVarChar,req.params.caseNumber).query('SELECT * FROM enforcement.Cases WITH (UPDLOCK,HOLDLOCK) WHERE CaseNumber=@key');
   const before=found.recordset[0];if(!before){await tx.rollback();return res.status(404).json({error:'Case not found.'});}
   if((b.nextActionAt?new Date(b.nextActionAt).getTime():null)!==(before.NextActionAt?new Date(before.NextActionAt).getTime():null)){await tx.rollback();return res.status(409).json({error:'Use the case deadline action and record a change reason.'});}
   if(b.currentStage!==before.CurrentStage||b.status!==before.Status||b.legal!==Boolean(before.LegalHold)||b.notice!==(before.NoticeReference||'Draft')||String(b.cucId??'').toLowerCase()!==String(before.AssignedCucId??'').toLowerCase()||String(b.responsibleUserId??'').toLowerCase()!==String(before.ResponsibleUserId??'').toLowerCase()){
    await tx.rollback();return res.status(409).json({error:'Use authorized workflow, legal review or routing actions to change stage, status, notice, legal restrictions or CUC responsibility.'});
   }
   if(b.rowVersion!==Buffer.from(before.RowVersion).toString('hex')){await tx.rollback();return res.status(409).json({error:'This case changed while you were editing. Reload the case and try again.'});}
   for(const [field,role] of [['surveyorId','surveyor'],['cucId','cuc'],['responsibleUserId',null]]){
    if(!b[field])continue;
    const assigned=await new sql.Request(tx).input('id',sql.UniqueIdentifier,b[field]).query('SELECT RoleCode,IsActive FROM enforcement.Users WHERE UserId=@id');
    if(!assigned.recordset[0]?.IsActive||(role&&assigned.recordset[0].RoleCode!==role)){await tx.rollback();return res.status(400).json({error:`Choose an active ${role??'responsible officer'} for ${field}.`});}
   }
   await new sql.Request(tx).input('key',sql.NVarChar,req.params.caseNumber).input('property',sql.NVarChar,b.property.trim()).input('sector',sql.NVarChar,b.sector.trim()).input('node',sql.NVarChar,b.node.trim()).input('owner',sql.NVarChar,b.owner.trim()).input('survey',sql.NVarChar,b.survey??null).input('notice',sql.NVarChar,b.notice??null).input('stage',sql.TinyInt,b.currentStage).input('status',sql.NVarChar,b.status).input('legal',sql.Bit,b.legal).input('lat',sql.Decimal(10,7),lat).input('lng',sql.Decimal(10,7),lng).input('address',sql.NVarChar,b.siteAddress??null).input('surveyor',sql.UniqueIdentifier,b.surveyorId||null).input('cuc',sql.UniqueIdentifier,b.cucId||null).input('responsible',sql.UniqueIdentifier,b.responsibleUserId||null).input('deadline',sql.DateTime2,deadline).input('user',sql.UniqueIdentifier,req.user.UserId).input('before',sql.NVarChar(sql.MAX),JSON.stringify(before)).input('priority',sql.NVarChar,b.priority===undefined?before.Priority:b.priority).input('violation',sql.NVarChar(sql.MAX),b.violationDescription===undefined?before.ViolationDescription:b.violationDescription).input('sections',sql.NVarChar,b.applicableSections===undefined?before.ApplicableSections:JSON.stringify(b.applicableSections??[])).query(`
    UPDATE enforcement.Cases SET PropertyReference=@property,Sector=@sector,Node=@node,OwnerName=@owner,SurveyReference=@survey,NoticeReference=@notice,CurrentStage=@stage,Status=@status,LegalHold=@legal,Latitude=@lat,Longitude=@lng,SiteAddress=@address,AssignedSurveyorId=@surveyor,AssignedCucId=@cuc,ResponsibleUserId=@responsible,NextActionAt=@deadline,Priority=@priority,ViolationDescription=@violation,ApplicableSections=@sections,
    LocationSource=CASE WHEN ISNULL(Latitude,999)<>ISNULL(@lat,999) OR ISNULL(Longitude,999)<>ISNULL(@lng,999) THEN 'Administrator edit' ELSE LocationSource END,
    LocationCapturedAt=CASE WHEN ISNULL(Latitude,999)<>ISNULL(@lat,999) OR ISNULL(Longitude,999)<>ISNULL(@lng,999) THEN SYSUTCDATETIME() ELSE LocationCapturedAt END,
    LocationAccuracyMetres=CASE WHEN ISNULL(Latitude,999)<>ISNULL(@lat,999) OR ISNULL(Longitude,999)<>ISNULL(@lng,999) THEN NULL ELSE LocationAccuracyMetres END WHERE CaseNumber=@key;
    INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) SELECT @user,'Case',CaseId,'AdminCaseEdited',@before FROM enforcement.Cases WHERE CaseNumber=@key;
    INSERT enforcement.CaseActions(CaseId,ActionType,Stage,Notes,PerformedByUserId) SELECT CaseId,'Administrator edit',CurrentStage,'Case details, assignment or workflow updated by administrator.',@user FROM enforcement.Cases WHERE CaseNumber=@key;`);
   await tx.commit();
  }catch(error){try{await tx.rollback();}catch{}throw error;}
  publishChange();res.json(await load(pool,req.params.caseNumber,req.user));
 }));
 app.post('/api/admin/cases/:caseNumber/archive',requireMaster,execute(async(req,res)=>{
  const {days,reason=''}=req.body??{};
  if(days!==null&&(!Number.isInteger(days)||days<1||days>36500))return res.status(400).json({error:'Choose 1 to 36500 days, or indefinite archive.'});
  if(typeof reason!=='string'||reason.length>1000)return res.status(400).json({error:'Archive reason must be at most 1000 characters.'});
  const pool=await getPool();
  const result=await pool.request().input('key',sql.NVarChar,req.params.caseNumber).input('days',sql.Int,days).input('reason',sql.NVarChar,reason).input('user',sql.UniqueIdentifier,req.user.UserId).query(`
   SET XACT_ABORT ON; BEGIN TRANSACTION;
   DECLARE @changed TABLE(CaseId UNIQUEIDENTIFIER);
   UPDATE enforcement.Cases SET IsArchived=1,ArchivedAt=SYSUTCDATETIME(),ArchiveUntil=CASE WHEN @days IS NULL THEN NULL ELSE DATEADD(day,@days,SYSUTCDATETIME()) END,ArchiveReason=@reason,ArchivedByUserId=@user
   OUTPUT inserted.CaseId INTO @changed WHERE CaseNumber=@key;
   INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) SELECT @user,'Case',CaseId,'CaseArchived',CONCAT(COALESCE(CONVERT(NVARCHAR(20),@days),'Indefinite'),' days; ',@reason) FROM @changed;
   COMMIT; SELECT COUNT(*) AS Changed FROM @changed;`);
  if(!result.recordset[0].Changed)return res.status(404).json({error:'Case not found.'});
  publishChange();res.json(await load(pool,req.params.caseNumber,req.user));
 }));
 app.post('/api/admin/cases/:caseNumber/restore',requireMaster,execute(async(req,res)=>{
  const pool=await getPool();const result=await pool.request().input('key',sql.NVarChar,req.params.caseNumber).input('user',sql.UniqueIdentifier,req.user.UserId).query(`
   SET XACT_ABORT ON; BEGIN TRANSACTION;
   DECLARE @changed TABLE(CaseId UNIQUEIDENTIFIER);
   UPDATE enforcement.Cases SET IsArchived=0,ArchivedAt=NULL,ArchiveUntil=NULL,ArchiveReason=NULL,ArchivedByUserId=NULL OUTPUT inserted.CaseId INTO @changed WHERE CaseNumber=@key AND IsArchived=1;
   INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) SELECT @user,'Case',CaseId,'CaseRestored',@key FROM @changed;
   COMMIT; SELECT COUNT(*) AS Changed FROM @changed;`);
  if(!result.recordset[0].Changed)return res.status(409).json({error:'Case not found or it is already active.'});
  publishChange();res.json(await load(pool,req.params.caseNumber,req.user));
 }));
 app.delete('/api/cases/:caseNumber',requireMaster,execute(async(req,res)=>{
  if(typeof req.body?.confirmation!=='string'||req.body.confirmation.trim().toLowerCase()!=='confirm')return res.status(400).json({error:'Type confirm to confirm permanent case deletion.'});
  const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin();
  try{
   const found=await new sql.Request(tx).input('key',sql.NVarChar,req.params.caseNumber).query('SELECT * FROM enforcement.Cases WITH (UPDLOCK,HOLDLOCK) WHERE CaseNumber=@key');
   const row=found.recordset[0];if(!row){await tx.rollback();return res.status(404).json({error:'Case not found.'});}
   const snapshot={case:row};
   for(const table of ['CaseActions','Surveys','Documents','Hearings','LegalUpdates','DemolitionDrives','CaseReferences','ChargeTransfers']){
    snapshot[table]=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.CaseId).query(`SELECT * FROM enforcement.${table} WHERE CaseId=@id`)).recordset;
   }
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.CaseId).input('user',sql.UniqueIdentifier,req.user.UserId).input('snapshot',sql.NVarChar(sql.MAX),JSON.stringify(snapshot)).query(`INSERT enforcement.AuditLog(UserId,EntityType,EntityId,EventType,Detail) VALUES(@user,'Case',@id,'AdminCaseDeleted',@snapshot)`);
   // Remove dependent hearing/reference links before documents; retain shared drive plans and templates.
   for(const table of ['CaseReferences','ChargeTransfers','Hearings','CaseActions','Surveys','LegalUpdates','DemolitionDrives'])await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.CaseId).query(`DELETE FROM enforcement.${table} WHERE CaseId=@id`);
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.CaseId).query('UPDATE enforcement.Documents SET SupersedesId=NULL WHERE CaseId=@id; DELETE FROM enforcement.Documents WHERE CaseId=@id');
   await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.CaseId).query('DELETE FROM enforcement.Cases WHERE CaseId=@id');
   await tx.commit();
  }catch(error){try{await tx.rollback();}catch{}throw error;}
  publishChange();res.status(204).end();
 }));
 app.get('/api/admin/cases/backup',requireMaster,execute(async(req,res)=>{
  const format=req.query.format??'json';if(!['json','csv'].includes(format))return res.status(400).json({error:'Choose JSON or CSV format.'});
  const pool=await getPool(),tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const backup={formatVersion:1,exportedAt:new Date().toISOString(),includesArchived:true,tables:{}};
  try{
   for(const table of ['Cases','CaseActions','Surveys','Documents','Hearings','LegalUpdates','DemolitionDrives','AuditLog','OperationalRecords','CaseReferences','DrivePlans','ChargeTransfers','ReportingLinks','Settings','DocumentTemplates'])backup.tables[table]=(await new sql.Request(tx).query(`SELECT * FROM enforcement.${table}`)).recordset;
   backup.tables.Users=(await new sql.Request(tx).query('SELECT UserId,Username,DisplayName,RoleCode,IsActive,IsDeleted,DeletedAt,CreatedAt,UpdatedAt FROM enforcement.Users')).recordset;
   await tx.commit();
  }catch(error){try{await tx.rollback();}catch{}throw error;}
  const filename='enforceflow-cases-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+format;
  res.set({'Cache-Control':'no-store','Content-Disposition':`attachment; filename="${filename}"`});
  if(format==='json')return res.type('application/json').send(JSON.stringify(backup,null,2));
  const columns=['CaseId','CaseNumber','PropertyReference','Sector','Node','OwnerName','Priority','ViolationDescription','ApplicableSections','CurrentStage','Status','LegalHold','SurveyReference','NoticeReference','AssignedSurveyorId','AssignedCucId','ResponsibleUserId','Latitude','Longitude','SiteAddress','LocationSource','LocationAccuracyMetres','LocationCapturedAt','NextActionAt','IsArchived','ArchivedAt','ArchiveUntil','ArchiveReason','CreatedAt','UpdatedAt'];
  res.type('text/csv').send('\uFEFF'+[columns.map(csvCell).join(','),...backup.tables.Cases.map(row=>columns.map(column=>csvCell(row[column])).join(','))].join('\r\n'));
 }));
}
