# Account workspace and staff continuity

Implemented 21 October 2026.

## Appearance and login backup

Congress Blue (#025299) is the default accent, balanced with white panels and a pale blue canvas. The sidebar and dashboard introduction provide stronger colour throughout the application. Regal Blue (#004770) is available as a personal alternative. The login uses an enlarged CIDCO logo and a blue skyline panel.

The previous login is preserved in `backups/login-before-congress-blue-20261021`. Run `npm run restore:login` to restore its appearance while retaining current authentication logic. See the backup README for the reference files.

## Personal workspace

Open **My workspace** in the sidebar or profile menu. Each authenticated account has its own server-stored preferences and photo, keyed by its immutable user ID. Choices include palette, light/dark theme, spacing, text size, left/right sidebar, collapsed navigation, page width, panel styling, motion, start page, dashboard heading, dashboard section visibility/order/layout, and sidebar visibility/order. Reordering has keyboard-operable up/down controls. Hidden links remain accessible through search and keyboard shortcuts; access permissions still apply.

Profile photos accept PNG/JPEG up to 2 MB and 16 megapixels. The server crops and re-encodes a 256-pixel square JPEG. Photos and preferences use revision checks to prevent overwriting changes from another window. Signing out resets local account state. Official name, username, designation, and permissions are read-only here. The server rejects identity, designation, role, and user-ID fields in personal-setting requests.

## Leave, holidays, and transfers

Open **Leave & transfers**, use the dashboard buttons, or use the profile menu. Staff can record a dated leave/holiday or request permanent transfer. One active continuity request per person is allowed. Leave dates are staff-declared; the supervisor must verify them before authorizing a handover.

The leave window uses Asia/Kolkata calendar dates, counting the start date as day one. Temporary handover becomes available after 15 elapsed days (day 16), while leave is still ongoing. A CCUC can manage CUC/surveyor leave; a Master Administrator can manage all supported staff roles. The replacement must be active, have the same designation, and have no active continuity request. Self-approval is prohibited. Permanent transfers require a Master Administrator.

Temporary handover changes current assignments on open, non-archived cases and records an assignment snapshot. On return, the staff member requests restoration and a supervisor confirms it. Restoration changes only assignments still held by that replacement; later routing and closed/archived cases are preserved. A permanent transfer moves matching current assignments, including closed/archived cases, and disables the outgoing account in the same transaction. Existing document authorship, case references, evidence, stages, and approval history remain intact. Failed transactions roll back case assignments, account status, and audits together.

Supervisors use the **Staff handover queue** tab. Eligible work also appears in the continuity notice. The system requires an explicit supervisor action; it does not automatically reassign cases when the 15-day window elapses.

## Storage and validation

Existing SQL Settings, OperationalRecords, Cases, and AuditLog tables are used; no schema migration is required. Site-report PDF export remains available.

Validation: `npm test`, `npm run test:ui`, `npm run test:experience`, and `npm run build`. Browser checks cover all 15 views, keyboard navigation, responsive layouts, persistence, account isolation, profile photos, and the handover interface. Backend route tests cover authorization, day-15/day-16 boundaries, assignment restoration, concurrent revision protection, and rollback. `node server/verify-account-workspace.mjs` performs read-only checks against the running API and SQL database; it does not change production data.
