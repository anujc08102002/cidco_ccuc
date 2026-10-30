import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import 'regenerator-runtime/runtime.js';
import {mergeBody,parseContent,normalizeTokens} from './notice-model.js';
import {fail} from './workflow-policy.js';
import {signatureRegionPages} from '../shared/notice-layout.js';

export async function renderNoticePdf(content,{reference='',createdAt=new Date(),signer=null}={}) {
 const parsed=typeof content==='string'?parseContent(content):content;
 const doc=parsed?.pages?{...parsed,pages:signatureRegionPages(parsed.pages)}:parsed;
 const entries=doc?.format==='cidco-document-v2'?doc.entries:[{body:String(content),fields:{}}];
 const pdf=await PDFDocument.create();pdf.setTitle(reference||doc?.reference||'CIDCO notice');pdf.setAuthor('CIDCO · Enforcement Department');
 pdf.registerFontkit({create(bytes){const f=fontkit.create(bytes);return f.fonts?.[0]??f;}});
 const hasIndic=/[\u0900-\u097f]/.test(JSON.stringify({entries,signer,pages:doc?.pages?.map(p=>p.blocks.map(b=>b.text))}));
 const fontBytes=await readFile(process.env.NOTICE_FONT_PATH||(hasIndic?'C:/Windows/Fonts/Nirmala.ttc':'C:/Windows/Fonts/arial.ttf')).catch(()=>null);
 const font=fontBytes?await pdf.embedFont(fontBytes,{subset:true}):await pdf.embedFont(StandardFonts.TimesRoman);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const safe=(s,f=font)=>{try{f.encodeText(String(s));return String(s);}catch{fail(true,'The configured PDF font cannot display this text. Configure NOTICE_FONT_PATH with a font supporting the document language.');}};
 const lines=(text,size,width)=>{
  const out=[];for(const line of String(text).split('\n')){if(!line.trim()){out.push('');continue;}let current='';for(const word of line.split(/\s+/)){const next=current?current+' '+word:word;if(font.widthOfTextAtSize(safe(next),size)>width&&current){out.push(current);current=word;}else current=next;}out.push(current);}return out;
 };
 const signatureImage=signer?.image?await pdf.embedPng(signer.image):null;
 const fitImage=(page,x,y,width,height)=>{const scale=Math.min(width/signatureImage.width,height/signatureImage.height);page.drawImage(signatureImage,{x,y:y+(height-signatureImage.height*scale)/2,width:signatureImage.width*scale,height:signatureImage.height*scale});};
 const drawSign=(page,y,width)=>{
  const x=Math.max(45,width-300),name=signer?.name||doc?.authority?.name||'Authority not selected';
  page.drawText('For and on behalf of CIDCO',{x,y,size:10,font,color:rgb(.06,.27,.35)});
  if(signatureImage)fitImage(page,x,y-65,230,55);
  else page.drawText(signer?.fingerprint?'Digitally signed':'Signature pending CCUC approval',{x,y:y-40,size:9,font,color:rgb(.35,.4,.45)});
  const nameLines=lines(name,11,255);nameLines.forEach((line,i)=>page.drawText(safe(line),{x,y:y-80-i*14,size:11,font}));
  const titleY=y-83-nameLines.length*14;
  page.drawText('Authorised Officer - CCUC Department, CIDCO',{x,y:titleY,size:9,font});
  if(signer){page.drawText(safe('Approved '+new Date(signer.at).toLocaleString('en-GB',{timeZone:'Asia/Kolkata'})+' IST'),{x,y:titleY-15,size:8,font});}
 };
 const drawSignatureRegion=(page,b,height)=>{
  fail(b.height<64||b.width<99,'The signature region must be at least 100 × 65 points. Enlarge it in Configuration.');
  if(signatureImage)fitImage(page,b.x,height-b.y-b.height+31,b.width,b.height-31);
  else page.drawText('Signature pending',{x:b.x,y:height-b.y-12,size:8,font});
  let size=10;const name=signer?.name||doc?.authority?.name||'Authority not selected';while(size>5&&font.widthOfTextAtSize(safe(name),size)>b.width)size-=.5;
  fail(font.widthOfTextAtSize(safe(name),size)>b.width,'Authority name does not fit the signature region. Enlarge it in Configuration.');
  page.drawText(safe(name),{x:b.x,y:height-b.y-b.height+18,size,font});page.drawText('Authorised Officer - CCUC, CIDCO',{x:b.x,y:height-b.y-b.height+6,size:Math.min(8,b.width/20),font});
 };
 for(const entry of entries){
  if(doc?.pages?.length&&doc.layoutMode==='reference-flow'){
   // Flow populated wording onto the chosen reference, retaining its dimensions,
   // artwork and exact top-left signature coordinates. Never substitute a page.
   const body=entry.body.replace(/\n(?:For and on behalf of CIDCO\s*)?(?:Authori[sz]ed Officer\s*)(?:CCUC Department\s*)?CIDCO\s*$/i,'').replace(/\nFor and on behalf of CIDCO\s*$/i,'');
   for(const [pageIndex,source] of doc.pages.entries()){
    const page=pdf.addPage([source.width,source.height]);const background=await pdf.embedPng(source.image);page.drawImage(background,{x:0,y:0,width:source.width,height:source.height});
    const region=source.blocks.find(b=>normalizeTokens(b.text).includes('{{signature}}'));
    if(pageIndex===0){
     const top=140,bottom=Math.min(source.height-65,region?region.y-16:source.height-65),width=source.width-90;
     fail(bottom-top<100,'The signature overlaps the notice body. Place it lower on the page or on another reference page.');
     let size=11.5,wrapped=lines(body,size,width);while(size>8&&wrapped.length*size*1.39>bottom-top){size-=.25;wrapped=lines(body,size,width);}
     fail(wrapped.length*size*1.39>bottom-top,'The wording does not fit above the signature. Shorten the wording or move the signature lower.');
     page.drawRectangle({x:45,y:source.height-bottom,width,height:bottom-top+5,color:rgb(1,1,1)});
     // A blank working reference receives the same CIDCO heading in designer and print.
     if(!source.blocks.some(b=>b.original?.trim()&&b.y<125)){
      const title=['CITY AND INDUSTRIAL DEVELOPMENT CORPORATION','OF MAHARASHTRA LTD.'];title.forEach((text,i)=>page.drawText(text,{x:(source.width-bold.widthOfTextAtSize(text,12))/2,y:source.height-54-i*17,size:12,font:bold,color:rgb(.06,.22,.3)}));
      page.drawText('ENFORCEMENT DEPARTMENT - CIDCO',{x:(source.width-bold.widthOfTextAtSize('ENFORCEMENT DEPARTMENT - CIDCO',9))/2,y:source.height-94,size:9,font:bold});
      page.drawText(safe(`${reference||doc.reference||'Notice'} | ${new Date(doc.createdAt||createdAt).toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'})}`),{x:45,y:source.height-115,size:9,font});
      page.drawLine({start:{x:45,y:source.height-128},end:{x:source.width-45,y:source.height-128},thickness:.8,color:rgb(.15,.3,.38)});
     }
     wrapped.forEach((line,i)=>{if(line)page.drawText(safe(line),{x:45,y:source.height-top-size-i*size*1.39,size,font});});
    }
    if(region){page.drawRectangle({x:region.x,y:source.height-region.y-region.height,width:region.width,height:region.height,color:rgb(1,1,1)});drawSignatureRegion(page,region,source.height);}
   }
   if(!doc.signaturePlacement){const page=pdf.addPage([595.28,841.89]);drawSign(page,710,595.28);}
  }else if(doc?.pages?.length){
   let page;
   for(const source of doc.pages){
    page=pdf.addPage([source.width,source.height]);const image=await pdf.embedPng(source.image);
    page.drawImage(image,{x:0,y:0,width:source.width,height:source.height});
    for(const b of source.blocks){
     const normalized=normalizeTokens(b.text);
     const original=b.sourceRect||b;
     const moved=original.x!==b.x||original.y!==b.y||original.width!==b.width||original.height!==b.height;
     if(b.original&&(moved||normalized!==b.original))page.drawRectangle({x:original.x,y:source.height-original.y-original.height,width:original.width,height:original.height,color:rgb(1,1,1)});
     if(normalized.includes('{{signature}}')){
      fail(b.height<65||b.width<100,'The signature region must be at least 100 × 65 points. Enlarge it in Configuration.');
      page.drawRectangle({x:b.x,y:source.height-b.y-b.height,width:b.width,height:b.height,color:rgb(1,1,1)});
      drawSignatureRegion(page,b,source.height);continue;
     }
     const value=mergeBody(normalized,entry.fields);
     if(value===b.original&&!moved)continue;
     page.drawRectangle({x:b.x,y:source.height-b.y-b.height,width:b.width,height:b.height,color:rgb(1,1,1)});
     let size=b.fontSize,wrapped=lines(value,size,b.width);
     while(size>5&&(wrapped.length*size*1.2>b.height||wrapped.some(l=>font.widthOfTextAtSize(safe(l),size)>b.width))){size-=.5;wrapped=lines(value,size,b.width);}
     fail(wrapped.length*size*1.2>b.height||wrapped.some(l=>font.widthOfTextAtSize(safe(l),size)>b.width),'A populated layout field does not fit. Enlarge its region in Configuration.');
     wrapped.forEach((line,i)=>{if(line)page.drawText(safe(line),{x:b.x,y:source.height-b.y-size-i*size*1.2,size,font});});
    }
   }
   if(!doc.pages.some(p=>p.blocks.some(b=>normalizeTokens(b.text).includes('{{signature}}')))){
    // A separate endorsement page avoids overwriting a supplied reference layout.
    page=pdf.addPage([595.28,841.89]);page.drawText('CIDCO - Document signature endorsement',{x:45,y:790,size:13,font:bold});page.drawText(safe(`${doc.reference} · ${entry.fields.owner} · Plot ${entry.fields.plot}`),{x:45,y:760,size:11,font});drawSign(page,710,595.28);
   }
  }else{
   let page,y;const newPage=()=>{page=pdf.addPage([595.28,841.89]);y=700;
    const title=['CITY AND INDUSTRIAL DEVELOPMENT CORPORATION','OF MAHARASHTRA LTD.'];title.forEach((t,i)=>page.drawText(t,{x:(595.28-bold.widthOfTextAtSize(t,12))/2,y:788-i*17,size:12,font:bold,color:rgb(.06,.22,.3)}));
    page.drawText('ENFORCEMENT DEPARTMENT - CIDCO',{x:175,y:748,size:9,font:bold});
    page.drawText(safe(`${reference||doc?.reference||'Notice'} | ${new Date(doc?.createdAt||createdAt).toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'})}`),{x:45,y:727,size:9,font});page.drawLine({start:{x:45,y:714},end:{x:550,y:714},thickness:.8,color:rgb(.15,.3,.38)});
   };newPage();
   // Legacy closing labels are replaced by the single signature block below.
   const body=entry.body.replace(/\n(?:For and on behalf of CIDCO\s*)?(?:Authori[sz]ed Officer\s*)(?:CCUC Department\s*)?CIDCO\s*$/i,'').replace(/\nFor and on behalf of CIDCO\s*$/i,'');
   for(const line of lines(body,11.5,505)){if(y<90)newPage();if(line)page.drawText(safe(line),{x:45,y,size:11.5,font});y-=16;}
   if(doc?.signaturePlacement){
    const placement=doc.signaturePlacement;
    // Keep the administrator's top-left coordinates; move to an endorsement page if body text occupies that area.
    if(y<841.89-placement.y+16)newPage();
    drawSignatureRegion(page,placement,841.89);
   }else{
    const signatureSpace=20+83+14*lines(signer?.name||doc?.authority?.name||'Authority not selected',11,255).length+15+45;
    if(y<signatureSpace)newPage();drawSign(page,y-20,595.28);
   }
  }
 }
 return pdf;
}
export const pdfBytes=async(content,options)=>Buffer.from(await (await renderNoticePdf(content,options)).save({useObjectStreams:false}));
