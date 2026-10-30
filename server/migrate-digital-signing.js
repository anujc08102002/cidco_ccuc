import dotenv from 'dotenv';
import sql from 'mssql';

dotenv.config({override:true});

const [server,port]=process.env.DB_SERVER.split(',');
const pool=await new sql.ConnectionPool({
 server,
 port:Number(port),
 database:process.env.DB_DATABASE,
 user:process.env.DB_USER,
 password:process.env.DB_PASSWORD,
 options:{encrypt:process.env.DB_ENCRYPT!=='false',trustServerCertificate:process.env.DB_TRUST_CERTIFICATE==='true'}
}).connect();

try{
 await pool.request().query(`
  IF COL_LENGTH('enforcement.Documents','DigitalSignatureHash') IS NULL
   ALTER TABLE enforcement.Documents ADD DigitalSignatureHash VARBINARY(32) NULL,
   SignedByUserId UNIQUEIDENTIFIER NULL REFERENCES enforcement.Users(UserId),
   SignedAt DATETIME2 NULL,
   SignatureMethod NVARCHAR(80) NULL;
 `);
 try{
  await pool.request().query(`
   IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Documents_DigitalSignature' AND object_id=OBJECT_ID('enforcement.Documents'))
    CREATE INDEX IX_Documents_DigitalSignature ON enforcement.Documents(SignedByUserId,SignedAt) WHERE SignedAt IS NOT NULL;
  `);
 }catch(error){
  console.warn(`Digital signing index was not created: ${error.message}`);
 }
 console.log('Digital signing migration applied.');
}finally{
 await pool.close();
}
