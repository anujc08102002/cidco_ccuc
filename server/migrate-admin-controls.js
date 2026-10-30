import dotenv from 'dotenv';
import sql from 'mssql';
import {readFileSync} from 'node:fs';
dotenv.config();
const [server,port]=process.env.DB_SERVER.split(',');
const pool=await sql.connect({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}});
try{await pool.request().batch(readFileSync('database/10_admin_case_controls.sql','utf8'));console.log('Administrator archive columns are ready.');}finally{await pool.close();}
