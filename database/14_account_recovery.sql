-- Add official contact email without inventing addresses for existing staff.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF COL_LENGTH('enforcement.Users','Email') IS NULL
 ALTER TABLE enforcement.Users ADD Email NVARCHAR(254) NULL;
GO
