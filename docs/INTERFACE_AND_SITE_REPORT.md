# Interface and complete site reports

Implemented 21 October 2026. Existing roles, case references, approvals and enforcement rules remain in use.

## Client workflow

Sign in, use Overview to find a task, open a case, and follow its sections. Every page includes a short explanation. The common design covers login, the dashboard, registers, survey/document/hearing/legal workspaces, demolition, references, reports, staff, settings, public disclosure, archived cases and case sections. Tables retain horizontal scrolling where the record needs more space on a small screen.

`Ctrl+K` (or `Command+K`) opens searchable pages and cases. Type a page name and press Enter when one page matches, or Tab to a result and press Enter. The sidebar and keyboard guide include every authorized page.

Hold **Alt+Shift** and press:

| Letter | Page |
| --- | --- |
| D | Overview |
| C | Case register |
| S | Site surveys |
| N | Notices and orders |
| H | Hearings |
| L | Legal tracking |
| E | Demolition |
| R | References and complaints |
| I | Reports and exports |
| U | People and access |
| T | Settings |
| P | Public disclosure |
| A | Archived cases |

Only authorized pages can be opened. Press `?` or use the keyboard icon for the guide. Single-key `N`, `/` and `?` shortcuts can be disabled in that guide. They do not run while entering text or inside a modal. Case tabs support Left/Right arrows, Home and End. Escape closes dialogs, which retain focus and return it to the invoking control. Collapsed mobile navigation is inert until opened. Scrollable tables can receive keyboard focus.

Pages and case sections have bookmarkable hash URLs. Back and forward navigation work, including after session restoration. Unknown or unauthorized pages return to Overview; unavailable case links display an explanation.

## Complete site report

Open a case's **Site report** section and choose **Open printable document**, then **Open / print PDF** or **Download PDF**. The operating system/browser controls the printer and download location. Save the downloaded PDF to approved secondary storage, such as a USB drive or departmental archive.

The final PDF is generated automatically **inside the closure transaction** and stored in the existing Documents table as `CaseReport` with approval state `FinalReport`. A generation/storage failure rolls back closure. Existing closed cases without a final report receive one on their first authorized report request. Downloads of completed cases return the stored final bytes. An open case produces a saved `InterimReport`, identified as interim inside the document. No database migration is required beyond the application's existing workflow/document migrations.

The report includes property and location details, survey visits, document versions and authority/signature metadata, stored wording where available, hearing proceedings, sourced legal reviews, references and responses, enforcement outcomes, action/closure reasons, responsibility transfers and audit history. Source PDF pages and evidence photographs are included for printing. Original files are embedded without altering their bytes, alongside `case-record.json` and SHA-256 attachment checksums. The generated report's ID, SHA-256 hash, case version and page count are recorded in `SiteReportGenerated` audit events. Use a PDF reader with an attachments panel to extract original files. Missing stored originals are listed explicitly.

This is an unsigned case compilation with space for an officer's physical review/signature/seal. It reproduces recorded findings and instruments; it does not invent a legal/illegal classification. Closure and a legal hold are separate from the construction's legal status. Original signed instruments remain embedded, and copied print pages do not replace those originals for signature verification. Later administrator edits do not rewrite an already saved final report.

Reports require the same authenticated, case-scoped access as the case. They are not published through the public register. Report generation reuses the configured `NOTICE_FONT_PATH` where present, otherwise Arial or Nirmala UI on Windows. An unsupported language produces a clear generation failure rather than silently dropping text.

## Validation and operation

Run `npm run build`, `npm test`, `npm run test:ui`, and `npm run test:experience`. The browser runner uses installed Playwright, or the bundled Codex runtime; `CODEX_PLAYWRIGHT_PACKAGE` can specify its package.json path. Microsoft Edge is used for browser checks. It mocks all API responses and does not create production fixtures.

Coverage includes all 13 pages on desktop and mobile, search and page shortcuts, case-tab focus, bookmarks, browser back, report preview/download names, modal dismissal, mobile navigation and unauthorized page access. PDF tests extract text, render pages, check embedded original bytes and SHA-256 hashes, and verify closure rollback and saved-download access using in-memory storage. Test screenshots are in `output/ui`; `output/pdf/site-report-test-fixture.pdf` contains fictional data and is not an official instrument.

Start the API with `npm run api` and the interface with `npm run dev`; restart an already-running API after this update. The production UI is built under `dist`. Live SQL report insertion and printer/secondary-storage selection require the configured deployment; automated tests do not modify the configured database.

## Modern visual redesign

The current interface uses a single indigo accent, neutral slate text, white surfaces and a coordinated dark theme. The login has a dedicated split layout. Sidebar sections group workspaces, case management and administration. Buttons, forms, table states, upload tools, reports and the walkthrough share the same visual tokens.

Case register rows now use a semantic table with separate open/manage actions. Survey information and location are expandable with the keyboard. Settings use three arrow-key-accessible tabs: Time limits, Document templates and Officer signatures. Subtle page, panel, dialog and hover transitions respect the system's reduced-motion setting. The browser checks exercise these controls and both motion preferences. The printable case-report workflow remains unchanged.
