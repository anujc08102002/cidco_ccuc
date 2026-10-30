/* OPTIONAL sample data. Run only if you want tutorial/demo records in a non-production database. */
USE EnforceFlow;
GO
IF NOT EXISTS (SELECT 1 FROM enforcement.Users WHERE Username=N'surveyor.demo')
INSERT INTO enforcement.Users (Username,DisplayName,PasswordHash,RoleCode,IsActive)
VALUES (N'surveyor.demo',N'R. Patil',CONVERT(VARCHAR(128),HASHBYTES('SHA2_512',N'SurveyDemo@2026'),2),N'surveyor',1);
GO
IF NOT EXISTS (SELECT 1 FROM enforcement.Cases WHERE CaseNumber=N'DEMO/26/001')
INSERT INTO enforcement.Cases (CaseNumber,PropertyReference,Node,OwnerName,SurveyReference,CurrentStage,Status,LegalHold,NoticeReference)
VALUES (N'DEMO/26/001',N'Plot 91, Sector 2',N'Kharghar',N'Demo Owner',N'SRV/26/048',2,N'In progress',0,N'Draft');
GO
IF NOT EXISTS (SELECT 1 FROM enforcement.OperationalRecords WHERE Category=N'surveys' AND Reference=N'SRV/26/048')
INSERT INTO enforcement.OperationalRecords (Category,Reference,Title,Details,Status,DueAt)
VALUES (N'surveys',N'SRV/26/048',N'Plot 91, Sector 2',N'Initial sample survey record',N'Submitted to CUC',SYSUTCDATETIME());
GO
