import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {createSiteReport,reportFilename} from './site-report.js';
import crypto from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

export const reportFixture=()=>({case:{id:'CASE/TEST/000001',caseKey:'test-key',property:'TEST FIXTURE - Plot 42',owner:'Test owner',node:'Test node',status:'Closed',stage:'8. Demolition and closure',legal:false,survey:'SURVEY/TEST',officer:'Test CUC',surveyor:'Test surveyor',assignedCuc:'Test CUC',plotNumber:'42',siteAddress:'Fictional test address',violationDescription:'Test observation only. Not a real property.',applicableSections:['53'],latitude:19.03,longitude:73.02},rowVersion:'test-version',closedAt:'2026-10-21T06:00:00Z',Surveys:[{VisitAt:'2026-10-01',Remarks:'Test visit',EncroachmentDetails:'Recorded test observations'}],Documents:[{DocumentId:'test-document',ReferenceNumber:'ORDER/TEST',DocumentType:'Order',FileName:'test-order.pdf',VersionNumber:1,ApprovalState:'Issued',SignedByName:'Test CCUC',SignedAt:'2026-10-20',IssuedAt:'2026-10-20'}],Hearings:[{HearingAt:'2026-10-10',Status:'Completed',Proceedings:'Test representation recorded.'}],LegalUpdates:[],CaseReferences:[],DemolitionDrives:[{CompletedAt:'2026-10-21',Outcome:'Test completion outcome.'}],CaseActions:[{ActionType:'close',Notes:'Test closure reason',PerformedByName:'Test CUC'}],AuditLog:[{EventType:'WorkflowTransition',DisplayName:'Test CUC',Detail:'Test recorded transition'}],ChargeTransfers:[]});

test('site report prints proceedings, preserves original bytes and embeds a verifiable archive',async()=>{
 const original=await PDFDocument.create();original.addPage().drawText('TEST ORIGINAL ORDER - NOT AN OFFICIAL INSTRUMENT',{x:48,y:760,size:12});const originalBytes=Buffer.from(await original.save());
 const canvas=createCanvas(240,140),ctx=canvas.getContext('2d');ctx.fillStyle='#d4e8e0';ctx.fillRect(0,0,240,140);ctx.fillStyle='#173843';ctx.fillRect(40,30,160,90);const image=canvas.toBuffer('image/png');
 const snapshot=reportFixture();snapshot.Documents.push({DocumentId:'test-image',FileName:'test-site.png',DocumentType:'after-demolition'});
 const result=await createSiteReport(snapshot,{actor:'Test officer',reportId:'TEST-REPORT-ONLY',generatedAt:new Date('2026-10-21T07:00:00Z'),files:[{DocumentId:'test-document',DocumentType:'Order',FileName:'test-order.pdf',MimeType:'application/pdf',FileContent:originalBytes},{DocumentId:'test-image',DocumentType:'after-demolition',FileName:'test-site.png',MimeType:'image/png',FileContent:image}]});
 const task=getDocument({data:Uint8Array.from(result.bytes),useSystemFonts:true}),pdf=await task.promise;
 let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await (await pdf.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ')+'\n';
 for(const expected of ['Completed case report','Test closure reason','Test representation recorded.','Test completion outcome.','TEST ORIGINAL ORDER','Site legality:','Test CUC'])assert(text.includes(expected),expected);
 assert(!text.includes('Site is legal'));assert(!text.includes('Site is illegal'));
 const attachments=await pdf.getAttachments(),record=JSON.parse(Buffer.from(await pdf.getAttachmentContent('case-record.json')));assert.equal(record.snapshot.rowVersion,'test-version');assert.equal(record.reportId,'TEST-REPORT-ONLY');assert.equal(record.manifest.length,2);
 assert.deepEqual(Buffer.from(await pdf.getAttachmentContent('001-test-order.pdf')),originalBytes);
 assert.equal(record.manifest[0].sha256,crypto.createHash('sha256').update(originalBytes).digest('hex'));
 assert.equal((await PDFDocument.load(result.bytes)).getPageCount(),result.pageCount);
 await mkdir('output/pdf',{recursive:true});await writeFile('output/pdf/site-report-test-fixture.pdf',result.bytes);
 for(const number of [1,2,pdf.numPages]){const p=await pdf.getPage(number),viewport=p.getViewport({scale:1.3}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;await writeFile(`tmp/pdfs/site-report-page-${number}.png`,canvas.toBuffer('image/png'));}
 await task.destroy();
});
test('interim report identifies missing records and never treats legal holds as site legality',async()=>{
 const snapshot=reportFixture();snapshot.case.status='Review hold';snapshot.case.legal=true;snapshot.LegalUpdates=[{Source:'Test court record',LegalStatus:'Test restriction',RestrictsEnforcement:true,Notes:'Refer to test source'}];
 const {bytes}=await createSiteReport(snapshot);const task=getDocument({data:Uint8Array.from(bytes),useSystemFonts:true}),pdf=await task.promise;let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await (await pdf.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ');
 for(const expected of ['Interim case report','Test court record','No stored original binary:','does not certify'])assert(text.includes(expected),expected);
 assert.equal(reportFilename('../../case/1'),'CIDCO-------case-1-site-report.pdf');await task.destroy();
});
test('Maharashtra site observations retain Devanagari text',async()=>{
 const snapshot=reportFixture();snapshot.case.violationDescription='बेलापूर येथील स्थळ पाहणी अहवाल';
 const result=await createSiteReport(snapshot);const task=getDocument({data:Uint8Array.from(result.bytes),useSystemFonts:true}),pdf=await task.promise;
 let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await (await pdf.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ');
 assert(text.includes('बेलापूर'));await task.destroy();
});
