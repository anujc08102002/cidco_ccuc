-- Account deletion revokes access and removes directory entries without erasing historical authorship.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF COL_LENGTH('enforcement.Users','IsDeleted') IS NULL
 ALTER TABLE enforcement.Users ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Users_IsDeleted DEFAULT 0,
 DeletedAt DATETIME2 NULL;
GO
