import dotenv from 'dotenv';
import sql from 'mssql';
import {readFileSync} from 'node:fs';
dotenv.config();
const [server,port]=process.env.DB_SERVER.split(',');
const p=await new sql.ConnectionPool({server,port:port?Number(port):undefined,database:process.env.DB_DATABASE,user:process.env.DB_USER,password:process.env.DB_PASSWORD,options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}}).connect();
try{for(const batch of readFileSync('database/12_enforcement_workflow.sql','utf8').split(/^GO\s*$/mi))if(batch.trim())await p.request().batch(batch);console.log('Additive enforcement workflow migration applied.');}finally{await p.close();}
