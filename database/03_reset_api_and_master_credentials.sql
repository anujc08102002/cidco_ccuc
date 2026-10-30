/* Run in SSMS with Windows Authentication. Set both values before execution. */
USE master;
GO
DECLARE @ApiPassword NVARCHAR(200) = N'REPLACE_WITH_THE_PASSWORD_IN_DOTENV';
ALTER LOGIN enforceflow_api WITH PASSWORD = @ApiPassword;
GO

USE EnforceFlow;
GO
DECLARE @MasterPassword NVARCHAR(200) = N'REPLACE_WITH_A_NEW_MASTER_PORTAL_PASSWORD';
UPDATE enforcement.Users
SET DisplayName = N'Master Administrator',
    PasswordHash = CONVERT(VARCHAR(128), HASHBYTES('SHA2_512', @MasterPassword), 2),
    RoleCode = N'master',
    IsActive = 1
WHERE Username = N'masteradmin';

IF @@ROWCOUNT = 0
  INSERT INTO enforcement.Users (Username, DisplayName, PasswordHash, RoleCode, IsActive)
  VALUES (N'masteradmin', N'Master Administrator', CONVERT(VARCHAR(128), HASHBYTES('SHA2_512', @MasterPassword), 2), N'master', 1);
GO
