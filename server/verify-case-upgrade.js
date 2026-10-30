// Read-only integration checks; no accounts, cases, permissions, or credentials are modified.
import dotenv from 'dotenv';
import sql from 'mssql';
import {issueSession,readSession} from './sessions.js';
dotenv.config();
const base='http://localhost:'+ (process.argv[2]||'3001')+'/api';
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
try{
 const data=await pool.request().query("SELECT TOP 1 * FROM enforcement.Users WHERE IsActive=1 AND MustChangePassword=0 ORDER BY CASE WHEN RoleCode='master' THEN 0 ELSE 1 END; SELECT COUNT(*) AS Cases,COUNT(Latitude) AS WithLatitude,COUNT(Longitude) AS WithLongitude FROM enforcement.Cases;");
 const user=data.recordsets[0][0];if(!user)throw new Error('No active non-temporary account is available for read-only session validation.');
 const token=issueSession(user),headers={Authorization:'Bearer '+token};
 const session=await fetch(base+'/auth/session',{headers});
 const cases=await fetch(base+'/ui/cases',{headers});
 const rows=await cases.json();
 const unauthorized=await fetch(base+'/ui/cases');
 const invalid=readSession(token.slice(0,-2)+'xx');
 const controller=new AbortController();
 const stream=await fetch(base+'/events',{headers,signal:controller.signal});
 const initial=await stream.body.getReader().read();controller.abort();
 const result={sessionStatus:session.status,casesStatus:cases.status,caseCount:Array.isArray(rows)?rows.length:null,coordinateCounts:data.recordsets[1][0],uuidReferencesRemoved:Array.isArray(rows)?rows.every(row=>!/^CASE\/[0-9a-f]{8}-/i.test(row.id)):false,unauthorizedStatus:unauthorized.status,tamperedTokenRejected:invalid===null,liveStreamStatus:stream.status,liveEventReceived:new TextDecoder().decode(initial.value).includes('data: connected\n\n')};
 console.log(JSON.stringify(result));
 if(result.sessionStatus!==200||result.casesStatus!==200||result.unauthorizedStatus!==401||!result.tamperedTokenRejected||!result.uuidReferencesRemoved||!result.liveEventReceived)process.exitCode=1;
}finally{await pool.close();}
