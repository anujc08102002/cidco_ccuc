import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sql from 'mssql';
import {registerWorkflowRoutes} from './enforcement-workflow.js';
import {defaultNoticeBody} from './notice-model.js';

test('saved template updates enforce administrator access, revision checks and stable identity in memory',async()=>{
 const id='11111111-1111-1111-1111-111111111111';
 let saved={TemplateId:id,Name:'Notice',DocumentType:'Notice',Body:defaultNoticeBody,ApprovalReference:'TEST',CreatedAt:new Date()},audits=0;
 const OriginalRequest=sql.Request,OriginalTransaction=sql.Transaction;
 class MemoryRequest{
  constructor(){this.args={};}input(k,_type,v){this.args[k]=v;return this;}
  async query(q){
   if(q.startsWith('SELECT')&&q.includes('enforcement.DocumentTemplates'))return {recordset:[{...saved}]};
   if(q.startsWith('UPDATE enforcement.DocumentTemplates')){saved={...saved,Name:this.args.name,Body:this.args.body,ApprovalReference:this.args.approval};return {recordset:[]};}
   if(q.startsWith('INSERT enforcement.AuditLog')){audits++;return {recordset:[]};}
   throw Error('Unexpected memory query: '+q);
  }
 }
 sql.Request=MemoryRequest;sql.Transaction=class{async begin(){}async commit(){}async rollback(){}};
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={UserId:id,RoleCode:req.headers['x-test-role']||'cuc'};next();});
 registerWorkflowRoutes(app,{getPool:async()=>({request:()=>new MemoryRequest()}),publishChange:()=>{},toUiCase:c=>c});
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/workflow/templates';
 const call=async(role,body,expected=200)=>{const r=await fetch(url+(body?'/'+id:''),{method:body?'PATCH':'GET',headers:{'Content-Type':'application/json','x-test-role':role},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result;};
 try{
  const before=(await call('cuc'))[0],body={name:'Adjusted notice',type:'Notice',body:JSON.stringify({format:'cidco-template-v2',body:defaultNoticeBody,responseDays:15,pages:[]}),approvalReference:'UPDATED',expectedRevision:before.Revision};
  for(const role of ['cuc','ccuc','surveyor','legal'])await call(role,body,403);
  await call('master',{...body,expectedRevision:'stale'},409);assert.equal(saved.Body,defaultNoticeBody);
  await call('master',{...body,type:'Order'},400);
  const result=await call('master',body);assert.equal(saved.TemplateId,id);assert.equal(saved.Body,body.body);assert.notEqual(result.Revision,before.Revision);assert.equal(audits,1);
  await call('master',body,409);assert.equal(audits,1);assert.equal((await call('cuc'))[0].Revision,result.Revision);
 }finally{await new Promise(r=>server.close(r));sql.Request=OriginalRequest;sql.Transaction=OriginalTransaction;}
});
