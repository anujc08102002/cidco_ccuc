import dotenv from 'dotenv';
import sql from 'mssql';
dotenv.config();
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
try {
 const result=await pool.request().query(`SELECT c.CaseNumber,c.CurrentStage,c.Status,c.Latitude,c.Longitude,u.RoleCode AS AssignedRole,c.LegalHold FROM enforcement.Cases c LEFT JOIN enforcement.Users u ON u.UserId=c.AssignedCucId; SELECT ActionType,Stage FROM enforcement.CaseActions;`);
 console.log(JSON.stringify(result.recordsets));
} finally {await pool.close();}
