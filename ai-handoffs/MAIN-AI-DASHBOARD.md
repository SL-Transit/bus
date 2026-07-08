# SL-Transit Main AI Dashboard

Purpose: coordinate the main AI roles after the Data Import dry-run snapshot passed review and bridge audits were opened.

Source of truth:
- Latest reviewed main before this dashboard: 892744ed15a0e96a5652d42591f7b594efa6d1af
- Bridge audit dashboard: ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- Data Import dry-run snapshot: readyForReview true, readyForApply false
- Production apply / Firebase seed: NOT approved

Shared approved ERP Data Center contract:
- settings: 1
- stops: 49
- routes: 244
- trips: 819
- fares: 720
- vehicles: 4
- queues: 4
- liveVehicles: 0
- direct fares: 233
- via_chachoengsao fares: 322
- external_pay fares: 165
- primary stops: chachoengsao, sanamchaikhet, khlonghat
- nongkhok: pass_through
- group_005/train: external_pay; passenger pays outside SL-Transit; SL-Transit collects no train fare
- canonical destination keys: system-managed and stable
- seed/import target root: data/erpDataCenter/*
- legacy sources only: data/catalog/*, publishedCatalog, routeData, settings/routes
- runtime contract-only paths: operations/dailyAssignments, operations/vehicleSessions, operations/liveVehicles, operations/notificationEvents, operations/notificationDeliveries

Global hard constraints:
- Read latest GitHub main before starting.
- Read START-HERE-FOR-ALL-AIS.md, WORK-STATUS.md, CENTRAL-REPORT.md, COORDINATION-RULES.md, and this dashboard.
- Do not use local file edits for repo changes. Use GitHub-only workflow.
- No Firebase writes.
- No seeding.
- Do not touch operations/bookings or operations/passengers real data.
- Do not create test bookings, passenger records, or fake liveVehicles.
- readyForApply must remain false until owner explicitly approves seed/apply.
- If a commit is explicitly required, push through GitHub and verify GitHub Actions + GitHub Pages.
- Report in short Supervisor format only. Do not explain to the owner.

Short Supervisor report format:

```txt
STATUS: PASS / BLOCKED / NEEDS_OWNER_DECISION / FAIL
SCOPE:
- <1 line>
LATEST_MAIN:
- <commit>
RESULTS:
- <short counts/findings only>
BLOCKERS:
- <short bullets or none>
SAFETY:
- firebase_writes: none/yes
- passenger_data_touched: no/yes
- bookings_touched: no/yes
- code_changes: none/yes
- seed_applied: no/yes
NEXT_ACTION:
- <one recommended next step>
```

## Main Backbone Lead AI

```txt
Role: Main Backbone Lead AI for SL-Transit.

Task: Own the backbone contract and guard the readiness gates while bridge AIs audit their surfaces.

Scope:
- erp-schema.js
- erp-import-plan.js
- erp-data-adapter.js
- admin-erp.html only if backbone assessment UI needs read-only review
- ai-handoffs reports/status only when needed

Work:
1. Review incoming bridge audit reports from Booking, Passenger, Check Ticket, and Driver.
2. Decide whether each requested adapter/schema need is already covered by the approved backbone contract.
3. Keep readyForReview and readyForApply semantics strict: review can pass; apply remains false until owner approval.
4. Reject any request that requires fake liveVehicles, private passenger reads, real booking writes, or schema-path drift.
5. Produce concise acceptance/blocker notes for Supervisor AI.

Do not:
- seed Firebase
- add real operational data
- loosen private path safety
- approve production apply

Return only the short Supervisor report format.
```

## Data Import / Catalog AI

```txt
Role: Data Import / Catalog AI for SL-Transit.

Task: Maintain the dry-run import snapshot and answer contract questions from bridge AIs.

Scope:
- data/erpDataCenter/settings dry-run plan
- data/erpDataCenter/catalog/stops, routes, trips, fares, fareSegments dry-run plan
- data/erpDataCenter/fleet/vehicles and queues dry-run plan
- data/erpDataCenter/providerRegistry when provider-owned fares exist

Work:
1. Keep the validator-ready dry-run snapshot aligned with owner decisions.
2. Answer bridge AI questions about stop keys, destination classifications, fares, train external_pay, route/trip references, vehicle/queue references.
3. If a bridge AI finds a missing key/reference, classify it as data gap, contract gap, or bridge misunderstanding.
4. Do not generate new real data unless owner explicitly approves the source and apply step.
5. Treat publishedCatalog/fares as source-only legacy data, not seed targets.

Do not:
- write Firebase
- seed data
- touch bookings/passengers
- invent real vehicle, owner, or passenger data
- target data/catalog/*, publishedCatalog, routeData, settings/routes, or operations/* runtime paths in import plans

Return only the short Supervisor report format.
```

## QA / Release Guard AI

```txt
Role: QA / Release Guard AI for SL-Transit.

Task: Read-only release guard for bridge-audit phase and any GitHub commits produced by approved main/bridge work.

Scope:
- GitHub latest main
- GitHub Actions
- GitHub Pages
- live source/hash checks
- smoke checks for admin/backbone pages and handoff files

Work:
1. After any commit, verify Actions and Pages.
2. Confirm live files match GitHub main where relevant.
3. Confirm no private Firebase paths were opened by any proposed test.
4. Confirm admin/backbone pages do not crash on load.
5. Confirm handoff dashboards are available on GitHub Pages.
6. Report regressions/blockers only; no broad refactors.

Do not:
- write Firebase
- create test bookings/passenger records
- perform destructive load tests
- approve production readiness while readyForApply is false

Return only the short Supervisor report format.
```

## Supervisor Routing Rule

- Main Backbone Lead handles contract/rule decisions.
- Data Import handles dry-run data shape and reference questions.
- QA / Release Guard handles verification after commits and live Pages checks.
- Booking/Passenger/Check Ticket/Driver bridge AIs use BRIDGE-AUDIT-DASHBOARD.md and report back to Supervisor AI.
- If any AI needs owner input, report NEEDS_OWNER_DECISION with one clear decision only.
