import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {PDFDocument} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildDocument,defaultNoticeBody,resolveTemplateLayout,templateRevision} from './notice-model.js';
import {pdfBytes} from './notice-pdf.js';
import {extractTemplate,importRecipients} from './notice-import.js';
import {createCanvas} from '@napi-rs/canvas';
const c={CaseNumber:'TEST-CASE',OwnerName:'Anuj Chavan',PropertyReference:'Test Building',PlotNumber:'118',Sector:'Sector 4',Node:'Belapur',NoticeAuthority:{id:'11111111-1111-1111-1111-111111111111',name:'Test CCUC Authority',title:'Authorised Officer - CCUC Department, CIDCO'},Village:'Test village',SiteAddress:''};
const b={body:defaultNoticeBody,reference:'TEST-REF',responseDays:15,recipients:[{}]};
const t={TemplateId:'test',Body:defaultNoticeBody};

test('signature-only reference generates populated notice and respects saved placement',async()=>{
 const canvas=createCanvas(595,842);canvas.getContext('2d').fillRect(0,0,595,842);
 const source={format:'cidco-template-v2',body:defaultNoticeBody,responseDays:15,pages:[{width:595.28,height:841.89,image:canvas.toDataURL('image/png'),blocks:[{id:'signature',text:'{{signature}}',original:'',x:300,y:730,width:240,height:80,fontSize:10}]}]};
 const points=[];
 for(const delta of [0,40]){
  source.pages[0].blocks[0].x=300-delta;source.pages[0].blocks[0].y=730-delta;
  const document=buildDocument({...c,OwnerName:'Anuj Chavan'},b,{TemplateId:'actual-reference',Body:JSON.stringify(source)});
  assert.equal(document.layoutMode,'reference-flow');assert.equal(document.pages.length,1);assert.equal(document.pages[0].image,source.pages[0].image);assert.equal(document.signaturePlacement.x,300-delta);
  const bytes=await pdfBytes(document),loading=getDocument({data:new Uint8Array(bytes)}),pdf=await loading.promise;
  const items=[];for(let n=1;n<=pdf.numPages;n++)items.push(...(await (await pdf.getPage(n)).getTextContent()).items);
  const text=items.map(i=>i.str).join(' ');assert.match(text,/Anuj Chavan/);assert.match(text,/Plot No\. 118/);assert.match(text,/15 days/);assert.match(text,/Test CCUC Authority/);
  points.push(items.find(i=>i.str==='Test CCUC Authority').transform.slice(4));await loading.destroy();
 }
 assert(Math.abs(points[1][0]-points[0][0]+40)<.001);assert(Math.abs(points[1][1]-points[0][1]-40)<.001);
});

test('legacy duplicate signatures resolve to the latest region without changing template identity or artwork',()=>{
 const block=(id,x)=>({id,text:'{{signature}}',original:'',x,y:730,width:200,height:80,fontSize:10});
 const template={format:'cidco-template-v2',body:defaultNoticeBody,responseDays:15,pages:[{width:595.28,height:841.89,image:'data:image/png;base64,AA==',blocks:[block('old',300),block('latest',376)]}]};
 const layout=resolveTemplateLayout(template);assert.equal(layout.pages[0].blocks.length,1);assert.equal(layout.pages[0].blocks[0].id,'latest');assert.equal(layout.signaturePlacement.x,376);assert.equal(template.pages[0].blocks.length,2);
 const selected={TemplateId:'selected-id',Name:'Selected template',DocumentType:'Notice',ApprovalReference:'TEST',Body:JSON.stringify(template)};
 const document=buildDocument(c,{...b,expectedTemplateRevision:templateRevision(selected)},selected);assert.equal(document.templateId,'selected-id');assert.equal(document.templateName,'Selected template');assert.equal(document.pages[0].image,template.pages[0].image);
 assert.throws(()=>buildDocument(c,{...b,expectedTemplateRevision:'stale'},selected),/selected template changed/);
});
test('case and Excel data produce frozen populated recipient pages and required response period',async()=>{
 const w=new ExcelJS.Workbook();const sheet=w.addWorksheet('Recipients');sheet.addRow(['Builder Name','Project','Plot No','Sector','Node']);sheet.addRow(['First Owner','First Building','119','Sector 4','Belapur']);sheet.addRow(['Second Owner','Second Building','120','Sector 5','Kharghar']);
 const {rows,errors}=await importRecipients(Buffer.from(await w.xlsx.writeBuffer()),'recipients.xlsx');assert.equal(rows.length,2);assert.equal(errors.length,0);
 const doc=buildDocument(c,{...b,recipients:rows},t);assert.match(doc.entries[0].body,/First Owner/);assert.match(doc.entries[1].body,/Plot No\. 120/);assert(!doc.entries[0].body.includes('Sector Sector'));assert(!doc.entries[0].body.includes('{{'));
 assert.throws(()=>buildDocument(c,{...b,responseDays:null},t),/response period/);assert.throws(()=>buildDocument({...c,PlotNumber:''},b,t),/plot number/);
 c.OwnerName='Changed later';assert.equal(doc.recipients[0].owner,'First Owner');
 const bytes=await pdfBytes(doc);assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
 const loading=getDocument({data:new Uint8Array(bytes)});const pdf=await loading.promise;const text=(await (await pdf.getPage(2)).getTextContent()).items.map(i=>i.str).join(' ');assert.match(text,/Second Owner/);assert.match(text,/120/);assert.match(text,/15 days/);await loading.destroy();
});
test('import rejects formulas, unknown columns and missing names',async()=>{
 await assert.rejects(()=>importRecipients(Buffer.from('Title\nUnknown'),'list.csv'),/Owner/);
 const w=new ExcelJS.Workbook();const s=w.addWorksheet('Recipients');s.addRow(['owner']);s.getCell('A2').value={formula:'1+1',result:2};await assert.rejects(()=>w.xlsx.writeBuffer().then(b=>importRecipients(Buffer.from(b),'list.xlsx')),/formulas/);
});
test('PDF extraction retains artwork and positions; image OCR finds text',async()=>{
 const bytes=await pdfBytes(buildDocument(c,b,t));const layout=await extractTemplate(bytes,'application/pdf');assert.equal(layout.pages.length,1);assert(layout.pages[0].blocks.some(b=>b.text.includes('Belapur')));
 const png=Buffer.from(layout.pages[0].image.split(',')[1],'base64');const scan=await extractTemplate(png,'image/png');assert(scan.pages[0].blocks.some(b=>b.text.includes('CIDCO')));
 const first=layout.pages[0].blocks.find(b=>b.text===c.OwnerName);first.text='{{owner}}';first.width=250;const plotBlock=layout.pages[0].blocks.find(b=>b.text.startsWith('Plot No.'));plotBlock.text='{{plotAddress}}';plotBlock.width=300;
 const template={TemplateId:'reference',Body:JSON.stringify(layout)};const doc=buildDocument(c,{...b,recipients:[{owner:'Mapped Owner'}]},template);const output=await pdfBytes(doc);const loading=getDocument({data:new Uint8Array(output)});const pdf=await loading.promise;const content=(await (await pdf.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');assert.match(content,/Mapped Owner/);await loading.destroy();
});
