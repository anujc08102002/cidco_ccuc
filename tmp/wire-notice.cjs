const fs=require('fs');
const p='server/enforcement-workflow.js';let s=fs.readFileSync(p,'utf8');
s=s.replace("import {hashPassword} from './passwords.js';",`import {hashPassword} from './passwords.js';
import {registerNoticeRoutes} from './notice-routes.js';
import {buildDocument,readTemplate,validateTemplate,caseRecipient,parseContent} from './notice-model.js';
import {signNotice} from './notice-signing.js';
import {pdfBytes} from './notice-pdf.js';`);
s=s.replace(/export function registerWorkflowRoutes\(app,([^\n]+)\{\r?\n/,match=>match+` registerNoticeRoutes(app,{getPool,loadCase,ownedDocument,transaction,audit,wrap});\n`);
s=s.replace("fail(!['Notice','Order'].includes(b.type)||!b.name?.trim()||!b.body?.trim()||!b.approvalReference?.trim(),'Name, type, approved template text and departmental approval reference are required.');",`fail(!['Notice','Order'].includes(b.type)||!b.name?.trim()||!b.body?.trim()||!b.approvalReference?.trim(),'Name, type, approved template text and departmental approval reference are required.');
  validateTemplate(readTemplate(b.body));`);
s=s.replace("rowVersion:version(c)};","rowVersion:version(c),RecipientDefaults:caseRecipient(c)};");
s=s.replace("d.SupersedesId,d.ChangeReason,d.SignedAt,d.SignatureMethod,signer.DisplayName AS SignedByName", "d.SupersedesId,d.ChangeReason,d.SignedAt,d.SignatureMethod,d.TemplateId,CASE WHEN d.FileContent IS NOT NULL THEN 1 ELSE 0 END AS HasPdf,COALESCE((SELECT TOP(1) JSON_VALUE(a.Detail,'$.signerName') FROM enforcement.AuditLog a WHERE a.EntityId=d.CaseId AND a.EventType='DocumentDigitallySigned' AND ISJSON(a.Detail)=1 AND JSON_VALUE(a.Detail,'$.documentId')=CONVERT(nvarchar(36),d.DocumentId) ORDER BY a.AuditId DESC),signer.DisplayName) AS SignedByName");
s=s.replace("${table==='Documents'?'d':'CaseId'}.CaseId=@id","${table==='Documents'?'d.CaseId':'CaseId'}=@id");
// Store recipient values at generation time. Existing template text remains supported.
s=s.replace("fail(typeof b.content!=='string'||!b.content.trim()||b.content.length>100000||!b.reason?.trim(),'Approved template content and revision reason are required.');",`fail(!b.reason?.trim(),'Draft or revision reason is required.');`);
const templateLine="fail(!template||template.DocumentType!==b.type,'Select a registered departmental template of the correct type.');";
s=s.replace(templateLine,templateLine+`
   if(b.body!==undefined)b.content=JSON.stringify(buildDocument(c,b,template));
   else fail(typeof b.content!=='string'||!b.content.trim()||b.content.length>100000,'Document content is required.');
   // Render before saving so unprintable or overflowing layouts cannot enter review.
   await pdfBytes(b.content,{reference:b.reference});`);
s=s.replace("const signature=op==='approve'?crypto.createHash('sha256').update([d.DocumentId,d.DocumentType,d.ReferenceNumber,d.VersionNumber,d.TemplateId,d.Content].join('\\n'),'utf8').digest():null;",`let signed=null;
    if(op==='approve'){
     fail(b.previewReviewed!==true,'Open and verify the document preview before signing.',409);
     const cert=(await request(tx).input('key',sql.NVarChar,'signing-cert:'+String(req.user.UserId).toLowerCase()).query('SELECT Value FROM enforcement.Settings WHERE SettingKey=@key')).recordset[0];
     signed=await signNotice(d,req.user,b,cert?JSON.parse(cert.Value).fingerprint:null);
    }
    const signature=signed?.hash??null;`);
s=s.replace(".input('state',sql.NVarChar,({submit:",".input('pdf',sql.VarBinary(sql.MAX),signed?.pdf??null).input('state',sql.NVarChar,({submit:");
s=s.replace("UPDATE enforcement.Documents SET ApprovalState=@state,ApprovedBy=", "UPDATE enforcement.Documents SET FileContent=CASE WHEN @op='approve' THEN @pdf ELSE FileContent END,MimeType=CASE WHEN @op='approve' THEN 'application/pdf' ELSE MimeType END,FileName=CASE WHEN @op='approve' THEN 'signed-document.pdf' ELSE FileName END,ApprovalState=@state,ApprovedBy=");
s=s.replaceAll("'In-application CCUC approval signature' ELSE SignatureMethod", "'X.509 certificate PDF signature' ELSE SignatureMethod");
s=s.replace("if(op==='approve')await audit(tx,req.user,c.CaseId,'DocumentDigitallySigned',{documentId:d.DocumentId,type,version:d.VersionNumber,fingerprint:signature.toString('hex'),method:'In-application CCUC approval signature'});", "if(op==='approve')await audit(tx,req.user,c.CaseId,'DocumentDigitallySigned',{documentId:d.DocumentId,type,version:d.VersionNumber,fingerprint:signature.toString('hex'),certificateFingerprint:signed.certificate.fingerprint,signerName:signed.name,method:'X.509 certificate PDF signature'});");
s=s.replace("previousDeadline:c.NextActionAt,...b", "previousDeadline:c.NextActionAt,action:b.action,documentId:b.documentId,reason:b.reason,previewReviewed:b.previewReviewed");
// Published access returns the exact signed PDF; never regenerate after signing.
s=s.replace("SELECT d.Content,d.ReferenceNumber FROM enforcement.Documents", "SELECT d.Content,d.ReferenceNumber,d.FileContent,d.MimeType,d.CreatedAt FROM enforcement.Documents");
s=s.replace("res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).type('text/plain').send(r.recordset[0].Content);", "const d=r.recordset[0];res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Disposition':'inline; filename=notice.pdf'}).type('application/pdf').send(d.FileContent&&d.MimeType==='application/pdf'?d.FileContent:await pdfBytes(d.Content,{reference:d.ReferenceNumber,createdAt:d.CreatedAt}));");
fs.writeFileSync(p,s);
let index=fs.readFileSync('server/index.js','utf8').replace("limit: '8mb'","limit: '32mb'");fs.writeFileSync('server/index.js',index);
