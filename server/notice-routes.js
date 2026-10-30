import sql from 'mssql';
import {fail,canOperate,validateFile} from './workflow-policy.js';
import {buildDocument,caseRecipient,readTemplate,validateTemplate,fieldNames,resolveTemplateLayout} from './notice-model.js';
import {pdfBytes} from './notice-pdf.js';
import {extractTemplate,importRecipients,recipientWorkbook} from './notice-import.js';
import {noticeContext,resolveNoticeAuthority,storedNoticePreview} from './notice-context.js';
import {registerSignatureImageRoutes} from './signature-image-routes.js';

export function registerNoticeRoutes(app,{getPool,loadCase,ownedDocument,transaction,audit,wrap,publishChange}){
 registerSignatureImageRoutes(app,{getPool,transaction,audit,wrap,publishChange});
 const sendPdf=(res,pdf,name)=>res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${String(name).replace(/[^a-z0-9_.-]/gi,'_')}.pdf"`,'Cache-Control':'no-store'}).send(pdf);
 const file=b=>{fail(typeof b.base64!=='string'||b.base64.length>7100000,'Upload must be smaller than 5 MB.');return Buffer.from(b.base64,'base64');};
 app.get('/api/workflow/notice-starter',wrap(async(_req,res)=>{const {defaultNoticeBody}=await import('./notice-model.js');res.json({body:defaultNoticeBody});}));
 app.post('/api/workflow/templates/extract',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required.',403);
  const f=validateFile({...req.body,category:'evidence'});
  const template=await extractTemplate(f.bytes,f.mime);res.json({template,warnings:['Review recognized text and map variable regions to case fields before registration. Original artwork and positions are retained. OCR currently recognizes English.']});
 }));
 app.post('/api/workflow/templates/preview',wrap(async(req,res)=>{
  fail(req.user.RoleCode!=='master','Administrator required.',403);const t=validateTemplate(req.body.template);
  const fields=Object.fromEntries(fieldNames.map(k=>[k,`{{${k}}}`]));
  sendPdf(res,await pdfBytes({format:'cidco-document-v2',reference:'TEMPLATE PREVIEW',createdAt:new Date().toISOString(),...resolveTemplateLayout(t),authority:{name:'CCUC authority name'},entries:[{body:t.body,fields}]}),'template-preview');
 }));
 app.get('/api/workflow/recipients/example',wrap(async(req,res)=>{fail(!['master','cuc'].includes(req.user.RoleCode),'CUC or administrator required.',403);res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="notice-recipients.xlsx"'}).send(await recipientWorkbook());}));
 app.post('/api/workflow/cases/:key/recipients/import',wrap(async(req,res)=>{
  const p=await getPool();const c=await transaction(p,tx=>loadCase(tx,req.params.key,req.user));fail(!canOperate(req.user,c),'Assigned CUC required.',403);
  const result=await importRecipients(file(req.body),req.body.fileName);res.json({...result,caseDefaults:caseRecipient(c)});
 }));
 app.post('/api/workflow/cases/:key/documents/preview',wrap(async(req,res)=>{
  const p=await getPool();const c=await transaction(p,async tx=>{const c=await loadCase(tx,req.params.key,req.user);fail(!canOperate(req.user,c),'Assigned CUC required.',403);c.NoticeAuthority=await resolveNoticeAuthority(tx,c,req.body.authorityId);return c;});
  const template=(await p.request().input('id',sql.UniqueIdentifier,req.body.templateId).query('SELECT * FROM enforcement.DocumentTemplates WHERE TemplateId=@id')).recordset[0];
  fail(!template||template.DocumentType!==req.body.type,'Select a template for this document type.');
  const content=buildDocument(c,req.body,template);res.set('X-Notice-Template-Id',String(template.TemplateId));sendPdf(res,await pdfBytes(content),req.body.reference||'draft');
 }));
 app.get('/api/workflow/cases/:key/documents/:id/pdf',wrap(async(req,res)=>{
  const p=await getPool();const d=await transaction(p,async tx=>{const c=await loadCase(tx,req.params.key,req.user);const d=await ownedDocument(tx,c,req.params.id);if(!d.SignedAt)d.PreviewContent=await storedNoticePreview(tx,c,d);return d;});
  fail(!['Notice','Order'].includes(d.DocumentType),'Select a notice or order.');
  sendPdf(res,d.FileContent&&d.MimeType==='application/pdf'?d.FileContent:await pdfBytes(d.PreviewContent||d.Content,{reference:d.ReferenceNumber,createdAt:d.CreatedAt}),d.ReferenceNumber);
 }));
 app.get('/api/workflow/cases/:key/notice-context',wrap(async(req,res)=>{
  const p=await getPool();res.json(await transaction(p,async tx=>{const c=await loadCase(tx,req.params.key,req.user);return {...await noticeContext(tx,c),recipientDefaults:caseRecipient(c)};}));
 }));
}
