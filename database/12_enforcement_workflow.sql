/* Additive migration. Run against the configured database; existing numbers are preserved. */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF COL_LENGTH('enforcement.Cases','ConstructionType') IS NULL
 ALTER TABLE enforcement.Cases ADD ConstructionType NVARCHAR(160) NULL;
GO
IF COL_LENGTH('enforcement.Cases','PlotNumber') IS NULL
 ALTER TABLE enforcement.Cases ADD PlotNumber NVARCHAR(80) NULL, Village NVARCHAR(160) NULL,
 WorkflowStep NVARCHAR(40) NULL, StageStartedAt DATETIME2 NULL, EscalatedAt DATETIME2 NULL, ClosedAt DATETIME2 NULL;
GO
IF OBJECT_ID('enforcement.ReportingLinks') IS NULL
 CREATE TABLE enforcement.ReportingLinks (
  UserId UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId),
  AuthorityId UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId),
  Node NVARCHAR(80) NOT NULL, PRIMARY KEY(UserId,AuthorityId,Node));
IF OBJECT_ID('enforcement.Settings') IS NULL
 CREATE TABLE enforcement.Settings (SettingKey NVARCHAR(80) PRIMARY KEY, Value NVARCHAR(MAX) NOT NULL,
 UpdatedBy UNIQUEIDENTIFIER NULL REFERENCES enforcement.Users(UserId), UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF COL_LENGTH('enforcement.Documents','Content') IS NULL
 ALTER TABLE enforcement.Documents ADD Content NVARCHAR(MAX) NULL, FileContent VARBINARY(MAX) NULL,
 MimeType NVARCHAR(100) NULL, ApprovalState NVARCHAR(30) NOT NULL DEFAULT 'Draft',
 ApprovedBy UNIQUEIDENTIFIER NULL REFERENCES enforcement.Users(UserId), ApprovedAt DATETIME2 NULL,
 IssuedAt DATETIME2 NULL, SupersedesId UNIQUEIDENTIFIER NULL REFERENCES enforcement.Documents(DocumentId),
 ChangeReason NVARCHAR(1000) NULL;
GO
IF COL_LENGTH('enforcement.Hearings','NoticeId') IS NULL
 ALTER TABLE enforcement.Hearings ADD NoticeId UNIQUEIDENTIFIER NULL REFERENCES enforcement.Documents(DocumentId),
 CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME();
GO
IF COL_LENGTH('enforcement.LegalUpdates','Source') IS NULL
 ALTER TABLE enforcement.LegalUpdates ADD Source NVARCHAR(160) NULL,
 RestrictsEnforcement BIT NOT NULL DEFAULT 0, ClearanceReason NVARCHAR(1000) NULL;
GO
IF OBJECT_ID('enforcement.CaseReferences') IS NULL
 CREATE TABLE enforcement.CaseReferences (
 ReferenceId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
 CaseId UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Cases(CaseId),
 Source NVARCHAR(80) NOT NULL, ReferenceNumber NVARCHAR(80) NOT NULL, ReferenceDate DATE NOT NULL,
 Status NVARCHAR(30) NOT NULL, Details NVARCHAR(MAX) NULL, Response NVARCHAR(MAX) NULL, RespondedAt DATE NULL,
 DocumentId UNIQUEIDENTIFIER NULL REFERENCES enforcement.Documents(DocumentId),
 CreatedBy UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId), CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('enforcement.DrivePlans') IS NULL
 CREATE TABLE enforcement.DrivePlans (
 DriveId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(), SerialNumber NVARCHAR(80) NOT NULL UNIQUE,
 PlannedAt DATETIME2 NOT NULL, Node NVARCHAR(80) NOT NULL, Details NVARCHAR(MAX) NOT NULL,
 CreatedBy UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId), CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF COL_LENGTH('enforcement.DemolitionDrives','DriveId') IS NULL
 ALTER TABLE enforcement.DemolitionDrives ADD DriveId UNIQUEIDENTIFIER NULL REFERENCES enforcement.DrivePlans(DriveId);
GO
IF OBJECT_ID('enforcement.ChargeTransfers') IS NULL
 CREATE TABLE enforcement.ChargeTransfers (
 TransferId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(), CaseId UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Cases(CaseId),
 FromUserId UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId), ToUserId UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId),
 AuthorizedBy UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId), Reason NVARCHAR(1000) NOT NULL,
 StartsAt DATETIME2 NOT NULL, EndsAt DATETIME2 NOT NULL, CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Cases_Deadline' AND object_id=OBJECT_ID('enforcement.Cases'))
 CREATE INDEX IX_Cases_Deadline ON enforcement.Cases(NextActionAt) INCLUDE(Status,AssignedCucId,Node,EscalatedAt) WHERE IsArchived=0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_References_Case' AND object_id=OBJECT_ID('enforcement.CaseReferences'))
 CREATE INDEX IX_References_Case ON enforcement.CaseReferences(CaseId,Source);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Documents_CaseVersion' AND object_id=OBJECT_ID('enforcement.Documents'))
 CREATE INDEX IX_Documents_CaseVersion ON enforcement.Documents(CaseId,DocumentType,VersionNumber);
GO
IF OBJECT_ID('enforcement.DocumentTemplates') IS NULL
 CREATE TABLE enforcement.DocumentTemplates (
 TemplateId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
 Name NVARCHAR(160) NOT NULL, DocumentType NVARCHAR(20) NOT NULL CHECK(DocumentType IN ('Notice','Order')),
 Body NVARCHAR(MAX) NOT NULL, ApprovalReference NVARCHAR(250) NOT NULL,
 CreatedBy UNIQUEIDENTIFIER NOT NULL REFERENCES enforcement.Users(UserId), CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF COL_LENGTH('enforcement.Documents','TemplateId') IS NULL
 ALTER TABLE enforcement.Documents ADD TemplateId UNIQUEIDENTIFIER NULL REFERENCES enforcement.DocumentTemplates(TemplateId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Cases_PropertyPlot' AND object_id=OBJECT_ID('enforcement.Cases'))
 CREATE INDEX IX_Cases_PropertyPlot ON enforcement.Cases(Node,PlotNumber) INCLUDE(LegalHold);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Cases_PropertySurvey' AND object_id=OBJECT_ID('enforcement.Cases'))
 CREATE INDEX IX_Cases_PropertySurvey ON enforcement.Cases(Node,Village,SurveyReference) INCLUDE(LegalHold);
