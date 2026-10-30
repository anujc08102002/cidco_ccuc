# EnforceFlow — CIDCO Enforcement Operations

EnforceFlow is a SQL Server-backed React workspace for enforcement cases, surveys, notices, hearings, legal tracking, demolition coordination, public disclosure, staff access and operational reporting.

## Enforcement workflow implementation — 15 October 2026

See [implementation report](docs/IMPLEMENTATION_REPORT.md) and the [requirement matrix](docs/REQUIREMENT_MATRIX.md) ([CSV](docs/REQUIREMENT_MATRIX.csv)) for the audited scope, validation and unresolved departmental dependencies.

Apply `database/12_enforcement_workflow.sql`, `database/13_account_deletion.sql`, and `database/14_account_recovery.sql` against the configured database using a database-owner account, then restart the API. These additive migrations have been applied to this workstation's EnforceFlow database. They preserve existing case and notice references. The application SQL login intentionally does not have schema-change privileges.

Password recovery now verifies the username and official staff email, routes requests to the administrator bell, and supports Gmail/Outlook drafts after a reset. Add missing emails to existing accounts through People & access → Edit. Application email sending awaits departmental SMTP configuration. See [password recovery and notification setup](docs/PASSWORD_RECOVERY.md).

Every role can enable background system banners and notification sound from the bell using **Enable system notifications**. Each user must allow browser permission on their own device. HTTPS is required outside localhost. See [system notification setup and delivery limits](docs/SYSTEM_NOTIFICATIONS.md).

CCUC can publish a demolition drive from Demolition → Announce demolition drive. Other signed-in users receive an on-screen alert through the live connection, with a 15-second polling fallback. Upcoming drives and their full details appear below the blue welcome panel by default and in the notification bell. Every account can move or hide the Upcoming demolition drives section from My workspace and save its own layout; existing saved layouts gain the section below their welcome panel. Separate reminders appear on the previous calendar day and on the drive date in India Standard Time, including at sign-in; the drive-day popup repeats for a new sign-in session. Acknowledged announcement and previous-day popups are remembered per user in that browser. Date or detail revisions produce a fresh alert, and past drives leave the upcoming list after the drive date ends. System banners use the existing opt-in notification delivery. Drive announcements reuse DrivePlans without a database migration; restart the API after installing this update. Verify with `node --test server/drive-announcements.test.js` and `node server/verify-drive-announcements.mjs`.

No reporting relationships or node jurisdictions are required. Surveyors can submit cases to any active CUC; CCUC and legal users can see all cases. CCUC approval is available only after CUC verification. Existing cases retain their direct staff assignments. Use the staff IDs shown in People & access. Register actual approved departmental notice/order templates, including their approval references, before preparing instruments. Supported template fields are shown in Configuration.

Case detail has a linked workflow panel for corrections, instrument drafts and revisions, approvals, issuance, publication, hearings, sourced legal review, references, routing, temporary charge, demolition and closure. CUC performs operational work; CCUC performs supervisory approvals. Administrators cannot substitute for those approvals. The CCUC approval action applies that officer's administrator-registered handwritten signature image to the populated PDF. It stores the approved PDF bytes and returns the case to CUC for issuance.

### Printable notices and handwritten signatures — 16 October 2026

Install dependencies from the repository root and restart the API after updates. This workflow reuses the existing Documents, DocumentTemplates, Settings and AuditLog tables; the existing digital-document-signing migration must already be applied. It does not require PFX files, certificates or an external eSign registration. The PDF contains an image of the officer's handwritten signature and an audited approval record.

1. **Admin → Configuration → Officer handwritten signatures:** select an active user, then upload their PNG/JPEG paper scan or PDF (5 MB maximum; up to six PDF pages). Select the page and drag a crop around the handwriting. Auto-select ink suggests its bounds; exclude other text and stamps manually. Choose Extract and preview signature, review the transparent ink against the source, confirm the complete signature is retained, give a reason, then register it. Only the master administrator can upload, crop, replace, inspect raw signature profiles or remove them. Signature records are linked to user IDs. Their image hashes and changes are audited.

   The saved-signature registry displays each officer's login and registration status, and reopens a saved profile automatically. Register a separate signature for each additional CCUC account. Saving verifies the database record inside the transaction and reloads it before displaying success. Each logged-in CCUC retrieves only their own profile; replacing or removing another account's registration has no effect on theirs.
