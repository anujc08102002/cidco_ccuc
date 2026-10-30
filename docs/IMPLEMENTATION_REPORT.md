# CIDCO enforcement portal — implementation report

Date: 15 October 2026. Repository: `D:\CIDCO\enforcement_project`. This directory has no Git metadata, so no commit or Git diff was available. Existing application architecture and identifiers were retained.

## Outcome and scope

The core enforcement path now persists through SQL Server and is enforced by server permissions and transactions: registration → CUC verification → CCUC file approval → notice draft/review/approval → signed-file issuance → publication → hearing → final-order draft/review/approval → signed-file issuance/publication → demolition plan and execution → record update → closure. A live acceptance fixture completed this path, including correction/resubmission, notice version 2, a court restriction and authorized clearance, reference response and temporary charge.

This is not a claim of complete departmental production acceptance. Live LTS, actual approved legal template content, consolidated-recipient policy, alternate approval policy, cryptographic signature validation and full browser/mobile acceptance remain dependencies or limitations described below. See the [258-row requirement matrix](REQUIREMENT_MATRIX.md) and its [CSV version](REQUIREMENT_MATRIX.csv) for individual statuses.

## Audit findings

The existing application uses React 18, TypeScript, Vite, Express and Microsoft SQL Server through `mssql`. Authentication used signed sessions and legacy SHA-512 password hashes; active-account/session checks already existed. Case registration, manual/GPS coordinates, survey severity/sections, CUC verification, CCUC file approval, administrator editing, archives, exports and SSE refresh existed. Most subsequent workspaces wrote unrelated generic `OperationalRecords`; they did not implement notice/hearing/order/enforcement state transitions or relational instruments. Case-list APIs returned data across assignments. Public disclosure inferred publication from a non-draft notice reference and rendered internal case data. Several account/transfer actions only changed browser state.

These paths were replaced or restricted where they prevented enforcement integrity. Legacy generic operational records remain in SQL and are administrator-readable; they were not silently converted into issued instruments. Cases with missing historical metadata are not given invented hearings, deadlines, approvals or legal synchronization. The original case-number generator remains intact. No notice-number generator existed in the inspected API; notice/outward references are recorded as supplied, revisions preserve the reference, and duplicate instrument references across cases are rejected.

## Implemented changes

- Server-scoped lists, dashboards, reports and case records, using assignments, reporting relationships, node jurisdiction and time-limited case-specific charge transfers. Changing a browser role or URL does not grant access.
- Plot and village identifiers, construction type, manual coordinate validation and retained GPS capture. A property without a plot can use node, village and survey number; a missing sector is recorded as Unspecified. Initial surveys and corrections are retained in `Surveys`.
- Protected PDF/JPEG/PNG uploads, 5 MiB per file, category/type/signature/extension validation, and SQL binary storage. Evidence categories distinguish site, before/after demolition, hearing reports, references and signed instruments. Download authorization checks case association.
- Registered departmental templates with approval references and merge-field population, editable text previews, immutable instrument versions, review/approval/issued/publication states and exact-version signed-file evidence. No fake digital signature or fabricated template was supplied.
- Hearing scheduling/completion/adjournment/rescheduling as historical entries, with notice linkage, attendance, proceedings and configurable deadlines. Final orders require hearing completion.
- Manual sourced legal records, persistent warnings, explicit restriction decisions and CCUC-only release of an existing restriction. Related cases match by node plus plot, or node plus village and survey number; an archived source case does not erase a property restriction. Court records do not automatically prohibit all activity; active restrictions block issuance, demolition completion and closure. LTS has an explicit unavailable adapter.
- Configurable deadlines, due/overdue filters, persisted escalation, responsible-role display, deadline-change reasons and audit history. Escalation does not depend on a browser remaining open.
- Administrator staff creation/edit/deactivation/password resets with audit writes; salted scrypt for newly set passwords while preserving legacy password compatibility. Staff deletion and permanent case deletion are disabled; archives preserve history.
- Multiple case-linked government/department/grievance/email/physical references, individual status and response records, supporting evidence and priority ordering. Pending references prevent closure.
- Separate CCUC demolition-drive planning, revisions with history, linked cases, completion outcomes and required before/after photos. Issuing an order does not close a case.
- Dedicated public search and document endpoints, with exactly three search modes and a server projection that excludes internal notes, evidence, staff and private legal records. Published documents are served as plain text. Drafts and archived cases are excluded.
- Persisted-data case, notice, publication, order, demolition, compliance, audit, user-access, duration, overdue, closure, node and date registers. Combined filters, sorting, case drill-down, print and CSV export are available. Node summaries use distinct case counts to avoid multiplication by versions/documents.

