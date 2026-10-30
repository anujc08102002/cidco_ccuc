import sql from 'mssql';
import {fail} from './workflow-policy.js';
import {buildDocument,parseContent,readTemplate} from './notice-model.js';
export async function noticeContext(tx,c){
 const users=(await new sql.Request(tx).query("SELECT UserId AS id,DisplayName AS name FROM enforcement.Users WHERE RoleCode='ccuc' AND IsActive=1 AND IsDeleted=0 ORDER BY DisplayName")).recordset.map(u=>({...u,title:'Authorised Officer - CCUC Department, CIDCO'}));
 const previous=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,c.CaseId).query("SELECT TOP(1) a.UserId FROM enforcement.AuditLog a JOIN enforcement.Users u ON u.UserId=a.UserId WHERE a.EntityId=@id AND a.EventType='CcucCaseApproved' AND u.IsActive=1 AND u.IsDeleted=0 ORDER BY a.AuditId DESC")).recordset[0];
 const preferred=users.find(u=>String(u.id).toLowerCase()===String(previous?.UserId).toLowerCase())??(users.length===1?users[0]:null);
 return {authorities:users,defaultAuthorityId:preferred?.id??'',defaultAuthority:preferred};
}
export async function resolveNoticeAuthority(tx,c,id){
 const context=await noticeContext(tx,c);const authority=id?context.authorities.find(u=>String(u.id).toLowerCase()===String(id).toLowerCase()):context.defaultAuthority;
 fail(!authority,'Select the CCUC authority who will verify and sign this notice.');return authority;
}
export async function storedNoticePreview(tx,c,d){
 const parsed=parseContent(d.Content);if(parsed?.format==='cidco-document-v2'&&parsed.authority?.name)return parsed;
 const ctx=await noticeContext(tx,c),authority=ctx.authorities.find(u=>String(u.id).toLowerCase()===String(parsed?.authority?.id).toLowerCase())??ctx.defaultAuthority;
 const template=d.TemplateId?(await new sql.Request(tx).input('id',sql.UniqueIdentifier,d.TemplateId).query('SELECT TemplateId,Body FROM enforcement.DocumentTemplates WHERE TemplateId=@id')).recordset[0]:null;
 const registered=readTemplate(template?.Body||d.Content);
 return buildDocument({...c,NoticeAuthority:authority},{body:parsed?.templateBody||d.Content,recipients:parsed?.recipients||[{}],responseDays:parsed?.responseDays??registered.responseDays,reference:d.ReferenceNumber},{TemplateId:d.TemplateId,Body:JSON.stringify({...registered,pages:parsed?.pages||registered.pages})},new Date(d.CreatedAt),{allowIncomplete:true});
}
