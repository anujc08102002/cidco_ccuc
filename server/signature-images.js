import crypto from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fail,WorkflowError} from './workflow-policy.js';
import {parseContent} from './notice-model.js';
import {pdfBytes} from './notice-pdf.js';
const require=createRequire(import.meta.url),assets=dirname(require.resolve('pdfjs-dist/package.json'));
export const signatureImageMethod='Admin-registered handwritten signature';
export const imageHash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export function inkBounds(imageData,width,height){
 let left=width,top=height,right=-1,bottom=-1,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=(y*width+x)*4;const p=imageData;if(p[offset+3]>30&&Math.min(p[offset],p[offset+1],p[offset+2])<225){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}}
 fail(count<12,'No signature ink was found. Select a clear image containing the signature.');
 const pad=8;left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(width-1,right+pad);bottom=Math.min(height-1,bottom+pad);
 return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
function pageResult(canvas){const bytes=canvas.toBuffer('image/png');fail(bytes.length>5*1024*1024,'The page image is too large. Use a smaller scan.');let suggestedCrop=null;try{suggestedCrop=inkBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);}catch{}return {image:'data:image/png;base64,'+bytes.toString('base64'),width:canvas.width,height:canvas.height,suggestedCrop};}
export async function extractSignaturePages(bytes,mime){
 let loading;try{
  if(mime==='application/pdf'){
   loading=getDocument({data:new Uint8Array(bytes),standardFontDataUrl:join(assets,'standard_fonts')+'/',isEvalSupported:false});const doc=await loading.promise;fail(doc.numPages>6,'Upload up to six pages.');const pages=[];
   for(let index=1;index<=doc.numPages;index++){const p=await doc.getPage(index),base=p.getViewport({scale:1}),view=p.getViewport({scale:Math.min(3,1800/Math.max(base.width,base.height))});const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));await p.render({canvas,viewport:view}).promise;pages.push(pageResult(canvas));}return pages;
  }
  const image=await loadImage(bytes);fail(image.width*image.height>25000000,'Use an image smaller than 25 megapixels.');
  // Keep source pixels at their original resolution. Cropping never redraws handwriting.
  const canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);return [pageResult(canvas)];
 }catch(e){if(e instanceof WorkflowError)throw e;throw new WorkflowError('The signature source could not be read. Use a valid PDF, PNG or JPEG.');}finally{await loading?.destroy();}
}
export async function cropSignature(bytes,crop){
 let image;try{image=await loadImage(bytes);}catch{throw new WorkflowError('The signature page could not be decoded.');}
 fail(image.width*image.height>25000000,'Use an image smaller than 25 megapixels.');
 fail(!crop||!['x','y','width','height'].every(k=>Number.isFinite(crop[k])),'Select the signature region.');
 const box=Object.fromEntries(Object.entries(crop).filter(([k])=>['x','y','width','height'].includes(k)).map(([k,v])=>[k,Math.round(v)]));
 fail(box.x<0||box.y<0||box.width<5||box.height<5||box.x+box.width>image.width||box.y+box.height>image.height,'The signature crop must stay within the source page.');
 const source=createCanvas(image.width,image.height),ctx=source.getContext('2d');ctx.drawImage(image,0,0);
 const original=ctx.getImageData(box.x,box.y,box.width,box.height);inkBounds(original.data,box.width,box.height);
 const canvas=createCanvas(box.width,box.height);canvas.getContext('2d').putImageData(original,0,0);const output=canvas.toBuffer('image/png');
 fail(output.length>2*1024*1024,'Crop closer to the signature (maximum cropped image 2 MB).');
 return {format:'signature-image-v1',image:'data:image/png;base64,'+output.toString('base64'),width:box.width,height:box.height,hash:imageHash(output),sourceHash:imageHash(bytes),crop:box};
}
// Estimate local paper colour, separate ink by contrast and retain the original
// stroke pixels at their source coordinates. No text recognition or redrawing.
export async function extractSignatureInk(bytes,crop,{cleanup=35}={}){
 fail(!Number.isFinite(cleanup)||cleanup<0||cleanup>100,'Background cleanup must be between 0 and 100.');
 const raw=await cropSignature(bytes,crop),image=await loadImage(Buffer.from(raw.image.split(',')[1],'base64'));
 const canvas=createCanvas(raw.width,raw.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,raw.width,raw.height),data=pixels.data;
 const step=48,cols=Math.ceil(raw.width/step),rows=Math.ceil(raw.height/step),paper=[];
 const percentile=(values,q)=>{values.sort((a,b)=>a-b);return values[Math.min(values.length-1,Math.floor(values.length*q))]??255;};
 for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
  const channels=[[],[],[]];for(let y=gy*step;y<Math.min(raw.height,(gy+1)*step);y+=2)for(let x=gx*step;x<Math.min(raw.width,(gx+1)*step);x+=2){const i=(y*raw.width+x)*4;if(data[i+3]>20)for(let c=0;c<3;c++)channels[c].push(data[i+c]);}
  paper.push(channels.map(v=>percentile(v,.85)));
 }
 const background=(x,y)=>{const fx=Math.max(0,Math.min(cols-1,x/step-.5)),fy=Math.max(0,Math.min(rows-1,y/step-.5)),x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(cols-1,x0+1),y1=Math.min(rows-1,y0+1),dx=fx-x0,dy=fy-y0;return [0,1,2].map(c=>paper[y0*cols+x0][c]*(1-dx)*(1-dy)+paper[y0*cols+x1][c]*dx*(1-dy)+paper[y1*cols+x0][c]*(1-dx)*dy+paper[y1*cols+x1][c]*dx*dy);};
 const threshold=.025+cleanup*.0012,contrasts=new Float32Array(raw.width*raw.height),hist=new Uint32Array(256);let ink=0;
 for(let y=0;y<raw.height;y++)for(let x=0;x<raw.width;x++){const n=y*raw.width+x,i=n*4;if(data[i+3]<10)continue;const bg=background(x,y),contrast=Math.max(0,...bg.map((v,c)=>(v-data[i+c])/Math.max(v,60)));contrasts[n]=contrast;if(contrast>threshold){hist[Math.min(255,Math.round(contrast*255))]++;ink++;}}
 fail(ink<12,'No distinct signature strokes were found. Reduce cleanup or select a clearer signature scan.');
 let cumulative=0,core=1;for(let i=0;i<256;i++){cumulative+=hist[i];if(cumulative>=ink*.98){core=Math.max(threshold+.12,i/255);break;}}
 let left=raw.width,top=raw.height,right=-1,bottom=-1;
 for(let y=0;y<raw.height;y++)for(let x=0;x<raw.width;x++){
  const n=y*raw.width+x,i=n*4,originalAlpha=data[i+3]/255;const a=Math.max(0,Math.min(1,(contrasts[n]-threshold)/(core-threshold)))*originalAlpha;
  if(a<.015){data[i]=data[i+1]=data[i+2]=data[i+3]=0;continue;}
  const bg=background(x,y);for(let c=0;c<3;c++)data[i+c]=Math.round(Math.max(0,Math.min(255,(data[i+c]-bg[c]*(1-a))/a)));
  data[i+3]=Math.round(a*255);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
 }
 fail(right<left,'No signature remains after background cleanup. Reduce cleanup.');
 const pad=4;left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(raw.width-1,right+pad);bottom=Math.min(raw.height-1,bottom+pad);
 ctx.putImageData(pixels,0,0);const outputCanvas=createCanvas(right-left+1,bottom-top+1);outputCanvas.getContext('2d').putImageData(ctx.getImageData(left,top,outputCanvas.width,outputCanvas.height),0,0);const output=outputCanvas.toBuffer('image/png');fail(output.length>2*1024*1024,'Crop closer to the signature (maximum extracted ink 2 MB).');
 return {...raw,image:'data:image/png;base64,'+output.toString('base64'),hash:imageHash(output),width:outputCanvas.width,height:outputCanvas.height,originalImage:raw.image,sourceWidth:raw.width,sourceHeight:raw.height,processing:{method:'local-paper-ink-extraction-v1',cleanup,transparent:true,inkBounds:{x:left,y:top,width:outputCanvas.width,height:outputCanvas.height}}};
}
export function validateStoredSignature(asset){
 fail(asset?.format!=='signature-image-v1'||typeof asset.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset.image)||asset.image.length>2800000,'No approved handwritten signature is registered. Ask the administrator to upload it.',409);
 const bytes=Buffer.from(asset.image.split(',')[1],'base64');fail(imageHash(bytes)!==asset.hash,'The stored signature image failed its integrity check.',409);return asset;
}
export async function applyHandwrittenSignature(d,user,asset){
 fail(user.RoleCode!=='ccuc','Only CCUC can approve and sign notices or orders.',403);
 const doc=parseContent(d.Content);fail(doc?.format!=='cidco-document-v2'||!doc.authority?.id,'Return this older draft to the CUC for a populated revision before signing.',409);
 fail(doc.authority.id.toLowerCase()!==String(user.UserId).toLowerCase(),'This notice is addressed to another CCUC for approval.',403);
 validateStoredSignature(asset);fail(String(asset.userId).toLowerCase()!==String(user.UserId).toLowerCase(),'The registered signature belongs to another officer.',403);const at=new Date();
 let ink=asset;
 // Existing registrations also lose the paper rectangle on newly approved PDFs.
 // Their stored source and all previously approved documents remain intact.
 if(!asset.processing?.transparent){const bytes=Buffer.from(asset.image.split(',')[1],'base64'),source=await loadImage(bytes);ink=await extractSignatureInk(bytes,{x:0,y:0,width:source.width,height:source.height});}
 const pdf=await pdfBytes(d.Content,{reference:d.ReferenceNumber,createdAt:d.CreatedAt,signer:{name:doc.authority.name,title:doc.authority.title,at,image:ink.image,imageHash:ink.hash,method:signatureImageMethod}});
 return {pdf,hash:crypto.createHash('sha256').update(pdf).digest(),name:doc.authority.name,at,imageHash:ink.hash,registeredImageHash:asset.hash,method:signatureImageMethod};
}