## Important files

| File | Purpose |
|---|---|
| `server/index.js` | Authentication compatibility, case registration, initial approvals, scoped lists/dashboard and integration wiring |
| `server/enforcement-workflow.js` | Transactional workflow APIs, documents/evidence, hearings, references, legal review, routing, charge, deadlines, drives and reports |
| `server/workflow-policy.js` | Pure role/stage/legal rules, date configuration, public projection and file validation |
| `server/passwords.js` | Salted scrypt and legacy SHA-512 verification |
| `server/lts.js` | Explicit unavailable integration boundary; no invented successful API response |
| `server/admin-cases.js` | Retention, administrative editing safeguards and expanded full backup |
| `database/12_enforcement_workflow.sql` | Additive migration, new entities/relationships and justified indexes |
| `server/migrate-workflow.js` | Batch-aware SQL migration runner; requires schema privileges |
| `src/features/cases/CaseWorkflowPanel.tsx` | Linked case actions, uploads, versions, hearing/reference/legal forms and audit history |
| `src/features/workspaces/EnforcementWorkspace.tsx` | Operational workspaces, configuration, templates, hierarchy, drives and reports |
| `src/features/public/PublicDisclosure.tsx` | Anonymous dedicated public search; never renders internal case detail |
| `src/features/cases/CaseRegister.tsx` | Combined identifiers, dates, officer and deadline filters |
| `src/features/cases/AdminCaseControls.tsx` | Safe administrator edit/archive UI; protected workflow fields are read-only |
| `src/services/enforcementApi.ts`, `vite.config.ts` | Same-origin API default and local development proxy; optional `VITE_API_URL` |
| `server/workflow.test.js`, `server/verify-enforcement.js`, `server/verify-render.js` | Policy, live relational acceptance and role/UI rendering tests |
| Existing `server/verify-*.js` files | Regression checks retained and adapted to approval separation and archival retention |

Other edited integration files: `server/sessions.js` (role changes invalidate sessions), `src/App.tsx`, `src/components/DemoDialog.tsx`, `src/components/AppShell.tsx`, `src/features/auth/SignIn.tsx`, `src/features/cases/CaseDetail.tsx`, `src/features/cases/caseWorkflow.ts`, `src/features/cases/workflow.css`, `src/features/dashboard/Dashboard.tsx`, `src/features/workspaces/WorkspacePage.tsx`, `src/types/index.ts`, `src/vite-env.d.ts`, `tsconfig.app.json`, `package.json`, `README.md`.

## Database changes

The migration was applied successfully to the configured EnforceFlow database using the workstation's Windows database-owner account. The application login can read/write operational data but could not alter the schema. SQL Server required `QUOTED_IDENTIFIER ON` and `ANSI_NULLS ON`; the migration now sets both and is repeatable.

New tables: `ReportingLinks`, `Settings`, `CaseReferences`, `DrivePlans`, `ChargeTransfers`, `DocumentTemplates`. Existing tables expanded: `Cases` (plot, village, construction type, precise workflow step, stage start, escalation and closure timestamps), `Documents` (text, protected bytes/MIME, approval/issuance metadata, superseded version and template linkage), `Hearings` (notice linkage and creation timestamp), `LegalUpdates` (source, restriction decision and clearance reason), and `DemolitionDrives` (drive-plan linkage).

Foreign keys retain case/user/document/drive relationships. Indexes cover active deadlines, case references, case/document versions and property-level legal matching by node/plot or node/village/survey. No existing case or notice identifiers were renumbered. No historical case was automatically assigned a jurisdiction, deadline, court status or legal instrument. Full JSON backup now includes new tables and document binaries; credentials remain excluded.

## Workflow and permission validation