2. Signature extraction estimates the local paper colour, removes the background and shadows, preserves stroke geometry and trims empty margins into a transparent PNG. Cleanup strength is adjustable to retain faint ink. It does not use text OCR or redraw a signature. The original crop is retained for comparison and reprocessing; PDF scans are rendered before extraction. In the notice, images are scaled proportionally into the signature region. The admin must check the crop: automatic recognition cannot guarantee that a page contains only signature handwriting. Use Extract ink from saved signature to clean an existing profile, then review and replace it. Legacy paper-backed registrations are also extracted automatically for newly approved PDFs; the audit retains both the registered-image hash and the applied-ink hash. Replacing a profile does not change already approved PDFs.
3. **Admin → Configuration → Templates:** register approved wording and a default response period. Upload a reference PDF/image to preserve its layout. Map the owner and plot/address fields and add a signature region of at least 100 × 65 PDF points. Without a signature region an endorsement page is appended. English OCR is available for template text; signatures use ink separation rather than text recognition.

   Use **Edit saved template** to adjust an existing template, then **Save template changes**. Approval references and short IDs distinguish templates with the same name. Concurrent edits require reloading the template. If a reference lacks owner and plot/address mappings, populated wording flows onto that uploaded page while preserving its artwork, page dimensions and signature coordinates. The designer is rendered from the actual PDF, with region controls aligned over the page. A template has one approval signature; legacy duplicates resolve to the newest region. Signature collisions produce an error instead of silently moving the region. CUC must save a new draft version to apply template changes; signed PDFs remain unchanged. Preview requests carry the selected template ID and revision, and stale or mismatched responses cannot replace the current preview.
4. **CUC → Case → Documents:** owner/builder, building, plot, sector and address come from the case. The CCUC who approved the case is selected as authority where available; otherwise a single active CCUC is selected, or CUC chooses from the list. The authority's full name is printed before signing. The response period comes from the registered template and can be changed for the notice. Missing names, plot and response period must be completed before saving/submitting. Case and recipient changes automatically refresh the populated PDF preview.
5. For multiple builders, import .xlsx/.csv rows and review them before applying. Download the column example in the editor. One notice per recipient is included in the same approval package. Missing optional fields use case values. This imports notice recipients; it does not create separate enforcement cases. Saved versions retain recipient and authority values.
6. **CCUC → Documents:** open the populated PDF, verify the recipients and authority, confirm authorization and choose **Apply my signature and forward to CUC**. The server permits only the designated CCUC, uses their own admin-registered image, and rejects changed signature registrations. No signature file upload appears in the CCUC form. The name and designation appear below the image. CUC then reviews, issues and publishes that exact PDF.
7. **Older drafts:** unsigned plain-text notices containing square-bracket placeholders are now populated from the existing case in their preview. No old approved PDF is rewritten. A reviewed older draft must be returned with **Return to CUC for correction**, given a response period and saved as a populated revision before approval. Workflow deadlines are not treated as the legal response period.

The renderer uses Arial on Windows and Nirmala UI for Devanagari, or the TTF/TTC at NOTICE_FONT_PATH. The built-in PDF page viewer shows the actual generated document and provides print/download links.

Local validation: node --test server/workflow.test.js server/notice.test.js server/signature-images.test.js server/notice-template.test.js. Signature tests compare crop pixels, validate populated PDF content and embedded images, and exercise admin-only HTTP routes against in-memory storage. Template tests cover administrator permissions, revision conflicts and stable template identity. Database integration scripts create/remove fixtures and must be run only against an authorized test database. Read-only inspection confirmed the existing notice's case data; no configured-database test fixtures were created.

Deadlines use configurable calendar-day values; the hearing and post-hearing defaults are 15 days. Existing deadlines change only through a reasoned case deadline action. Escalation runs every minute while the API is running and is also reconciled on case/report reads. No external messaging provider is installed. `/public` is accessible without login and supports exactly Name, Plot Number and Survey Number; publication is enforced in its dedicated API.

LTS returns an explicit unavailable state until its authorized contract, credentials and restriction mapping are supplied. A sourced manual legal record can restrict enforcement; CCUC clearance is required to release an existing restriction. Approved legal templates and any alternate departmental approval/consolidated-recipient rules must be supplied before legally operative use.

