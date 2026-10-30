# Cursor / GitHub Copilot master prompt

You are a senior product designer and senior React/TypeScript engineer. Extend this existing EnforceFlow frontend into a complete, polished UI prototype for an Unauthorized Construction Enforcement Portal.

## First: inspect before editing
- Read the existing project and preserve its Vite + React + TypeScript setup.
- Keep the existing visual language: clean government-enterprise SaaS, pale blue-grey page background, white panels, navy typography, indigo primary actions, cyan accents, restrained red for legal risks, thin borders, subtle shadows, rounded corners, Lucide icons.
- Do not replace the project with a different framework.
- Do not add a backend or connect to SQL Server yet.
- Do not remove the existing dashboard; improve it if needed.

## Product scope
The portal covers the enforcement lifecycle from property/site survey to verification, COC review, notice, hearing, final order, demolition planning/execution, publication, compliance and closure. It has internal staff workspaces and a restricted public disclosure website.

## Required navigation and screens
Build complete responsive screens for:
1. Dashboard — metrics, cases by stage, open/closed trend, legal alerts, overdue tasks, recent cases.
2. Enforcement Cases — searchable/filterable table, status chips, node filters, officer filters, due-date filters, pagination, empty/loading states.
3. Case Detail — case header, property identifiers, stage timeline, assigned CUC, applicable legal section, next action, due date, related complaints, linked court cases, evidence, notices, hearings, orders, audit timeline.
4. New/Edit Case — validated multi-section form for node, sector, plot number, village, survey number, owner/occupier details where authorized, location and jurisdiction.
5. Site Surveys — survey register, survey detail, coordinates/map placeholder, photos/evidence gallery, findings and report submission state.
6. Notices & Orders — notice register, create notice form, preview, version history, approval/signing/publication status, final-order register.
7. Hearing Management — hearing calendar/list, schedule hearing, attendance, submissions, proceedings and adjournment UI.
8. Legal Tracking — linked court-case list, current status, last synced timestamp, prominent litigation warnings, legal hold and review state. Do not represent demo status as real court data.
9. Demolition Planning — separate monthly demolition-drive register with serial, date, node and plan/decision; separate case execution detail with authorization checklist and before/after evidence.
10. Documents & Complaints — attached references, source type, priority, received date, response status, document versions and access restrictions.
11. Reports & Analytics — filters by node/date/stage/officer and report cards for enforcement register, publication, demolition, compliance, audit, access and stage duration.
12. Staff & Permissions — staff directory, role and node, reporting relationships, user activation, permission matrix and transfer-of-charge modal.
13. Workflow Settings — configurable stage TATs, calendar/working-day rules, escalation policy, reminder intervals and approver mapping.
14. Public Disclosure — a clearly separate public-facing page with only three main search methods: person/name, plot number, survey number. Show only published notices/orders and no private evidence or internal notes.
15. Sign-in page — professional institutional login UI with MFA placeholder and no real authentication logic.

## Design requirements
- Match the quality of a premium enterprise case-management product.
- Keep a consistent 240–260px desktop sidebar, compact top bar, strong page title/subtitle, clear action hierarchy and generous but efficient spacing.
- Use responsive layouts for desktop, tablet and mobile.
- Use Lucide icons, accessible labels, keyboard focus states, semantic HTML and sufficient color contrast.
- Use Recharts for chart UI where appropriate.
- Reuse components for PageHeader, MetricCard, DataTable, StatusBadge, FilterBar, EmptyState, Modal/Drawer, Timeline, DocumentCard, AlertBanner and ConfirmDialog.
- Use consistent design tokens in CSS variables; avoid scattered arbitrary colors.
- Avoid oversized headings, excessive gradients, excessive animations and decorative clutter.
- Do not use stock photos as interface decoration.

## Functional behavior for this UI-only stage
- Navigation must switch between actual implemented screens, not just change the heading.
- Search and filters should work against realistic local mock data.
- Tabs, dropdowns, pagination, accordions, modals and drawers should work locally.
- Forms should have basic client-side validation and show success/error toast messages.
- Add confirmation dialogs for destructive-looking actions.
- Create a central mock-data module and TypeScript types instead of duplicating data in components.
- Keep mock data clearly labeled as DEMO data.
- Any action that implies a legal decision, digital signature, publication, actual demolition authorization, or database write must remain a simulated UI action with a clear "Demo only — not submitted" notice.
- No fake backend calls, no false claims that a document has been legally signed or published, and no actual external requests.
- Do not store sensitive data in localStorage.
- Keep all real actions disabled or simulated until a backend is implemented.

## Legal safety and workflow behavior
- Show a prominent red court-case alert on case detail whenever mock data indicates a linked court matter or unknown/stale legal status.
- Show a legal review hold state in the UI; never imply the app itself determines whether demolition is legally permitted.
- Treat notice issue, approval, digital signing and publication as distinct stages/actions.
- Preserve document version history in mock data.
- Show TATs as configurable examples only; do not hard-code legal deadlines as authoritative.
- Show case stage history and audit events as separate UI sections.

## Technical requirements
- Use strict TypeScript; avoid `any`.
- Organize components by feature, for example `src/features/cases`, `src/features/legal`, `src/features/surveys`, `src/features/reports`, `src/features/admin`, `src/features/public`.
- Add reusable shared components under `src/components`.
- Use React state and custom hooks where helpful; do not introduce a global state library unless necessary.
- Keep dependencies minimal. Reuse installed packages before adding new ones.
- Ensure `npm run build` succeeds with no TypeScript errors.
- Do not implement ASP.NET Core or SQL Server in this task. The UI will be connected to a secured ASP.NET Core API in a later phase.

## Delivery
- Implement all screens above with coherent mock data and consistent styling.
- Add README instructions and a list of screens/features completed.
- At the end, summarize changed files, implemented screens, known limitations and build/test result.
- Do not stop after creating a plan: implement the UI in the repository.
