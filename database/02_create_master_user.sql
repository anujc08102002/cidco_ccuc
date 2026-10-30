/* Run once in SSMS after 01_enforceflow_schema.sql. Replace both passwords before execution. */
USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'enforceflow_api')
  CREATE LOGIN enforceflow_api WITH PASSWORD = 'Replace-This-API-Password-2026!', CHECK_POLICY = ON;
GO
USE EnforceFlow;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'enforceflow_api')
  CREATE USER enforceflow_api FOR LOGIN enforceflow_api;
GO
ALTER ROLE db_datareader ADD MEMBER enforceflow_api;
ALTER ROLE db_datawriter ADD MEMBER enforceflow_api;
GO
DECLARE @MasterUsername NVARCHAR(80) = N'masteradmin';
DECLARE @MasterPassword NVARCHAR(200) = N'Replace-This-Master-Password-2026!';
IF EXISTS (SELECT 1 FROM enforcement.Users WHERE Username = @MasterUsername)
  UPDATE enforcement.Users SET DisplayName=N'Master Administrator', PasswordHash=CONVERT(VARCHAR(128), HASHBYTES('SHA2_512', @MasterPassword), 2), RoleCode=N'master', IsActive=1 WHERE Username=@MasterUsername;
ELSE
  INSERT INTO enforcement.Users (Username, DisplayName, PasswordHash, RoleCode, IsActive)
  VALUES (@MasterUsername, N'Master Administrator', CONVERT(VARCHAR(128), HASHBYTES('SHA2_512', @MasterPassword), 2), N'master', 1);
GO
