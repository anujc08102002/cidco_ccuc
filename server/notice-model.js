import {fail} from './workflow-policy.js';
import {signatureRegionPages} from '../shared/notice-layout.js';
import {createHash} from 'node:crypto';
export const templateRevision=t=>createHash('sha256').update(JSON.stringify([t.Name,t.DocumentType,t.Body,t.ApprovalReference])).digest('hex');

export const defaultNoticeBody = `To,
The Builder / Developer / Owner
{{owner}}
{{property}}
{{plotAddress}}
{{locality}}

Subject: Notice regarding unauthorised construction on Plot No. {{plot}}, situated at {{location}}.

It has been observed during an inspection conducted by the concerned officials of CIDCO that unauthorised construction and/or development activities are being carried out at the above-mentioned premises without obtaining the requisite prior approval, or in deviation from the sanctioned building plans and permissions granted by the competent authority.

The said construction appears to be in contravention of the applicable development control regulations, sanctioned plans, and other relevant provisions governing development within the CIDCO jurisdiction.

You are hereby called upon to immediately stop all unauthorised construction and development activities at the said premises and submit your written explanation, along with copies of the relevant approvals, sanctioned plans, and supporting documents, to the concerned office within {{days}} days from the date of receipt of this notice.

Please take notice that failure to comply with the directions contained herein, or failure to provide a satisfactory explanation within the stipulated period, may result in further action by CIDCO in accordance with the applicable laws, rules, and regulations, including proceedings for removal or demolition of the unauthorised construction, as applicable.

This notice is issued without prejudice to any other action that may be initiated by CIDCO under the applicable legal provisions.

For and on behalf of CIDCO`;

