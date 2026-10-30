// Read-only checks against the running API and configured SQL database.
import dotenv from 'dotenv';
import sql from 'mssql';
import {issueSession} from './sessions.js';
dotenv.config({quiet:true});
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
try {
 const user=(await pool.request().query("SELECT TOP 1 * FROM enforcement.Users WHERE IsActive=1 AND IsDeleted=0 AND MustChangePassword=0 ORDER BY CASE WHEN RoleCode='master' THEN 0 ELSE 1 END")).recordset[0];
 if(!user)throw new Error('An active account is required for read-only validation.');
 const headers={Authorization:'Bearer '+issueSession(user)},base='http://localhost:3001/api';
 const session=await fetch(base+'/auth/session',{headers});
 const sessionData=await session.json();
 const workspace=await fetch(base+'/me/workspace',{headers});
 const prefs=await workspace.json();
 const continuity=await fetch(base+'/me/continuity',{headers});
 const data=await continuity.json();
 const unauthorized=await fetch(base+'/me/workspace');
 const checks={session:session.status,workspace:workspace.status,continuity:continuity.status,unauthorized:unauthorized.status,identityAvailable:JSON.stringify(sessionData).includes(user.UserId),personalSettingsAvailable:!!prefs.preferences?.accent,revisionAvailable:typeof prefs.revision==='string',continuityAvailable:Array.isArray(data.records)&&Array.isArray(data.options)&&data.thresholdDays===15,productionDataMutation:false};
 console.log(JSON.stringify(checks));
 if(checks.session!==200||checks.workspace!==200||checks.continuity!==200||checks.unauthorized!==401||!checks.identityAvailable||!checks.personalSettingsAvailable||!checks.revisionAvailable||!checks.continuityAvailable)process.exitCode=1;
} finally {await pool.close();}
