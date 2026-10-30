/* Preserve all submitted survey fields. Leave previously unsaved data unknown. */
IF COL_LENGTH(N'enforcement.Cases',N'Priority') IS NULL
 ALTER TABLE enforcement.Cases ADD Priority NVARCHAR(20) NULL;
IF COL_LENGTH(N'enforcement.Cases',N'ViolationDescription') IS NULL
 ALTER TABLE enforcement.Cases ADD ViolationDescription NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'enforcement.Cases',N'ApplicableSections') IS NULL
 ALTER TABLE enforcement.Cases ADD ApplicableSections NVARCHAR(80) NULL;
