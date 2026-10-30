import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {cropSignature,extractSignatureInk,extractSignaturePages,validateStoredSignature,applyHandwrittenSignature,signatureImageMethod} from './signature-images.js';
import {requireSignatureAdmin,registerSignatureImageRoutes} from './signature-image-routes.js';
import {buildDocument,defaultNoticeBody,normalizeTokens,mergeBody} from './notice-model.js';
import {transition,defaults} from './workflow-policy.js';
import sql from 'mssql';
import express from 'express';
const officerId='11111111-1111-1111-1111-111111111111';
const officer={UserId:officerId,RoleCode:'ccuc',DisplayName:'Actual Test CCUC Name'};
const c={CaseId:'22222222-2222-2222-2222-222222222222',CaseNumber:'TEST/118',OwnerName:'Actual Test Builder',PropertyReference:'Actual Test Building',PlotNumber:'118',Sector:'Sector 4',Node:'Belapur',NoticeAuthority:{id:officerId,name:officer.DisplayName,title:'Authorised Officer - CCUC Department, CIDCO'}};
function scan(){const canvas=createCanvas(600,300),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,300);ctx.strokeStyle='#173b85';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(100,180);ctx.bezierCurveTo(145,10,120,230,190,115);ctx.bezierCurveTo(230,55,150,225,280,130);ctx.bezierCurveTo(320,60,280,190,390,140);ctx.stroke();return canvas;}
const crop={x:85,y:35,width:330,height:190};
async function getAsset(){return {...await cropSignature(scan().toBuffer('image/png'),crop),userId:officerId,uploadedAt:new Date().toISOString()};}

