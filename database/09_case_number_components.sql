/* Run once against an existing EnforceFlow database.
   New case numbers use: CASE/YYYY/SURVEYOR-CUC-SECTOR-NODE-SEQUENCE. */
USE EnforceFlow;
GO

IF COL_LENGTH(N'enforcement.Cases', N'Sector') IS NULL
  ALTER TABLE enforcement.Cases ADD Sector NVARCHAR(80) NULL;
GO

/* Existing records predate sector capture; retain them and label the missing value. */
UPDATE enforcement.Cases SET Sector=N'Unspecified' WHERE Sector IS NULL;
GO

ALTER TABLE enforcement.Cases ALTER COLUMN Sector NVARCHAR(80) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Cases_NumberComponents' AND object_id=OBJECT_ID(N'enforcement.Cases'))
  CREATE INDEX IX_Cases_NumberComponents ON enforcement.Cases(AssignedSurveyorId, AssignedCucId, Sector, Node, CreatedAt);
GO
