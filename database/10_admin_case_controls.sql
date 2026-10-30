/* Add administrator archive controls without changing existing cases. */
IF COL_LENGTH(N'enforcement.Cases',N'IsArchived') IS NULL
 ALTER TABLE enforcement.Cases ADD IsArchived BIT NOT NULL CONSTRAINT DF_Cases_IsArchived DEFAULT 0;
IF COL_LENGTH(N'enforcement.Cases',N'ArchivedAt') IS NULL
 ALTER TABLE enforcement.Cases ADD ArchivedAt DATETIME2 NULL;
IF COL_LENGTH(N'enforcement.Cases',N'ArchiveUntil') IS NULL
 ALTER TABLE enforcement.Cases ADD ArchiveUntil DATETIME2 NULL;
IF COL_LENGTH(N'enforcement.Cases',N'ArchiveReason') IS NULL
 ALTER TABLE enforcement.Cases ADD ArchiveReason NVARCHAR(1000) NULL;
IF COL_LENGTH(N'enforcement.Cases',N'ArchivedByUserId') IS NULL
 ALTER TABLE enforcement.Cases ADD ArchivedByUserId UNIQUEIDENTIFIER NULL;
