/* Run in SSMS while connected through Windows Authentication. */
USE master;
GO
ALTER LOGIN [enforceflow_api] WITH DEFAULT_DATABASE = [EnforceFlow];
GO

USE EnforceFlow;
GO
/* Rebind an existing/orphaned database user to the current server login. */
ALTER USER [enforceflow_api] WITH LOGIN = [enforceflow_api];
GRANT CONNECT TO [enforceflow_api];
IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id WHERE r.name=N'db_datareader' AND m.name=N'enforceflow_api')
  ALTER ROLE [db_datareader] ADD MEMBER [enforceflow_api];
IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id WHERE r.name=N'db_datawriter' AND m.name=N'enforceflow_api')
  ALTER ROLE [db_datawriter] ADD MEMBER [enforceflow_api];
GO

SELECT
  SUSER_SNAME(sid) AS ServerLogin,
  name AS DatabaseUser,
  type_desc AS UserType
FROM sys.database_principals
WHERE name = N'enforceflow_api';
GO
