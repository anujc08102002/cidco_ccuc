import test from 'node:test';
import assert from 'node:assert/strict';
import sql from 'mssql';
import {registerAdminCaseRoutes} from './admin-cases.js';

test('resource deletion accepts confirm, retains linked records and audits successful removal',async()=>{
 const OriginalTransaction=sql.Transaction,OriginalRequest=sql.Request;
 let linked=false,deleted=false,audited=false,committed=false,published=false;
 const id='12345678-1234-1234-1234-123456789abc';
 sql.Transaction=class{async begin(){} async commit(){committed=true;} async rollback(){}};
 sql.Request=class{
  input(){return this;}
  async query(query){
   if(query.startsWith('SELECT *'))return {recordset:[{TemplateId:id,Name:'Notice with invisible trailing space ',SerialNumber:'DRIVE/1'}]};
   if(query.startsWith('SELECT TOP'))return {recordset:linked?[{used:1}]:[]};
   assert(query.includes('INSERT enforcement.AuditLog'));audited=true;
   assert(/DELETE enforcement\.(DocumentTemplates|DrivePlans)/.test(query));deleted=true;
   return {recordset:[]};
  }
 };
 try{
  const routes={};const app={delete:(path,...handlers)=>routes[path]=handlers,patch(){},post(){},get(){}};
  registerAdminCaseRoutes(app,{getPool:async()=>({}),publishChange:()=>{published=true;},toUiCase:x=>x});
  const invoke=async(body,role='master',kind='templates')=>{
   const req={body,params:{kind,id},user:{RoleCode:role,UserId:id}};
   const res={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){}};
   const [guard,handler]=routes['/api/admin/resources/:kind/:id'];
   let allowed=false;guard(req,res,()=>{allowed=true;});
   if(allowed)await handler(req,res,e=>{throw e;});
   return res;
  };
  for(const body of [{},{confirmation:'Notice with invisible trailing space '},{confirmation:42},{confirmation:'wrong'}]){
   assert.equal((await invoke(body)).code,400);assert.equal(deleted,false);
  }
  assert.equal((await invoke({confirmation:'confirm'},'cuc')).code,403);
  linked=true;assert.equal((await invoke({confirmation:'confirm'})).code,409);assert.equal(deleted,false);
  linked=false;
  assert.equal((await invoke({confirmation:'confirm'})).code,204);
  assert(deleted&&audited&&committed&&published);
  assert.equal((await invoke({confirmation:' CONFIRM '},'master','drives')).code,204);
 }finally{sql.Transaction=OriginalTransaction;sql.Request=OriginalRequest;}
});
