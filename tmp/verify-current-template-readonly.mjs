// SELECT-only inspection. The preview files are local; no database writes occur.
import dotenv from 'dotenv';import sql from 'mssql';import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {buildDocument,readTemplate} from '../server/notice-model.js';import {pdfBytes} from '../server/notice-pdf.js';import {noticeContext} from '../server/notice-context.js';import {extractTemplate} from '../server/notice-import.js';
dotenv.config({quiet:true});const [server,port]=process.env.DB_SERVER.split(',');const p=await new sql.ConnectionPool({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}}).connect();
try{
 const t=(await p.request().query("SELECT TOP(1) * FROM enforcement.DocumentTemplates WHERE DocumentType='Notice' ORDER BY CreatedAt DESC")).recordset[0];
 const c=(await p.request().input('plot',sql.NVarChar,'118').query('SELECT TOP(1) * FROM enforcement.Cases WHERE PlotNumber=@plot ORDER BY CreatedAt DESC')).recordset[0];assert(c&&t,'Expected current notice case and template');
 const context=await noticeContext(p,c);c.NoticeAuthority=context.defaultAuthority||context.authorities[0];assert(c.NoticeAuthority);
 const source=readTemplate(t.Body);const d=buildDocument(c,{body:source.body,responseDays:15,reference:'LOCAL UNSAVED PREVIEW',recipients:[{}]},t);
 assert(d.entries[0].body.includes(c.OwnerName));assert(d.entries[0].body.includes('118'));assert(d.authority.name);assert(!d.entries[0].body.includes('{{'));assert.equal(d.responseDays,15);
 const bytes=await pdfBytes(d);await writeFile('tmp/current-template-populated.pdf',bytes);const rendered=await extractTemplate(bytes,'application/pdf');await writeFile('tmp/current-template-populated.png',Buffer.from(rendered.pages[0].image.split(',')[1],'base64'));
 console.log(JSON.stringify({passed:true,actualCaseAndTemplate:true,ownerFilled:true,plotFilled:true,authorityFilled:true,periodFilled:true,layoutMode:d.layoutMode,signaturePositionRetained:Boolean(d.signaturePlacement),pages:rendered.pages.length,databaseWrites:0}));
}finally{await p.close();}
