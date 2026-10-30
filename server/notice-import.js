import ExcelJS from 'exceljs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import english from '@tesseract.js-data/eng';
import {getDocument,Util} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {normalizeRecipient,defaultNoticeBody,validateTemplate} from './notice-model.js';
import {fail,WorkflowError} from './workflow-policy.js';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
const pdfAssets=dirname(require.resolve('pdfjs-dist/package.json'));

export const recipientColumns=['owner','property','plot','sector','node','village','location'];
const aliases={owner:['owner','ownername','builder','buildername','developer','name','nameofbuilderdeveloper','builderdeveloperowner'],property:['property','project','projectname','building','buildingname','propertyreference','nameofprojectbuilding'],plot:['plot','plotno','plotnumber'],sector:['sector','sectorno'],node:['node','nodename'],village:['village'],location:['location','siteaddress','address']};
const normal=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export async function importRecipients(bytes,fileName){
 fail(bytes.length>5*1024*1024,'Excel file must be smaller than 5 MB.');
 const workbook=new ExcelJS.Workbook();
 try{
  if(/\.xlsx$/i.test(fileName))await workbook.xlsx.load(bytes);
  else if(/\.csv$/i.test(fileName)){const {Readable}=await import('node:stream');await workbook.csv.read(Readable.from([bytes]));}
  else throw new Error();
 }catch{throw new WorkflowError('Upload a valid .xlsx or .csv file.');}
 const sheet=workbook.worksheets[0];fail(!sheet,'The file has no worksheet.');
 fail(sheet.rowCount>101||sheet.columnCount>50,'Use at most 100 recipients and 50 columns per import.');
 const mapping={};sheet.getRow(1).eachCell((cell,col)=>{const key=Object.keys(aliases).find(k=>aliases[k].includes(normal(cell.text)));if(key){fail(mapping[key],`Multiple columns map to ${key}. Keep a single column for this field.`);mapping[key]=col;}});
 fail(!mapping.owner,'Include an Owner, Builder or Name column.');
 const rows=[],errors=[];
 for(let index=2;index<=sheet.rowCount;index++){
  const r=sheet.getRow(index);if(!r.values.some?.(v=>v!=null&&String(v).trim()))continue;
  const value={};for(const [k,col] of Object.entries(mapping)){const cell=r.getCell(col);fail(cell.type===ExcelJS.ValueType.Formula,`Row ${index}: formulas are not accepted. Paste values first.`);value[k]=cell.text;}
  const row=normalizeRecipient(value);if(!row.owner)errors.push(`Row ${index}: recipient name is missing.`);rows.push({rowNumber:index,...row});
 }
 fail(!rows.length,'No recipient rows found.');return {rows,errors,columns:mapping};
}
export async function recipientWorkbook(){const w=new ExcelJS.Workbook();const s=w.addWorksheet('Recipients');s.columns=recipientColumns.map(key=>({header:key,key,width:key==='location'?45:24}));s.getRow(1).font={bold:true};return Buffer.from(await w.xlsx.writeBuffer());}

let extracting=false;
export async function extractTemplate(bytes,mime){
 fail(extracting,'Another reference is being processed. Please retry shortly.',429);extracting=true;
 let worker,pdf,loading;
 try{
  const pages=[];
  const ocr=async(buffer,width,height)=>{
   worker??=await createWorker('eng',1,{langPath:english.langPath,gzip:true,cacheMethod:'none'});
   const result=await worker.recognize(buffer,{}, {blocks:true});
   const lines=(result.data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]);
   return lines.filter(l=>l.text?.trim()).map((l,i)=>({id:`ocr-${i}`,text:l.text.trim(),original:l.text.trim(),x:l.bbox.x0/width*595.28,y:l.bbox.y0/width*595.28,width:(l.bbox.x1-l.bbox.x0)/width*595.28,height:(l.bbox.y1-l.bbox.y0)/width*595.28+2,fontSize:Math.max(5,Math.min(50,(l.bbox.y1-l.bbox.y0)/width*595.28*.75))}));
  };
  if(mime==='application/pdf'){
   loading=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,standardFontDataUrl:join(pdfAssets,'standard_fonts')+'/',cMapUrl:join(pdfAssets,'cmaps')+'/',cMapPacked:true});pdf=await loading.promise;
   fail(pdf.numPages>6,'Use a reference with up to six pages.');
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),view=page.getViewport({scale:1}),scale=595.28/view.width,viewport=page.getViewport({scale:scale*1.5});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),viewport,canvas}).promise;
    const image=canvas.toBuffer('image/png'),text=await page.getTextContent();
    const base=page.getViewport({scale});
    let blocks=text.items.filter(t=>t.str?.trim()).map((t,j)=>{const m=Util.transform(base.transform,t.transform),fs=Math.max(5,Math.hypot(m[2],m[3]));return {id:`pdf-${i}-${j}`,text:t.str,original:t.str,x:Math.max(0,m[4]),y:Math.max(0,m[5]-fs),width:Math.max(2,Math.min(base.width-m[4],t.width*scale+2)),height:fs*1.4,fontSize:Math.min(100,fs)};});
    if(!blocks.length)blocks=await ocr(image,canvas.width,canvas.height);
    pages.push({width:595.28,height:base.height,image:`data:image/png;base64,${image.toString('base64')}`,blocks});
   }
  }else{
   const image=await loadImage(bytes);fail(image.width*image.height>25000000,'Use an image smaller than 25 megapixels.');
   const scale=Math.min(1,1800/image.width),canvas=createCanvas(Math.ceil(image.width*scale),Math.ceil(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   const png=canvas.toBuffer('image/png');pages.push({width:595.28,height:canvas.height/canvas.width*595.28,image:`data:image/png;base64,${png.toString('base64')}`,blocks:await ocr(png,canvas.width,canvas.height)});
  }
  for(const p of pages)for(const b of p.blocks){b.width=Math.min(b.width,p.width-b.x);b.height=Math.min(b.height,p.height-b.y);}
  return validateTemplate({format:'cidco-template-v2',body:defaultNoticeBody,responseDays:null,pages});
 }finally{try{await worker?.terminate();await loading?.destroy();}finally{extracting=false;}}
}
