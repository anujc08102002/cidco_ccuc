import dotenv from 'dotenv';
import sql from 'mssql';
import assert from 'node:assert/strict';
import {issueSession} from '../server/sessions.js';
dotenv.config({quiet:true});
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await new sql.ConnectionPool({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}}).connect();
try{
 const users=(await pool.request().query('SELECT * FROM enforcement.Users WHERE IsActive=1 AND MustChangePassword=0')).recordset;
 const master=users.find(u=>u.RoleCode==='master');assert(master);
 const call=async(user,path,method='GET',body)=>{const response=await fetch('http://localhost:3001/api'+path,{method,headers:{Authorization:'Bearer '+issueSession(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json().catch(()=>null)};};
 const admin=await call(master,'/ui/cases?includeArchived=1');assert.equal(admin.status,200,JSON.stringify(admin.body));
 const archived=admin.body.find(c=>c.archived);let rolesChecked=0;
 for(const role of ['surveyor','cuc','ccuc','legal']){const user=users.find(u=>u.RoleCode===role);if(!user)continue;const result=await call(user,'/ui/cases?includeArchived=1');assert.equal(result.status,200);assert(!result.body.some(c=>c.archived));if(archived)assert.equal((await call(user,'/workflow/cases/'+encodeURIComponent(archived.caseKey))).status,404);rolesChecked++;}
 const templates=await call(master,'/workflow/templates');assert.equal(templates.status,200);
 if(templates.body.length){const t=templates.body[0];const result=await call(master,'/admin/resources/templates/'+t.TemplateId,'DELETE',{confirmation:'wrong'});assert.equal(result.status,400);assert.equal(result.body.error,'Type confirm to confirm deletion.');}
 console.log(JSON.stringify({passed:true,liveApi:true,nonAdminRolesChecked:rolesChecked,archivedDetailChecked:Boolean(archived),deletionConfirmationUpdated:templates.body.length>0,noRecordsDeletedOrEdited:true}));
}finally{await pool.close();}
