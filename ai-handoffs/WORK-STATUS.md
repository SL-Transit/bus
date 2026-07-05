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
| Data import / catalog | Data Import AI | TODO | `data/catalog/*`, `data/fleet/*`, `data/settings/*` dry-run plan | - | - | - | Start with dry-run JSON only. |
| QA / release guard | QA Release Guard AI | TODO | Actions, Pages, live source, regression checklist | - | - | - | Read-only by default. |
| Booking bridge | Booking Logic AI | TODO | `booking.html`, booking logic, capacity/queue bridge | - | - | - | Audit + bridge plan first. |
| Passenger bridge | Passenger AI | REVIEW | `passenger.html`, `passenger-logic.js` ? restored real Longdo Maps API per product owner's direct request (removed the Leaflet shim from the earlier pass; map/GPS/Kalman logic unchanged) | 2026-07-05 17:36 +07 | 2026-07-05 18:25 +07 | see `ai-handoffs/passenger-bridge-plan.md` ?6 | Bridge plan (schema/API gaps) still open, unaffected by this change. No Firebase writes, no passenger/private data touched, no schema path changed. |
| Check ticket bridge | Check Ticket AI | TODO | `check_ticket.html`, QR/ticket lookup contract | - | - | - | Audit + bridge plan first. |
| Driver operations bridge | Driver Operations AI | TODO | driver app, `operations/liveVehicles`, fleet bridge | - | - | - | Mock tests only until approved. |
| Import plan validator | Main Backbone Lead | DONE | `erp-import-plan.js`, `admin-erp.html`, `ai-handoffs/01-data-import-catalog-ai.md` | 2026-07-05 | 2026-07-05 | `7e579e9` | Dry-run validator for Data Import AI plans; Actions/Pages/live verified. |
| Main backbone support | Main Backbone Support AI | REVIEW | `erp-schema.js`, `erp-data-adapter.js`, `admin-erp.html`, handoff review | 2026-07-05 18:xx +07 | 2026-07-05 18:57 +07 | `34bf49f`, `258eac9`, report `563be00` | Added live vehicle validator/readiness gate and read-only catalog list accessors. Firebase writes: none; passenger/private data touched: none. |

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