Validation commands: `npm test`, `npm run test:integration`, `node server/verify-render.js`, `npm run typecheck`, `npm run build`, and the existing `server/verify-*.js` regression commands. The acceptance runner creates and removes its own fixtures, and asserts existing case rows remain unchanged. There is no configured ESLint or equivalent lint tool.

## Run the UI

```powershell
npm install
npm run dev
```

Open the Vite address displayed in the terminal, normally `http://localhost:5173`.

### Sessions, readable references and live maps

New cases receive a server-issued reference such as `CASE/2026/000001`. Existing UUID references remain unchanged in the database, but the UI displays a shorter stable reference. Updates use the original database key. No renumbering migration or additional SQL permissions are required.

Sign-in issues a signed 12-hour session. The browser keeps only the token in session storage and validates it with the API after refresh; passwords are not stored. Sign out clears it. Password changes or disabled accounts invalidate existing sessions. The API creates `server/.session-secret` on first start; preserve this ignored file across restarts, or configure a stable `SESSION_SECRET`.

Authenticated clients receive server-sent change events and refresh case data immediately. A five-second refresh and window-focus refresh provide recovery when the live connection is interrupted. The dashboard map shows registered cases across roles, while working registers retain their assignment filters.

The interactive map uses Leaflet/OpenStreetMap and saved latitude/longitude, with Google Maps links for individual sites. Cases without coordinates are counted separately. Cases sharing coordinates are grouped in the same marker's details.

Run `node server/verify-case-upgrade.js` for read-only session, case-list, and live-stream checks against the running API. Restart `npm run api` after API code changes.

## Configure Microsoft SQL Server

1. Install SQL Server 2022 Express or Developer and SQL Server Management Studio (SSMS).
2. In SQL Server Configuration Manager, ensure **SQL Server (SQLEXPRESS)** is running. For a remote server, enable TCP/IP, restart the SQL Server service, and allow port 1433 through the firewall.
3. Open SSMS, connect using Windows Authentication as an administrator, then execute [database/01_enforceflow_schema.sql](database/01_enforceflow_schema.sql), [database/05_operational_records.sql](database/05_operational_records.sql), [database/07_temporary_password_policy.sql](database/07_temporary_password_policy.sql), and [database/04_repair_api_database_access.sql](database/04_repair_api_database_access.sql).
4. Create the SQL application login and the first portal Master Administrator by running [database/02_create_master_user.sql](database/02_create_master_user.sql) in SSMS. Replace both passwords in that script first, then place the same application-login password in `.env`.

For reference, the script creates a dedicated SQL login (used only by the API) and a separate portal account (used to sign into EnforceFlow). Do not use a Windows/SSMS account as the application connection identity.

The equivalent application-login SQL is:

```sql
USE master;
CREATE LOGIN enforceflow_api WITH PASSWORD = 'ReplaceThisWithALongUniquePassword!2026', CHECK_POLICY = ON;
USE EnforceFlow;
CREATE USER enforceflow_api FOR LOGIN enforceflow_api;
ALTER ROLE db_datareader ADD MEMBER enforceflow_api;
ALTER ROLE db_datawriter ADD MEMBER enforceflow_api;
GRANT EXECUTE TO enforceflow_api;
```

5. Copy `.env.example` to `.env`, and set `DB_SERVER`, `DB_USER`, and `DB_PASSWORD`. For a named instance with SQL Server Browser unavailable, use its configured TCP port in the form `DB_SERVER=HOSTNAME,PORT` (this workstation currently uses `LAPTOP-5OC7KUVD,59948`). Keep `.env` private and never commit it.
6. Start the API in another terminal:

```powershell
npm run api
```

7. Verify `http://localhost:3001/api/health`. A `{ "status": "ok" }` response confirms the API can connect.

## Survey details and map severity

Survey submissions store priority (Normal / High / Urgent), selected sections and the violation description alongside the identity and location fields. Registers show the submitted survey information under each case row. Case details, administrator editing and backups include these fields. Existing databases require `database/11_case_survey_details.sql`. Fields not saved by older versions are shown as not recorded.

Dashboard locations use green Normal, amber High, red Urgent and grey unknown-priority pins. The side legend includes mapped-case counts and moves below the map on mobile. Shared coordinates show a count and the highest severity; the popup lists every case. The map retains its OpenStreetMap basemap and Google Maps site links. `node server/verify-survey-details.js` checks the survey creation round trip, every role's register, administrator edits, backups and severity rules using its own temporary case.