test('ink extraction removes gray paper and shadows without moving the handwriting',async()=>{
 const source=scan(),ctx=source.getContext('2d');ctx.globalCompositeOperation='destination-over';
 const background=createCanvas(600,300),bg=background.getContext('2d'),gradient=bg.createLinearGradient(0,0,600,300);gradient.addColorStop(0,'#aeb5ae');gradient.addColorStop(1,'#d6d9d0');bg.fillStyle=gradient;bg.fillRect(0,0,600,300);
 // Draw the same source pen geometry over gray paper, including antialiased edges.
 bg.strokeStyle='#173b85';bg.lineWidth=2;bg.beginPath();bg.moveTo(100,180);bg.bezierCurveTo(145,10,120,230,190,115);bg.bezierCurveTo(230,55,150,225,280,130);bg.bezierCurveTo(320,60,280,190,390,140);bg.stroke();
 const asset=await extractSignatureInk(background.toBuffer('image/png'),crop),image=await loadImage(Buffer.from(asset.image.split(',')[1],'base64')),out=createCanvas(asset.width,asset.height);out.getContext('2d').drawImage(image,0,0);const pixels=out.getContext('2d').getImageData(0,0,asset.width,asset.height).data;
 assert(asset.processing.transparent);assert(asset.width<crop.width);assert.equal(pixels[3],0);assert(asset.originalImage);assert.equal(asset.sourceWidth,crop.width);
 const original=bg.getImageData(crop.x,crop.y,crop.width,crop.height).data,bounds=asset.processing.inkBounds;let strong=0,preserved=0;
 for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){const i=(y*crop.width+x)*4;if(original[i]<65&&original[i+2]>70){strong++;const ox=x-bounds.x,oy=y-bounds.y;if(ox>=0&&oy>=0&&ox<asset.width&&oy<asset.height&&pixels[(oy*asset.width+ox)*4+3]>150)preserved++;}}
 assert(strong>100);assert(preserved/strong>.98);assert.equal(validateStoredSignature(asset).hash,asset.hash);
 const pdf=await PDFDocument.create(),embedded=await pdf.embedPng(Buffer.from(asset.image.split(',')[1],'base64'));pdf.addPage().drawImage(embedded);const parsed=await PDFDocument.load(await pdf.save());const objects=parsed.getPage(0).node.Resources().lookup(PDFName.of('XObject'),PDFDict);assert(objects.keys().some(k=>objects.lookup(k).dict.get(PDFName.of('SMask'))));
 await assert.rejects(()=>extractSignatureInk(background.toBuffer('image/png'),crop,{cleanup:101}),/between/);
});
test('signature crop preserves each original RGBA pixel and aspect ratio',async()=>{
 const source=scan(),asset=await getAsset(),image=await loadImage(Buffer.from(asset.image.split(',')[1],'base64')),canvas=createCanvas(asset.width,asset.height);canvas.getContext('2d').drawImage(image,0,0);
 const expected=source.getContext('2d').getImageData(crop.x,crop.y,crop.width,crop.height).data,actual=canvas.getContext('2d').getImageData(0,0,asset.width,asset.height).data;assert.deepEqual(actual,expected);assert.equal(asset.width,crop.width);assert.equal(asset.height,crop.height);assert.equal(validateStoredSignature(asset).hash,asset.hash);
 await assert.rejects(()=>cropSignature(source.toBuffer('image/png'),{x:-1,y:0,width:20,height:20}),/within/);await assert.rejects(()=>cropSignature(source.toBuffer('image/png'),{x:0,y:0,width:30,height:30}),/No signature ink/);assert.throws(()=>validateStoredSignature({...asset,hash:'changed'}),/integrity/);
});
test('PNG and multi-page PDF signature sources support page selection',async()=>{
 const source=scan().toBuffer('image/png'),png=await extractSignaturePages(source,'image/png');assert.equal(png.length,1);assert(png[0].suggestedCrop.width<600);
 const pdf=await PDFDocument.create(),image=await pdf.embedPng(source);pdf.addPage([600,300]).drawImage(image,{x:0,y:0,width:600,height:300});pdf.addPage([600,300]).drawText('Second page');const result=await extractSignaturePages(Buffer.from(await pdf.save()),'application/pdf');assert.equal(result.length,2);assert(result[0].image.startsWith('data:image/png;base64,'));
});
test('case builder, plot and authority aliases populate and image is embedded only after own-account approval',async()=>{
 const body='To,\n[Name of Builder / Developer]\n[Name of Project / Building]\n[Plot No. and Sector]\n[Node / Village, Navi Mumbai, Maharashtra]\n\nSubject: Plot [Plot Number], [Location].\nRespond within [specified number of days] days.\n[Authorised Officer]';
 const doc=buildDocument(c,{body,responseDays:15,reference:'TEST/118',recipients:[{}]},{Body:body});assert(!doc.entries[0].body.includes('['));assert.match(doc.entries[0].body,/Actual Test Builder/);assert.match(doc.entries[0].body,/Actual Test CCUC Name/);assert.match(doc.entries[0].body,/Plot No\. 118, Sector 4/);assert.equal(mergeBody('{{BuilderName}} - {{Authority_Name}}',doc.entries[0].fields),'Actual Test Builder - Actual Test CCUC Name');
 const legacy=buildDocument(c,{body,responseDays:null,reference:'TEST',recipients:[{}]},{Body:body},new Date(),{allowIncomplete:true});assert(legacy.needsRevision);assert.match(legacy.entries[0].body,/Actual Test Builder/);assert.match(legacy.entries[0].body,/Actual Test CCUC Name/);assert.match(legacy.entries[0].body,/response period not set/);
 const asset=await getAsset(),d={Content:JSON.stringify(doc),ReferenceNumber:'TEST',CreatedAt:new Date()};const signed=await applyHandwrittenSignature(d,officer,asset);assert.equal(signed.method,signatureImageMethod);assert.equal(signed.registeredImageHash,asset.hash);assert.notEqual(signed.imageHash,asset.hash);
 const pdf=await PDFDocument.load(signed.pdf);const images=pdf.getPages().flatMap(page=>{const x=page.node.Resources()?.lookup(PDFName.of('XObject'),PDFDict);return x?x.keys().filter(k=>x.lookup(k).dict?.get(PDFName.of('Subtype'))?.toString()==='/Image'):[];});assert.equal(images.length,1);
 const loading=getDocument({data:new Uint8Array(signed.pdf)}),parsed=await loading.promise;let text='';for(let i=1;i<=parsed.numPages;i++)text+=(await (await parsed.getPage(i)).getTextContent()).items.map(i=>i.str).join(' ');await loading.destroy();assert.match(text,/Actual Test CCUC Name/);assert.match(text,/Actual Test Builder/);assert.match(text,/118/);assert(!text.includes('Signature pending'));
 await assert.rejects(()=>applyHandwrittenSignature(d,{...officer,UserId:'other'},asset),/another CCUC/);await assert.rejects(()=>applyHandwrittenSignature(d,{...officer,RoleCode:'master'},asset),/Only CCUC/);await assert.rejects(()=>applyHandwrittenSignature(d,officer,{...asset,userId:'other'}),/another officer/);await assert.rejects(()=>applyHandwrittenSignature(d,officer,null),/No approved/);
 await assert.rejects(()=>applyHandwrittenSignature({...d,Content:body},officer,asset),/older draft/);
});
test('only CCUC can return reviewed notices for populated revisions',()=>{
 const row={AssignedCucId:'cuc',WorkflowStep:'notice-approval',CurrentStage:5,Status:'Awaiting approval'};assert.equal(transition(officer,row,'return-notice',{reason:'Fill the response period'},defaults).step,'notice-draft');assert.throws(()=>transition({UserId:'cuc',RoleCode:'cuc'},row,'return-notice',{reason:'x'},defaults),/role/);
 for(const role of ['surveyor','cuc','ccuc','legal'])assert.throws(()=>requireSignatureAdmin({RoleCode:role}),/Only the administrator/);requireSignatureAdmin({RoleCode:'master'});
});
test('admin signature endpoints enforce role, crop confirmation and concurrent profile checks using memory-only storage',async()=>{
 const secondId='abcdefab-2222-3333-4444-555555555555';const store=new Map(),users=[{UserId:officerId,Username:'first.ccuc',DisplayName:officer.DisplayName,RoleCode:'ccuc',IsActive:true},{UserId:secondId,Username:'second.ccuc',DisplayName:'Second CCUC',RoleCode:'ccuc',IsActive:true}],events=[];const OriginalRequest=sql.Request;
 class MemoryRequest{constructor(){this.args={};}input(name,_type,value){this.args[name]=value;return this;}async query(q){if(q.includes('SELECT u.UserId'))return {recordset:users.map(u=>({...u,Value:store.get('signature-image:'+u.UserId)||null}))};if(q.includes('SELECT Value'))return {recordset:store.has(this.args.key)?[{Value:store.get(this.args.key)}]:[]};if(q.includes('SELECT UserId FROM'))return {recordset:users.filter(u=>u.UserId===this.args.id)};if(q.includes('UPDATE enforcement.Settings')){store.set(this.args.key,this.args.value);return {recordset:[]};}if(q.includes('DELETE FROM enforcement.Settings')||q.includes('DELETE enforcement.Settings')){store.delete(this.args.key);return {recordset:[]};}throw new Error('Unexpected memory query');}}
 sql.Request=MemoryRequest;const pool={request:()=>new MemoryRequest()},app=express();app.use(express.json({limit:'8mb'}));app.use((req,_res,next)=>{req.user={UserId:req.headers['x-test-user']||officerId,DisplayName:officer.DisplayName,RoleCode:req.headers['x-test-role']||'ccuc'};next();});const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 registerSignatureImageRoutes(app,{getPool:async()=>pool,transaction:async(_p,fn)=>fn(pool),audit:async(...args)=>events.push(args),wrap});app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/workflow';
 const call=async(role,path,body,expected=200,actor=officerId)=>{const res=await fetch(url+path,{method:body?'POST':'GET',headers:{'x-test-role':role,'x-test-user':actor,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const json=await res.json();assert.equal(res.status,expected,JSON.stringify(json));return json;};
 try{for(const role of ['cuc','ccuc','surveyor','legal']){await call(role,'/signature-images',undefined,403);await call(role,'/signature-images/extract',{},403);await call(role,'/signature-images/preview',{},403);await call(role,'/signature-images',{userId:officerId},403);await call(role,`/signature-images/${officerId}/remove`,{reason:'x'},403);}
  const base64=scan().toBuffer('image/png').toString('base64'),body={base64,crop,userId:officerId,reason:'Confirm test crop',expectedHash:null,confirmed:true};await call('master','/signature-images',{...body,confirmed:false},400);const saved=await call('master','/signature-images',body);assert.equal(store.size,1);assert.equal(saved.signature.userId,officerId);await call('master','/signature-images',body,409);const status=await call('ccuc','/my-signature');assert(status.ready);assert(!status.image);const profile=await call('master','/signature-images/'+officerId);assert(profile.image);await call('ccuc','/signature-images/'+officerId,undefined,403);const second=await call('master','/signature-images',{...body,userId:secondId,cleanup:70,crop:{...crop,x:crop.x+1,width:crop.width-1}});assert.equal(store.size,2);assert.equal(second.signature.userId,secondId);assert.notEqual(second.signature.hash,profile.hash);
  const registry=await call('master','/signature-images');assert.equal(registry.filter(u=>u.signature).length,2);assert.equal(registry.find(u=>u.UserId===secondId).Username,'second.ccuc');assert.equal((await call('ccuc','/my-signature',undefined,200,secondId.toUpperCase())).hash,second.signature.hash);assert.equal((await call('ccuc','/my-signature')).hash,profile.hash);
  await call('master',`/signature-images/${officerId}/remove`,{reason:'Remove test crop',expectedHash:profile.hash});assert.equal(store.size,1);assert.equal((await call('ccuc','/my-signature')).ready,false);assert.equal((await call('ccuc','/my-signature',undefined,200,secondId)).hash,second.signature.hash);assert(events.length===3);
  const previous=store.get('signature-image:'+secondId);store.set('signature-image:'+secondId,JSON.stringify({...JSON.parse(previous),userId:officerId}));await call('ccuc','/my-signature',undefined,409,secondId);store.set('signature-image:'+secondId,previous);
 }finally{await new Promise(r=>server.close(r));sql.Request=OriginalRequest;}
});

