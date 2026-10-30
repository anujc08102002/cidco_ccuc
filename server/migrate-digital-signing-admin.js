import dotenv from 'dotenv';
import sql from 'msnodesqlv8';

dotenv.config({override:true});

const connection=`Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER};Database=${process.env.DB_DATABASE};Trusted_Connection=Yes;Encrypt=no`;
const database=await sql.promises.open(connection);

try{
 await database.promises.query(`
  IF COL_LENGTH('enforcement.Documents','DigitalSignatureHash') IS NULL
   ALTER TABLE enforcement.Documents ADD DigitalSignatureHash VARBINARY(32) NULL,
   SignedByUserId UNIQUEIDENTIFIER NULL REFERENCES enforcement.Users(UserId),
   SignedAt DATETIME2 NULL,
   SignatureMethod NVARCHAR(80) NULL;
 `);
 await database.promises.query(`
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Documents_DigitalSignature' AND object_id=OBJECT_ID('enforcement.Documents'))
   CREATE INDEX IX_Documents_DigitalSignature ON enforcement.Documents(SignedByUserId,SignedAt) WHERE SignedAt IS NOT NULL;
 `);
 console.log('Digital signing migration applied with Windows-integrated authentication.');
}finally{
 await database.promises.close();
}