export function parseContent(value) { try { return JSON.parse(value); } catch { return null; } }
export function readTemplate(body) { const t=parseContent(body);return t?.format==='cidco-template-v2'?t:{format:'cidco-template-v2',body:body||defaultNoticeBody,responseDays:null,pages:[]}; }
export const fieldNames=['owner','property','plot','sector','node','village','location','caseId','reference','days','plotAddress','locality','survey','sections','hearingDate','proceedings','date','signature','authorityName','authorityTitle'];
const text=v=>String(v??'').trim();
const strip=(s,prefix)=>text(s).replace(new RegExp(`^${prefix}\\s*(?:no\\.?|number)?\\s*[:.-]?\\s*`,'i'),'');
export function caseRecipient(c) { return {owner:text(c.OwnerName??c.owner??c.ownerName),property:text(c.PropertyReference??c.property??c.propertyReference),plot:strip(c.PlotNumber??c.plotNumber,'plot'),sector:strip(c.Sector??c.sector,'sector'),node:text(c.Node??c.node),village:text(c.Village??c.village),location:text(c.SiteAddress??c.siteAddress)}; }
export function normalizeRecipient(row,base={}) {
 fail(!row||typeof row!=='object'||Array.isArray(row),'Invalid recipient row.');
 const r=Object.fromEntries(['owner','property','plot','sector','node','village','location'].map(k=>[k,text(row[k])||text(base[k])]));
 r.plot=strip(r.plot,'plot');r.sector=strip(r.sector,'sector');
 for(const [k,v] of Object.entries(r))fail(v.length>(k==='location'?1000:240),`Recipient ${k} is too long.`);
 return r;
}
export function normalizeTokens(body){
 const aliases={'Name of Builder / Developer':'owner','Name of Builder / Developer / Owner':'owner','Builder Name':'owner','Owner Name':'owner','Name of Project / Building':'property','Plot No. and Sector':'plotAddress','Node / Village, Navi Mumbai, Maharashtra':'locality','Plot Number':'plot','Location':'location','specified number of days':'days','Authorised Officer':'authorityName','Authorized Officer':'authorityName','Name of CCUC':'authorityName','CCUC Name':'authorityName','Name of Authority':'authorityName'};
 const variableAliases={builder:'owner',buildername:'owner',ownername:'owner',projectname:'property',buildingname:'property',plotnumber:'plot',sitenumber:'plot',siteaddress:'location',ccucname:'authorityName',authorisedofficer:'authorityName',authorizedofficer:'authorityName',authorityname:'authorityName',authoritytitle:'authorityTitle',responsedays:'days',signatureimage:'signature'};
 let result=String(body).replace(/\[([^\]\n]+)\]/g,(all,label)=>{const key=Object.keys(aliases).find(k=>k.toLowerCase()===label.trim().toLowerCase());return key?`{{${aliases[key]}}}`:all;});
 return result.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(all,key)=>{const normalized=key.replace(/[\s_-]/g,'').toLowerCase();const field=fieldNames.find(k=>k.toLowerCase()===normalized)||variableAliases[normalized];return field?`{{${field}}}`:all;});
}
export function mergeBody(body,fields) {
 const result=normalizeTokens(body);
 return result.replace(/\{\{\s*(\w+)\s*\}\}/g,(_,key)=>{fail(!(key in fields),`Unknown template field: ${key}`);return String(fields[key]??'');});
}
export function resolveTemplateLayout(t){
 const pages=signatureRegionPages(t.pages);
 const mapped=pages.flatMap(p=>p.blocks.map(b=>normalizeTokens(b.text))).join('\n');
 const mappedRecipients=mapped.includes('{{owner}}')&&/\{\{(?:plot|plotAddress|location)\}\}/.test(mapped);
 let signaturePlacement=null;
 for(const [pageIndex,p] of pages.entries()){
  const b=p.blocks.find(b=>normalizeTokens(b.text).includes('{{signature}}'));
  if(b){signaturePlacement={x:b.x,y:b.y,width:b.width,height:b.height,pageIndex};break;}
 }
 const fallback=t.pages.length>0&&!mappedRecipients;
 return {pages,signaturePlacement,layoutMode:fallback?'reference-flow':pages.length?'reference':'letterhead',layoutWarning:fallback?'Notice wording is populated on the selected reference page. Its artwork and signature coordinates are retained.':''};
}
export function validateTemplate(t) {
 fail(!t||t.format!=='cidco-template-v2'||typeof t.body!=='string'||t.body.length>100000,'Invalid template text.');
 fail(t.responseDays!=null&&(!Number.isInteger(t.responseDays)||t.responseDays<1||t.responseDays>3650),'Response period must be 1–3650 days.');
 fail(!Array.isArray(t.pages)||t.pages.length>6,'A reference template may contain up to six pages.');
 let count=0;
 for(const p of t.pages){
  fail(!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<100||p.width>1500||p.height<100||p.height>2000||typeof p.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.image)||p.image.length>6000000||!Array.isArray(p.blocks),'Invalid reference page.');
  for(const b of p.blocks){count++;fail(count>3000||typeof b.text!=='string'||b.text.length>4000||typeof b.original!=='string'||b.original.length>4000||!['x','y','width','height','fontSize'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>p.width+2||b.y+b.height>p.height+2||b.fontSize<3||b.fontSize>100,'Invalid layout element.');if(b.sourceRect)fail(!['x','y','width','height'].every(k=>Number.isFinite(b.sourceRect[k]))||b.sourceRect.x<0||b.sourceRect.y<0||b.sourceRect.width<=0||b.sourceRect.height<=0||b.sourceRect.x+b.sourceRect.width>p.width+2||b.sourceRect.y+b.sourceRect.height>p.height+2,'Invalid original layout region.');}
 }
 return t;
}
export function buildDocument(c,b,template,now=new Date(),{allowIncomplete=false}={}) {
 fail(b.expectedTemplateRevision&&b.expectedTemplateRevision!==templateRevision(template),'The selected template changed. Refresh the case and select it again before previewing or saving.',409);
 const t=validateTemplate(readTemplate(template.Body)),base=caseRecipient(c);
 const responseDays=Number(b.responseDays??t.responseDays);
 const validPeriod=Number.isInteger(responseDays)&&responseDays>=1&&responseDays<=3650;
 fail(!validPeriod&&!allowIncomplete,'Set the notice response period (1–3650 days).');
 fail(!Array.isArray(b.recipients)||!b.recipients.length||b.recipients.length>100,'Provide between 1 and 100 recipients.');
 const recipients=b.recipients.map(r=>normalizeRecipient(r,base));
 for(const [i,r] of recipients.entries())fail((!r.owner||!r.property||!r.plot||!r.node)&&!allowIncomplete,`Recipient ${i+1}: name, project/building, plot number and node are required.`);
 fail(typeof b.body!=='string'||!b.body.trim()||b.body.length>100000,'Notice wording is required.');
 fail(recipients.length*Math.max(1,t.pages.length+1)>200,'This batch exceeds 200 printed pages. Split it into smaller batches.');
 const authority=c.NoticeAuthority||null;
 const layout=resolveTemplateLayout(t);
 const entries=recipients.map(r=>{
  const plotAddress=[`Plot No. ${r.plot}`,r.sector&&`Sector ${r.sector}`].filter(Boolean).join(', ');
  const locality=[r.node,r.village,'Navi Mumbai, Maharashtra'].filter(Boolean).join(', ');
  const fields={...r,location:r.location||`${plotAddress}, ${locality}`,plotAddress,locality,days:validPeriod?String(responseDays):'____ (response period not set)',caseId:c.CaseNumber,reference:b.reference,date:now.toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'}),survey:text(c.SurveyReference),sections:(parseContent(c.ApplicableSections)||[]).join?.(', ')||text(c.ApplicableSections),hearingDate:c.NoticeHearingAt?new Date(c.NoticeHearingAt).toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'}):'',proceedings:text(c.NoticeProceedings),signature:'',authorityName:authority?.name||'Authority not selected',authorityTitle:authority?.title||'Authorised Officer - CCUC Department, CIDCO'};
  const body=mergeBody(b.body,fields);
  fail(/\{\{|\[(?:Name of|Plot |Location|specified)/i.test(body),'Unfilled fields remain in the document.');
  return {fields,body};
 });
 return {format:'cidco-document-v2',templateBody:normalizeTokens(b.body),templateId:template.TemplateId,templateName:template.Name,templateRevision:templateRevision(template),responseDays:validPeriod?responseDays:null,authority,needsRevision:!validPeriod||!authority,recipients,entries,...layout,reference:b.reference,caseNumber:c.CaseNumber,createdAt:now.toISOString()};
}

