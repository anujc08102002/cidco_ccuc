// Read-only live checks. No recovery requests, password resets or emails are issued.
import dotenv from 'dotenv';
import sql from 'mssql';
import {issueSession} from './sessions.js';
dotenv.config({quiet:true});
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
try{
 const accounts=(await pool.request().query("SELECT * FROM enforcement.Users WHERE IsActive=1 AND IsDeleted=0 AND MustChangePassword=0 ORDER BY CASE WHEN RoleCode='master' THEN 0 ELSE 1 END")).recordset;
 const admin=accounts.find(u=>u.RoleCode==='master');if(!admin)throw Error('An active administrator is needed for read-only validation.');
 const checks=[];
 for(const user of [admin,accounts.find(u=>u.RoleCode!=='master')].filter(Boolean)){
  const headers={Authorization:'Bearer '+issueSession(user)},base='http://localhost:3001/api';
  const read=async path=>{const r=await fetch(base+path,{headers});return {status:r.status,data:await r.json()};};
  const push=await read('/me/push/config');
  const notices=await read('/me/notifications'),attention=await read('/me/attention'),directory=await read('/users'),mail=await read('/admin/mail-status');
  const isAdmin=user.RoleCode==='master';
  checks.push({administrator:isAdmin,pushConfig:push.status,pushKeyAvailable:typeof push.data.publicKey==='string'&&push.data.publicKey.length===87&&!Object.hasOwn(push.data,'privateKey'),notifications:notices.status,attention:attention.status,directory:directory.status,mailStatus:mail.status,notificationShape:Array.isArray(notices.data)&&notices.data.every(n=>isAdmin||n.kind==='account'),attentionShape:Array.isArray(attention.data),emailVisibility:Array.isArray(directory.data)&&directory.data.every(u=>isAdmin?Object.hasOwn(u,'email'):!Object.hasOwn(u,'email')),smtpConfigured:isAdmin?mail.data.configured:undefined});
 }
 const unauthorized=await fetch('http://localhost:3001/api/me/notifications');
 console.log(JSON.stringify({checks,unauthorized:unauthorized.status,productionDataMutation:false,emailsSent:0}));
 if(unauthorized.status!==401||checks.some(c=>c.pushConfig!==200||!c.pushKeyAvailable||c.notifications!==200||c.attention!==200||c.directory!==200||c.mailStatus!==(c.administrator?200:403)||!c.notificationShape||!c.attentionShape||!c.emailVisibility))process.exitCode=1;
}finally{await pool.close();}