## Administrator case control

Master Administrator has **Manage** on each register row and administrator controls in the case detail. Edit property, owner, location, assignments, next-action date, stage, status and legal hold. Edit conflicts are rejected if another officer changed the case after the form was opened. Staff name, role and enabled status can be edited in People & access; operational records can be edited in their workspaces.

Use the register's **Case view** selector for active, archived or all cases. Archive for a specified number of 24-hour days, or indefinitely. Timed archives return automatically on the next archive check (every minute while the API is running, and when cases are loaded); the original status and workflow are preserved. Archived cases are hidden from operational maps, other roles' registers and public disclosure. Restore an archive at any time.

Master administrators can now permanently delete cases after typing the case reference. All case-owned surveys, evidence/documents, hearings, legal records, references, demolition links and charge transfers are removed together in one transaction; a full administrator audit snapshot is retained. Shared drive plans and templates are preserved. Unused shared templates and drive plans can also be deleted from Configuration and Demolition respectively; linked ones are protected.

People & access offers confirmed account deletion. Deleted accounts disappear from the directory and reporting hierarchy, cannot sign in or be reactivated, and have their credentials invalidated. A historical identity tombstone is retained for case responsibility, signed records and audit attribution; deletion does not erase that person's historical work or automatically reassign open cases. Administrators cannot delete themselves. Audit history is not deletable through the portal.

Case registration now uses a wide desktop layout with inline required markers and a live Google Maps preview that follows valid entered/GPS coordinates. It fits a 1366 × 768 desktop viewport without internal scrolling; narrow or zoomed windows retain accessible scrolling rather than clipping fields. Maps load from Google, which receives the preview coordinates. Manual coordinate entry and an external map link remain available if the embed is blocked.

**Export Excel CSV** downloads all case rows, including archives, for Excel. **Full case backup (JSON)** downloads case rows, surveys, notices/document metadata, hearings, legal updates, demolition records, case actions, audit history, operational records and staff identifiers. It excludes password hashes and authentication secrets. These are data exports, not SQL Server `.bak` files or copies of externally stored document binaries. The browser controls the download destination. No automatic backup import is provided.

Existing installations must apply `database/10_admin_case_controls.sql` to their configured database using a database owner account, then restart the API. The migration adds archive fields without altering existing case content. `node server/verify-admin-controls.js` tests edit conflicts, archive expiry, permissions, backup downloads and linked-record deletion using only its own temporary fixture; existing cases are checked for changes and left untouched.

## Optional learning data

[database/06_demo_seed.sql](database/06_demo_seed.sql) is the only sample-data file. It is never executed by the application. Run it in a non-production database only when you want sample records, then study and edit the `INSERT` statements to add your own data.

## Database contents

The schema creates tables for users, cases, case actions, surveys, documents, hearings, legal updates, demolition drives, and immutable-style audit events. It also includes foreign keys, workflow/status checks, search indexes, and an update timestamp trigger.

## Security before production

- New and changed passwords use salted scrypt; existing SHA-512 passwords remain compatible until reset. An organizational identity provider is not integrated.
- Restrict the API to HTTPS and a known frontend origin; use least-privilege SQL credentials.
- Review the supplied departmental templates and approval policy before legally operative use.
- Uploaded PDF/JPEG/PNG binaries are stored in SQL Server and served through case authorization. Plan database capacity and backup retention for document volume.

## Deploy from Windows CMD

Use a Windows Server with Node.js LTS, SQL Server access, and a DNS name. Run CMD as an administrator:

```cmd
mkdir C:\apps\enforceflow
cd C:\apps\enforceflow
git clone YOUR_GIT_REPOSITORY_URL .
npm ci
copy .env.example .env
notepad .env
npm run build
npm install -g pm2
pm2 start server\index.js --name enforceflow-api
pm2 save
pm2 startup
```

Copy the generated `dist` folder to the web server or configure IIS to serve it as a static site. Configure IIS or another reverse proxy to send `/api` requests to `http://127.0.0.1:3001`, use HTTPS, and set `CORS_ORIGIN` in `.env` to the public site URL. Never copy `.env` into `dist` or commit it to source control.
