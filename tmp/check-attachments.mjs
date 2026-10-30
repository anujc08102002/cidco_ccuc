import {createSiteReport} from '../server/site-report.js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const r=await createSiteReport({case:{id:'TEST',status:'Closed'}});const task=getDocument({data:Uint8Array.from(r.bytes)}),d=await task.promise;const a=await d.getAttachments();console.log(a);console.log(a?.constructor?.name);console.log(Object.values(a).map(v=>({filename:v.filename,keys:Object.keys(v)})));await task.destroy();


