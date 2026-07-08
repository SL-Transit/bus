# SL-Transit AI Work Status Board

Purpose: every AI must check this board before starting work, mark the assigned area as in progress, and mark it done when complete. This prevents duplicate work and overlapping edits.

## Status Legend
- `TODO`: not started
- `IN_PROGRESS`: an AI is currently working on it
- `BLOCKED`: waiting for input, missing data, failing dependency, or approval
- `REVIEW`: pushed or reported, waiting for Main Backbone Lead/user review
- `DONE`: completed and reported in `CENTRAL-REPORT.md`

## Required Rule
Before changing any code or writing a plan, update or report your intended work using this board format. If you cannot update GitHub directly, paste an entry to the user or Main Backbone Lead and ask them to add it.

## Active Work Locks
| Area | Owner AI | Status | Scope / Files | Started | Last Update | Commit / Report | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Backbone schema + adapter | Main Backbone Lead | REVIEW | `erp-schema.js`, `erp-data-adapter.js`, `admin-erp.html` | 2026-07-05 | 2026-07-05 | `29c9754`, `6908457` | Core validator, assessment, seed plan added. |
| Data import / catalog | Data Import AI | TODO | `data/erpDataCenter/*` dry-run plan; legacy `data/catalog/*`, `publishedCatalog`, `routeData`, `settings/routes` are source-only | - | - | - | Start with dry-run JSON only. |
| QA / release guard | QA Release Guard AI | TODO | Actions, Pages, live source, regression checklist | - | - | - | Read-only by default. |
| Booking bridge | Booking Logic AI | TODO | `booking.html`, booking logic, capacity/queue bridge | - | - | - | Audit + bridge plan first. |
| Passenger bridge | Passenger AI | REVIEW | `passenger.html`, `passenger-logic.js` — removed all passenger-side schedule/transfer decision logic (isLeg2Dest/normalizeRouteAlias/cleanRouteLabel/getLeg1TimesToTransferHub/disabled-time computation/legacy data/settings.routes parser) and the passenger-side stop-order guessing fallback; passenger now only renders a precomputed schedule node (requested, not yet built — see `ai-handoffs/passenger-schedule-node-request.md`) and ERP's own `.order` field for stops. Schedule UI shows "waiting for data" until the node exists (accepted — no live passengers yet). | 2026-07-05 17:36 +07 | 2026-07-07 13:52 +07 | see `ai-handoffs/CENTRAL-REPORT.md` (13:52 entry) and `ai-handoffs/passenger-schedule-node-request.md` | Requesting Main Backbone Lead / Data Import AI build the `publishedSchedule` node per the linked spec. No Firebase writes performed. |
| Check ticket bridge | Check Ticket AI | TODO | `check_ticket.html`, QR/ticket lookup contract | - | - | - | Audit + bridge plan first. |
| Driver operations bridge | Driver Operations AI | TODO | driver app, `operations/liveVehicles`, fleet bridge | - | - | - | Mock tests only until approved. |
| Import plan validator | Main Backbone Lead | DONE | `erp-import-plan.js`, `admin-erp.html`, `ai-handoffs/01-data-import-catalog-ai.md` | 2026-07-05 | 2026-07-05 | `7e579e9` | Dry-run validator for Data Import AI plans; Actions/Pages/live verified. |
| Main backbone support | Main Backbone Support AI | REVIEW | `erp-schema.js`, `erp-data-adapter.js`, `admin-erp.html`, handoff review | 2026-07-05 18:xx +07 | 2026-07-05 18:57 +07 | `34bf49f`, `258eac9`, report `563be00` | Added live vehicle validator/readiness gate and read-only catalog list accessors. Firebase writes: none; passenger/private data touched: none. |
| Main backbone implementation | Main Backbone Implementation AI | REVIEW | `erp-schema.js`, `ai-handoffs/WORK-STATUS.md`, `ai-handoffs/CENTRAL-REPORT.md` | 2026-07-05 19:36 +07 | 2026-07-05 19:58 +07 | `830265c` | Fixed `buildSeedSkeleton()` dry-run callable path and restored validation readiness gate after mock regression check. Firebase writes: none; passenger/private data touched: none. |
| Live vehicle import validator | Main Backbone Lead AI | REVIEW | `erp-schema.js`, `ai-handoffs/WORK-STATUS.md`, `ai-handoffs/CENTRAL-REPORT.md` | 2026-07-06 00:10 +07 | 2026-07-06 00:50 +07 | `be228de` | Empty `operations/liveVehicles` is optional/warning-only for dry-run review. Firebase writes: none; passenger/private data touched: none. |
| ERP Data Center import guard | Main Backbone Support AI | REVIEW | `erp-import-plan.js`, `erp-schema.js`, `erp-data-adapter.js`, handoff docs | 2026-07-08 00:00 +07 | 2026-07-08 00:00 +07 | guard patch `306aba0` verified | Guard patch only: seed/import target must be `data/erpDataCenter/*`; legacy/runtime/private paths blocked. Firebase writes none. |

## How To Add / Update A Lock
Use one row per work area. Keep scope narrow.

Template:

```md
| <Area> | <Owner AI> | IN_PROGRESS | `<files or paths>` | YYYY-MM-DD HH:mm TZ | YYYY-MM-DD HH:mm TZ | <link/hash/report> | <short notes> |
```

## Collision Rule
If a row is `IN_PROGRESS`, do not edit those files or that area. Instead:
1. Read the owner AI role file.
2. Work on a non-overlapping dependency.
3. Or report a proposed change in `CENTRAL-REPORT.md` without editing.

## Completion Rule
When done:
1. Change status to `REVIEW` or `DONE`.
2. Add a summary to `CENTRAL-REPORT.md`.
3. Include commit hash, Actions status, Pages status, tests, risks, and next action.
