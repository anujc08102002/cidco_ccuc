# Password recovery and notifications

Implemented 22 October 2026. Departmental SMTP setup is deferred at the user's request. Gmail, Outlook and default email-app drafts are available immediately; no email is sent merely by resetting a password.

## Staff and recovery

New staff registration requires an official email. Existing accounts keep their current email (or an empty value); the Master Administrator can add or correct it using **People & access → Edit**. Email is exposed only in the administrator directory, not to other staff through the user-list API. Apply the additive `database/14_account_recovery.sql` migration before starting the updated API. This migration has been applied to the local configured database; it preserves existing accounts and credentials.

**Forgot password?** opens a keyboard-accessible form requiring both official username and registered email. The server verifies both against the same active, non-deleted account. A match creates a pending request for Master Administrators. Repeated matched requests are coalesced until resolved. A mismatch returns an error and creates a separately labelled admin alert; it does not reset a password or disclose the correct email/name to the public caller. Repeated mismatches are coalesced for ten minutes. Recovery attempts are rate-limited by IP and username for fifteen minutes.

The bell includes pending recovery requests, mismatch alerts, authorized staff handovers and case attention items. Clicking a recovery request opens People & access filtered to the corresponding staff account; its saved email is visible. Mismatch alerts can be dismissed by an administrator. Matching requests remain pending until a successful password reset. Any Master Administrator can reset a password directly without an incoming request.

## Reset and delivery

A reset invalidates previous sessions and requires the staff member to choose a personal password at next login. Updating the password, resolving pending requests, creating the recipient's account notification, and recording audits happen in one database transaction. Failure rolls back all of them. The password itself is hashed; notification records and audit records contain no plaintext temporary password.

After resetting, a delivery panel offers an email preview, **Draft in Gmail**, **Draft in Outlook**, and **Open email app**. Each draft includes the saved recipient, username, new temporary password and sign-in instructions. It opens for the administrator to review and send; opening a draft does not confirm delivery. The panel keeps the temporary password only in component memory and clears it on close or navigation. Do not use a public localhost URL for a remote deployment; configure the public deployment address when setting up application email.

**Send from application** remains disabled until `SMTP_HOST` and `SMTP_FROM` are configured on the server. Set `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `APP_PUBLIC_URL` as needed, following [Nodemailer's SMTP configuration](https://nodemailer.com/smtp). Restart the API afterward. STARTTLS is required for non-implicit-TLS connections. The send endpoint is admin-only, accepts only the current temporary password, checks that it is still valid and requires change, and sends only to that account's saved email using a fixed message. It does not accept arbitrary recipients or message bodies. SMTP acceptance is reported accurately and does not guarantee inbox delivery.

## Recipient isolation

Recovery/mismatch alerts are visible only to Master Administrators. Reset notices are visible only to the affected account after sign-in and can be dismissed only by that account. Case alerts use server-side recipient rules: assignments and active cover for CUCs/surveyors, pending approval for CCUCs, legal holds for legal coordinators, direct responsibility, and administrator oversight. General case viewing permissions are unchanged. The bell count includes account and continuity items. Account changes clear notification and toast state to prevent messages carrying across sign-ins. Live events carry only a refresh signal; notification data is fetched through the authenticated account endpoint. Polling and window focus refresh the queue when the live stream is unavailable.

## Verification

`server/password-recovery.test.js` exercises public matching/mismatch behaviour, request deduplication and throttling, notification isolation/dismissal, administrator-only resets, transaction rollback, required email registration/editing, encoded drafts, and mail delivery through a fake transport. No real emails are sent. `npm run test:experience` covers the recovery dialog, notification-to-directory flow, reset delivery panel, draft contents and required registration email using fictional browser fixtures. Read-only live API checks verify the configured SQL schema and authenticated endpoints without creating requests, resetting real accounts or notifying real users.
