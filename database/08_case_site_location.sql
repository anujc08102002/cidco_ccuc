/* Run once against the existing EnforceFlow database after 01_enforceflow_schema.sql.
   This preserves the exact site position captured during case creation. */
USE EnforceFlow;
GO

IF COL_LENGTH(N'enforcement.Cases', N'Latitude') IS NULL
  ALTER TABLE enforcement.Cases ADD Latitude DECIMAL(10,7) NULL;
IF COL_LENGTH(N'enforcement.Cases', N'Longitude') IS NULL
  ALTER TABLE enforcement.Cases ADD Longitude DECIMAL(10,7) NULL;
IF COL_LENGTH(N'enforcement.Cases', N'SiteAddress') IS NULL
  ALTER TABLE enforcement.Cases ADD SiteAddress NVARCHAR(500) NULL;
IF COL_LENGTH(N'enforcement.Cases', N'LocationSource') IS NULL
  ALTER TABLE enforcement.Cases ADD LocationSource NVARCHAR(60) NULL;
IF COL_LENGTH(N'enforcement.Cases', N'LocationAccuracyMetres') IS NULL
  ALTER TABLE enforcement.Cases ADD LocationAccuracyMetres DECIMAL(10,2) NULL;
IF COL_LENGTH(N'enforcement.Cases', N'LocationCapturedAt') IS NULL
  ALTER TABLE enforcement.Cases ADD LocationCapturedAt DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Cases_SiteCoordinates')
  ALTER TABLE enforcement.Cases ADD CONSTRAINT CK_Cases_SiteCoordinates CHECK (
    (Latitude IS NULL AND Longitude IS NULL) OR
    (Latitude BETWEEN -90 AND 90 AND Longitude BETWEEN -180 AND 180)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Cases_SiteCoordinates' AND object_id=OBJECT_ID(N'enforcement.Cases'))
  CREATE INDEX IX_Cases_SiteCoordinates ON enforcement.Cases(Latitude, Longitude) WHERE Latitude IS NOT NULL;
GO
