import sql from 'mssql';
import {fail,validateFile} from './workflow-policy.js';
import {extractSignaturePages,extractSignatureInk,validateStoredSignature} from './signature-images.js';
const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=id=>'signature-image:'+String(id).toLowerCase();
const ownedAsset=(value,id)=>{const a=validateStoredSignature(typeof value==='string'?JSON.parse(value):value);fail(String(a.userId).toLowerCase()!==String(id).toLowerCase(),'The stored signature is not linked to this user account.',409);return a;};
export function requireSignatureAdmin(user){fail(user?.RoleCode!=='master','Only the administrator can upload, replace, crop or remove signature images.',403);}
export function registerSignatureImageRoutes(app,{getPool,transaction,audit,wrap,publishChange=()=>{}}){
 const asset=async(tx,id,lock=false)=>(await new sql.Request(tx).input('key',sql.NVarChar,key(id)).query(`SELECT Value FROM enforcement.Settings ${lock?'WITH (UPDLOCK,HOLDLOCK)':''} WHERE SettingKey=@key`)).recordset[0];
 const upload=b=>validateFile({category:'evidence',fileName:'signature-page.png',base64:b.base64}).bytes;
 app.get('/api/workflow/signature-images',wrap(async(req,res)=>{
  requireSignatureAdmin(req.user);const p=await getPool();const rows=(await p.request().query("SELECT u.UserId,u.Username,u.DisplayName,u.RoleCode,u.IsActive,s.Value FROM enforcement.Users u LEFT JOIN enforcement.Settings s ON LOWER(s.SettingKey)=CONCAT('signature-image:',LOWER(CONVERT(nvarchar(36),u.UserId))) WHERE u.IsDeleted=0 ORDER BY u.DisplayName")).recordset;
  res.set('Cache-Control','no-store').json(rows.map(r=>{const a=r.Value?ownedAsset(r.Value,r.UserId):null;return {...r,Value:undefined,signature:a?{userId:a.userId,hash:a.hash,width:a.width,height:a.height,uploadedAt:a.uploadedAt}:null};}));
 }));
 app.get('/api/workflow/signature-images/:id',wrap(async(req,res)=>{
  requireSignatureAdmin(req.user);fail(!guid.test(req.params.id),'Select a valid user.');const row=await asset(await getPool(),req.params.id);res.set('Cache-Control','no-store').json(row?ownedAsset(row.Value,req.params.id):null);
 }));
 app.post('/api/workflow/signature-images/extract',wrap(async(req,res)=>{
  requireSignatureAdmin(req.user);const f=validateFile({...req.body,category:'evidence'});res.json({pages:await extractSignaturePages(f.bytes,f.mime)});
 }));
 app.post('/api/workflow/signature-images/preview',wrap(async(req,res)=>{
  requireSignatureAdmin(req.user);res.json(await extractSignatureInk(upload(req.body),req.body.crop,{cleanup:req.body.cleanup??35}));
 }));
 app.post('/api/workflow/signature-images',wrap(async(req,res)=>{
  requireSignatureAdmin(req.user);const b=req.body;fail(!guid.test(b.userId),'Select a valid user.');fail(b.confirmed!==true,'Confirm the cropped signature matches the original handwriting.');fail(!b.reason?.trim()||b.reason.length>1000,'Record the registration or replacement reason.');
  const result=await extractSignatureInk(upload(b),b.crop,{cleanup:b.cleanup??35});fail(b.previewHash&&b.previewHash!==result.hash,'The extraction changed. Preview and confirm the cleaned signature again.',409);result.userId=String(b.userId).toLowerCase();result.uploadedBy=req.user.UserId;result.uploadedAt=new Date().toISOString();result.sourceName=String(b.sourceName||'Signature scan').slice(0,260);
  const p=await getPool();const persisted=await transaction(p,async tx=>{
   const user=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,b.userId).query('SELECT UserId FROM enforcement.Users WHERE UserId=@id AND IsActive=1 AND IsDeleted=0')).recordset[0];fail(!user,'Select an active user.');
   const previous=await asset(tx,b.userId,true),old=previous?JSON.parse(previous.Value):null;fail((b.expectedHash??null)!==(old?.hash??null),'This signature profile changed. Reload it before saving.',409);
   await new sql.Request(tx).input('key',sql.NVarChar,key(b.userId)).input('value',sql.NVarChar(sql.MAX),JSON.stringify(result)).input('actor',sql.UniqueIdentifier,req.user.UserId).query('UPDATE enforcement.Settings SET Value=@value,UpdatedBy=@actor,UpdatedAt=SYSUTCDATETIME() WHERE SettingKey=@key; IF @@ROWCOUNT=0 INSERT enforcement.Settings(SettingKey,Value,UpdatedBy) VALUES(@key,@value,@actor);');
   const stored=await asset(tx,b.userId,true);fail(!stored,'Signature storage could not be verified. Please retry.',500);const verified=ownedAsset(stored.Value,b.userId);fail(verified.hash!==result.hash,'Signature storage did not retain the uploaded image. Please retry.',500);
   await audit(tx,req.user,b.userId,'HandwrittenSignatureRegistered',{hash:result.hash,previousHash:old?.hash??null,sourceHash:result.sourceHash,crop:result.crop,reason:b.reason});
   return verified;
  });publishChange();res.json({saved:true,userId:persisted.userId,signature:persisted});
 }));
 app.post('/api/workflow/signature-images/:id/remove',wrap(async(req,res)=>{
  requireSignatureAdmin(req.user);fail(!guid.test(req.params.id)||!req.body.reason?.trim(),'Select a user and record the removal reason.');const p=await getPool();await transaction(p,async tx=>{const previous=await asset(tx,req.params.id,true);fail(!previous,'No signature is registered.',404);const old=JSON.parse(previous.Value);fail(req.body.expectedHash!==old.hash,'The signature profile changed. Reload before removing.',409);await new sql.Request(tx).input('key',sql.NVarChar,key(req.params.id)).query('DELETE enforcement.Settings WHERE SettingKey=@key');await audit(tx,req.user,req.params.id,'HandwrittenSignatureRemoved',{hash:old.hash,reason:req.body.reason});});publishChange();res.json({saved:true});
 }));
 app.get('/api/workflow/my-signature',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='ccuc','CCUC account required.',403);res.set('Cache-Control','no-store');const row=await asset(await getPool(),req.user.UserId);if(!row)return res.json({ready:false,userId:req.user.UserId,name:req.user.DisplayName});const a=ownedAsset(row.Value,req.user.UserId);res.json({ready:true,userId:a.userId,name:req.user.DisplayName,hash:a.hash,uploadedAt:a.uploadedAt});
 }));
}
