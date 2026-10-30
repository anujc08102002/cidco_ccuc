import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sql from 'mssql';
import {registerWorkflowRoutes} from './enforcement-workflow.js';

test('closure stores its final report atomically; scoped downloads return the saved bytes',async()=>{
 const actor='11111111-1111-1111-1111-111111111111',caseId='22222222-2222-2222-2222-222222222222';
 let c={CaseId:caseId,CaseNumber:'CASE/TEST/1',RowVersion:Buffer.from('0102','hex'),Status:'In progress',CurrentStage:8,WorkflowStep:'closure',AssignedCucId:actor,AssignedSurveyorId:actor,Node:'Test',PropertyReference:'Test site',OwnerName:'Test owner',IsArchived:false,LegalHold:false};
 let reports=[],audits=[],actions=[],failReport=false,rolledBack=0;
 const OriginalRequest=sql.Request,OriginalTransaction=sql.Transaction;
 class MemoryTransaction{async begin(){this.before={c:{...c},reports:[...reports],audits:[...audits],actions:[...actions]};}async commit(){}async rollback(){({c,reports,audits,actions}=this.before);rolledBack++;}}
 class MemoryRequest{
  constructor(){this.args={};}input(k,_type,v){this.args[k]=v;return this;}
  async query(q){
   if(q.includes('FROM enforcement.Cases c')&&q.includes('c.CaseNumber=@key')){
    assert(q.includes("@role='master'"));assert(q.includes('AssignedSurveyorId=@actor'));assert(q.includes('AssignedCucId=@actor'));
    return {recordset:this.args.key===c.CaseNumber&&(this.args.role==='master'||['cuc','surveyor'].includes(this.args.role)&&this.args.actor===actor||['legal','ccuc'].includes(this.args.role))?[{...c}]:[]};
   }
   if(q.includes("SettingKey='deadlines'"))return {recordset:[]};
   if(q.includes('AS Pending'))return {recordset:[{Pending:0,Done:1,Published:1}]};
   if(q.startsWith('UPDATE enforcement.Cases SET WorkflowStep')){c={...c,Status:this.args.status,WorkflowStep:this.args.step,ClosedAt:new Date(),RowVersion:Buffer.from('0304','hex')};return {recordset:[]};}
   if(q.startsWith('INSERT enforcement.CaseActions')){actions.push({ActionType:this.args.action,Notes:this.args.notes});return {recordset:[]};}
   if(q.startsWith('INSERT enforcement.AuditLog')){audits.push({EventType:this.args.event,Detail:this.args.detail});return {recordset:[]};}
   if(q.startsWith('INSERT enforcement.Documents')){if(failReport)throw Error('Test report storage unavailable');reports.push({FileContent:this.args.bytes,ApprovalState:this.args.state});return {recordset:[]};}
   if(q.includes("DocumentType='CaseReport'")){assert(q.includes("ApprovalState='FinalReport'"));return {recordset:reports.filter(r=>r.ApprovalState==='FinalReport').slice(-1)};}
   if(q.startsWith('SELECT')&&q.includes('enforcement.CaseActions'))return {recordset:actions};
   if(q.startsWith('SELECT')&&q.includes('enforcement.AuditLog')&&!q.includes('CcucCaseApproved'))return {recordset:audits};
   if(q.startsWith('SELECT'))return {recordset:[]};
   throw Error('Unexpected memory query: '+q);
  }
 }
 sql.Request=MemoryRequest;sql.Transaction=MemoryTransaction;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={UserId:req.headers['x-test-actor']||actor,RoleCode:req.headers['x-test-role']||'cuc',DisplayName:'Test officer'};next();});
 registerWorkflowRoutes(app,{getPool:async()=>({request:()=>new MemoryRequest()}),publishChange:()=>{},toUiCase:row=>({id:row.CaseNumber,status:row.Status,property:row.PropertyReference,owner:row.OwnerName,node:row.Node,stage:'8. Closure',legal:false})});
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/workflow/cases/${encodeURIComponent(c.CaseNumber)}`;
 const close=()=>fetch(base+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close',reason:'Test completion reason',rowVersion:'0102'})});
 try{
  failReport=true;assert.equal((await close()).status,500);assert.equal(c.Status,'In progress');assert.equal(actions.length,0);assert.equal(reports.length,0);assert.equal(audits.length,0);assert.equal(rolledBack,1);
  failReport=false;assert.equal((await close()).status,200);assert.equal(c.Status,'Closed');assert.equal(reports.length,1);assert.equal(reports[0].ApprovalState,'FinalReport');assert(audits.some(a=>a.EventType==='SiteReportGenerated'&&JSON.parse(a.Detail).sha256.length===64));
  const response=await fetch(base+'/report');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.deepEqual(Buffer.from(await response.arrayBuffer()),reports[0].FileContent);assert.equal(reports.length,1);
  assert.equal((await fetch(base+'/report',{headers:{'x-test-role':'surveyor','x-test-actor':caseId}})).status,404);
  assert.equal((await fetch(base.replace('CASE%2FTEST%2F1','other-case')+'/report')).status,404);
 }finally{await new Promise(r=>server.close(r));sql.Request=OriginalRequest;sql.Transaction=OriginalTransaction;}
});