Operational CUC actions and CCUC approvals are distinct. An administrator cannot use the older approve endpoint to bypass those roles, change stage/status/legal hold through general case editing, or permanently delete enforcement history. Critical actions check stored state inside SQL transactions. Row-version checks reject stale workflow edits. Notice/order versions remain separate rows. Signed evidence must belong to the same case and exact version. Issuance requires approval and a signed instrument. Closure requires completion of demolition, published order, record-update stage and all references.

User deactivation prevents both login and subsequent authenticated requests while preserving records. Charge authorization grants only the named case during its recorded period and leaves original credentials and assignment history intact. Audit writes record actors, reasons, prior values and transitions; there is no audit-editing HTTP endpoint. The SQL service account still needs normal infrastructure-level protection; application authorization is not a substitute for database administrator access controls.

## Test results

| Check | Actual result |
|---|---|
| `npm test` | 8 policy/security tests passed |
| `npm run test:integration` | 147 live API/persistence/authorization checks passed, including cross-case property restrictions and negative matching |
| `node server/verify-render.js` | 44 SSR checks across five roles passed |
| `node server/verify-case-upgrade.js` | Session, tampered token, unauthorized access, live stream and four existing case rows passed |
| `node server/verify-admin-controls.js` | 39 checks passed: edit conflict, role restrictions, archives/expiry, CSV/JSON backup and retention |
| `node server/verify-survey-details.js` | 15 checks passed: persisted survey, role rendering, XSS escaping, administrator edit and severity |
| `node server/verify-workflow-ui.js` | 8 checks passed; no existing case approvals submitted |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; Vite reports the existing large-bundle warning |
| Server JavaScript syntax | `node --check` passes on server scripts |
| Browser smoke test | `/public` showed exactly Name/Plot Number/Survey Number and completed an anonymous no-result search |
| Lint | No lint tool/configuration existed; no lint result is claimed |

Acceptance tests use fresh staff IDs, case IDs, templates and drive fixtures. They remove only their test records and assert the four pre-existing case rows remain unchanged. Existing regression fixtures were also removed after execution. Tests do not publish a real enforcement notice or alter an existing case. No successful live LTS retrieval, real device GPS capture, cryptographic signing, full keyboard audit or full mobile/browser journey is claimed.

## Remaining dependencies and required next steps

1. Supply the authorized LTS API contract, authentication scheme/credentials, property/case matching keys and authoritative restriction/clearance mapping. Implement and test the adapter against that contract; the current endpoint intentionally returns 503.
2. Register approved notice/order template text and its actual departmental approval references. No production legal wording was invented. Confirm notice/outward allocation rules if automatic allocation is required; the original portal had no notice allocator to preserve.
3. Configure the actual Surveyor–CUC–CCUC reporting relationships and node jurisdictions in Configuration. None were inferred for existing staff. Confirm calendar-day versus working-day rules and any alternate approval/disclosure policy before operational use. The implemented approval chain uses CCUC for supervisory instrument approvals and CUC for issuance.
4. Confirm whether consolidated recipients are permitted and supply the recipient/data/import rules before adding consolidated or Excel issuance. No existing Excel import or approved consolidated workflow was found.
5. Complete department user acceptance, including full browser/mobile/keyboard paths and representative approved documents. If cryptographic digital signing is required, supply the authorized signing service and validation requirements; the present implementation records signed-file evidence only.

## Known limitations

Reports currently load authorized rows then aggregate/filter them; large deployments will need pagination and further SQL-side aggregation. Report date filters currently select cases by registration date; event registers retain their actual issuance/publication/hearing dates, but a separate event-date filter is not implemented. The administrator audit report returns the newest 10,000 events. Duration reports label missing legacy transition history explicitly. Actual approved templates are not versioned in place: each registered template is a preserved row, and instrument revisions preserve their selected template.

Uploaded binaries live in SQL Server (not external object storage) and need capacity/backup planning. Published instruments are available as plain text; no PDF rendering or cryptographic signature validation is implemented. The older Leaflet/OpenStreetMap dashboard and existing case-location links remain; no new Google Maps integration, Claims/SAP/HR integration or email/WhatsApp/SMS provider was added. Application service uptime is required for minute-by-minute escalation; reads reconcile deadlines after downtime.

Existing generic operational records remain administrator-readable but do not count as linked instruments or completed milestones. Full browser acceptance remains outstanding even though the relational API workflow, render checks and regression suite pass. These limitations are not represented as successful external integration or completed departmental acceptance.
