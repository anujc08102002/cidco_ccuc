# Portal interface correction — 15 October 2026

The workflow expansion originally used generic controls and raw API objects as the report view. This correction applies the existing EnforceFlow design language to the operational screens and makes the interface reflect the actual loading, access and workflow state.

## Changes

- Shared, token-based buttons, fields, status pills, headers, tables, cards, upload controls, loading indicators and meaningful empty/error states. Light and dark themes use the existing portal colors.
- Sixteen curated report definitions replace automatic database-column rendering. Internal keys, row versions, permission flags and duplicate identifiers are excluded from the presentation. Tables include friendly headings, sorting, in-report search, pagination, readable date/status values, focused CSV export and full matching-row print output.
- Report filters use labelled grids and readable stage selections. Backend filters now apply the same inferred stage used on screen for historical cases, and compute overdue status from actual deadlines.
- Surveys, notices/orders, hearings, references and legal tracking use structured case registers with real linked-record counts, case search, queue filters and direct navigation to the relevant case tab.
- Case detail uses working tabs for the overview, evidence, documents, hearings, references, legal/routing, demolition and audit history. The previous duplicated panel of unrelated accordions was removed. Documents, versions, hearings, references and audit entries use readable cards or timelines.
- Evidence upload uses a styled file picker with category labels, exact-version signed-document association, size/type guidance, progress, success and error feedback. Protected downloads remain authorized by the existing API.
- Case registration has a complete modal layout, aligned property/location/survey sections, proper validation, CUC selection, manual/GPS coordinates, a visible action footer and keyboard focus containment. The previous empty map-side column and dormant simulated account/action dialogs were removed.
- Staff administration has a directory, search, account status, consistent creation/reset forms and an accessible edit dialog. Account and command menus have working dismissal. Case tabs support arrow/Home/End navigation and remain accessible below the fixed header on mobile.
- Connection status distinguishes connecting, connected and interrupted states. Stale failures no longer overwrite a newer success. Failed loads do not masquerade as an empty assignment list. Notifications show actual case exceptions rather than hardcoded warnings or an empty red badge.
- Case responsibility, deadlines and the lifecycle are placed in a consistent sidebar. On narrow screens the layout stacks and wide tables/tabs scroll within their own containers without horizontal page overflow.

## Validation performed

- Browser review of the dashboard, case register, site surveys, notices/orders, hearings, legal tracking, demolition, references, reports, staff administration, configuration, registration, public disclosure and sign-in.
- Browser review of all eight case tabs, document preview, report selection/sorting, stage filtering/reset, command dismissal, modal cancellation and staff-editor Escape/focus return.
- An actual synthetic image upload and protected download through the browser. The uploaded image was associated only with the isolated review case.
- Desktop and phone breakpoint checks, including no horizontal page overflow, plus light/dark theme checks.
- Public search returned no unpublished review documents.
- `npm run test:ui`: 44 existing rendering checks and 63 new UI-consistency checks pass. The new checks cover the 16 report schemas, hidden internal columns, offline state, tab routing, form defaults and registration markup.
- `npm test`: 8 policy/security tests pass. `npm run test:integration`: 147 live workflow checks pass. Existing API, administrator, survey and workflow rendering regression scripts pass. Type-check and production build pass. The existing Vite bundle-size warning remains.

Testing used five temporary review accounts, two labelled review cases and a synthetic evidence image. Those database fixtures were removed afterward. Existing enforcement cases, users, identifiers and permissions were retained. No real notice/order was issued or published, and no existing staff account was changed during browser review. The download check produced a small synthetic `ui-review-evidence.png` in the browser's Downloads folder; screenshots remain in the project's output folder.

## Visual evidence

- [Reports](../output/ui-reports-refined.jpg)
- [Case evidence](../output/ui-case-evidence-refined.jpg)
- [Case documents](../output/ui-case-documents-refined.jpg)
- [Phone layout](../output/ui-case-mobile-refined.jpg)
- [Registration form](../output/ui-case-registration-refined.jpg)

Screenshots contain explicitly labelled temporary review records. This is an interface correction; the previously documented LTS/template dependencies remain unchanged. Actual print hardware, device GPS permission/capture, full assistive-technology certification and every legally consequential action were not exercised through the browser. Workflow authorization and persistence were covered by the API acceptance suite.
