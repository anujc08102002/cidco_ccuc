/* Run this once in SSMS as a database administrator, connected to EnforceFlow.
   It adds the forced first-login and administrator-reset password policy. */
USE EnforceFlow;
GO

IF COL_LENGTH(N'enforcement.Users', N'MustChangePassword') IS NULL
BEGIN
  ALTER TABLE enforcement.Users
    ADD MustChangePassword BIT NOT NULL
      CONSTRAINT DF_Users_MustChangePassword DEFAULT 0;
END;
GO

/* Existing accounts keep their current password. New accounts and administrator resets
   will be marked automatically by the API and must choose a new password on sign-in. */
