/* Add in-application digital signing metadata for issued notices and orders. */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF COL_LENGTH('enforcement.Documents','DigitalSignatureHash') IS NULL
 ALTER TABLE enforcement.Documents ADD DigitalSignatureHash VARBINARY(32) NULL,
 SignedByUserId UNIQUEIDENTIFIER NULL REFERENCES enforcement.Users(UserId),
 SignedAt DATETIME2 NULL,
 SignatureMethod NVARCHAR(80) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Documents_DigitalSignature' AND object_id=OBJECT_ID('enforcement.Documents'))
 CREATE INDEX IX_Documents_DigitalSignature ON enforcement.Documents(SignedByUserId,SignedAt) WHERE SignedAt IS NOT NULL;
GO
