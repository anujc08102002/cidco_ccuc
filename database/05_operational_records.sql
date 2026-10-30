/* Run once after 01_enforceflow_schema.sql. Stores dynamic records for all operational screens. */
USE EnforceFlow;
GO
IF OBJECT_ID(N'enforcement.OperationalRecords', N'U') IS NULL
BEGIN
  CREATE TABLE enforcement.OperationalRecords (
    RecordId UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Category NVARCHAR(40) NOT NULL,
    Reference NVARCHAR(80) NOT NULL,
    Title NVARCHAR(250) NOT NULL,
    Details NVARCHAR(MAX) NULL,
    Status NVARCHAR(40) NOT NULL DEFAULT N'Open',
    DueAt DATETIME2 NULL,
    AssignedUserId UNIQUEIDENTIFIER NULL,
    CreatedByUserId UNIQUEIDENTIFIER NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RowVersion ROWVERSION,
    CONSTRAINT UQ_OperationalRecords_CategoryReference UNIQUE(Category, Reference),
    CONSTRAINT FK_OperationalRecords_Assigned FOREIGN KEY (AssignedUserId) REFERENCES enforcement.Users(UserId),
    CONSTRAINT FK_OperationalRecords_CreatedBy FOREIGN KEY (CreatedByUserId) REFERENCES enforcement.Users(UserId)
  );
  CREATE INDEX IX_OperationalRecords_Category ON enforcement.OperationalRecords(Category, UpdatedAt DESC);
END;
GO
CREATE OR ALTER TRIGGER enforcement.TR_OperationalRecords_UpdatedAt ON enforcement.OperationalRecords AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE r SET UpdatedAt=SYSUTCDATETIME() FROM enforcement.OperationalRecords r INNER JOIN inserted i ON r.RecordId=i.RecordId;
END;
GO
