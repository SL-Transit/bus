# SL-Transit Central AI Report

Purpose: every AI must report completed work, blockers, and handoffs here so other AIs can continue without repeating work.

## Report Rules
Every report must include:
- AI role/name
- date/time and timezone
- status: `IN_PROGRESS`, `BLOCKED`, `REVIEW`, or `DONE`
- scope/files touched or inspected
- latest commit hash if changed
- GitHub Actions result if pushed
- GitHub Pages/live result if pushed
- Firebase/passenger-data safety statement
- blockers and next recommended action

## Report Template

```md
## YYYY-MM-DD HH:mm TZ - <AI Role> - <Status>

Scope:
- `<file-or-area>`

Summary:
- ...

Evidence:
- Commit: `<hash or none>`
- Actions: `<pass/fail/not run>`
- Pages: `<built/live/not run>`
- Tests: `<what was checked>`

Safety:
- Firebase writes: `none` / `<details>`
- Passenger/private data touched: `none` / `<details>`

Blockers:
- ...

Next action:
- ...
```

## Current Reports

## 2026-07-13 21:18 +07 (Asia/Bangkok) - Supervisor AI / Current-State Handoff - REVIEW

Scope:
- `ai-handoffs/CENTRAL-REPORT.md`
- `ai-handoffs/MAIN-AI-DASHBOARD.md`

Summary:
- Re-anchored the central handoff to GitHub main `8fad59b476290d1ed13278268f5178361ef20d73`.
- Recorded the verified Firebase preview rewrite at `preview/publishedSchedule` from source commit `31ace5fa559706668e5ff0814ef8f5a511be78e9`.
- Read-back status: `mapView.stops=15`; every map stop icon is `🚏`; `visiblePairs=471`; `scheduleOfferTimes=820`; `readyForReview=true`; `readyForApply=false`; blockers 0; warnings 0; top-level `/publishedSchedule` remains `null`.
- Coordinate spot checks: กม.1 = `13.572126, 101.450481`; กม.7 = `13.529181, 101.497615`; ห้วยโสม = `13.498219, 101.537783`.
- Current coordination estimates: ERP Data Center approximately 99.9% ready for preview use; Passenger Preview approximately 95%; ERP Logic Center migration approximately 45-50%; whole-system production readiness approximately 70-72%.
- Updated central logic status for ERP Calculator Center, Map Display Center, ERP Alert Center, Journey Status Center, Vehicle Assignment Center, Booking Assignment Center, Driver Work Center, and `driver-work-producer`.
- Driver vehicle identity and `driverWorkByServiceDate` read access remain paused. The anonymous Driver App identity cannot yet prove vehicle ownership.

Evidence:
- Source main inspected: `8fad59b476290d1ed13278268f5178361ef20d73` (local and `origin/main` matched before this documentation update).
- Preview source/read-back: `31ace5fa559706668e5ff0814ef8f5a511be78e9` and the exact counts/flags supplied in the current verified handoff.
- Recent central logic commits: `2963fe7`, `9b199c6`, `1cc80de`, `2dadd67`, `8960376`, `f5bac19`, `8497d25`, `4faea2f`, `6fc4851`, `31ace5f`, `5b2629a`.
- Tests: documentation stale-line scan, scoped diff inspection, and `git diff --check`; no application behavior test required because no application file changed.

Safety:
- Documentation/status update only.
- Firebase writes: none.
- Seed applied: no.
- Production apply: no.
- Booking, passenger, ticket, driver, live vehicle, payment, LINE, operational, and private data touched: none.
- `readyForApply=false` remains the hard production stop.
- Unrelated local `database.rules.json` changes were not included.

Blockers:
- ERP Logic Center migration remains incomplete.
- Driver work runtime read access remains blocked until a backend-owned vehicle/device identity flow exists.
- Percentages are coordination estimates and do not override readiness gates.

Next action:
- Continue central logic migration in scoped, tested steps without enabling production writes; keep the paused driver identity/rules work blocked until separately approved.

## 2026-07-13 19:35 +07 (Asia/Bangkok) - Check Ticket AI / ERP Centers - DONE

Scope:
- `check_ticket.html`
- `tests/check-ticket-center-wiring.test.js`

Summary:
- Wired Check Ticket to load ERP Calculator Center, Map Display Center, and ERP Alert Center.
- Moved Check Ticket pickup ETA, journey/transfer ETA, current-distance ETA, and transfer-trip catchability calls to ERP Calculator Center as the primary path.
- Added a static regression guard so these Check Ticket ETA decision points do not call Geo ETA helpers directly again.
- This is a scoped wiring step only. It does not remove existing Check Ticket ticket/check-in flows or write paths.

Evidence:
- Commit: `9b199c6`
- Actions: not checked after push.
- Pages: not checked after push.
- Tests: `node tests\check-ticket-center-wiring.test.js`; `node tests\erp-calculator-center.test.js`; `node tests\map-display-center.test.js`; `node tests\erp-alert-center.test.js`; `node tests\passenger-preview-normalization.test.js`; `node tests\geo-engine.test.js`; `node tests\line-event-engine.test.js`; `git diff --check` passed with line-ending warning only for pre-existing dirty `database.rules.json`.

Safety:
- Firebase writes: none.
- Seed applied: no.
- Production apply: no.
- Passenger/private data touched: none.
- Operational/private data touched: none.
- LINE notifications sent: none.
- `database.rules.json` remains dirty from unrelated prior work and was not committed.

Blockers:
- Check Ticket still contains legacy/local route, schedule, notification, and geolocation flows that need later scoped migration to ERP Logic Center, Map Display Center, and ERP Alert Center.
- Backend-ready vehicle display contracts are not yet wired into Passenger or Check Ticket.

Next action:
- Continue with Map Display Center wiring for vehicle marker movement/display, then move Alert Center ownership of one-time transfer terminal alerts in a separate scoped pass.

## 2026-07-13 19:18 +07 (Asia/Bangkok) - Supervisor AI / ERP Centers - DONE

Scope:
- `erp-calculator-center.js`
- `map-display-center.js`
- `erp-alert-center.js`
- `tests/erp-calculator-center.test.js`
- `tests/map-display-center.test.js`
- `tests/erp-alert-center.test.js`
- `tests/passenger-preview-normalization.test.js`

Summary:
- Added first dry-run center contracts for the owner-approved architecture: ERP Calculator Center, Map Display Center, and ERP Alert Center.
- ERP Calculator Center now owns pure numeric helpers for road-distance-first ETA, fallback distance, duration display, transfer-trip catchability with buffer minutes, and combined transfer fares.
- Map Display Center now owns ready vehicle signal normalization and no-warp marker planning, so Passenger and Check Ticket can later share the same display behavior instead of each page deciding movement locally.
- ERP Alert Center now owns notification-recipient planning for booking-created and near-transfer-arrival alerts, including once-key generation to prevent repeated terminal alerts.
- Passenger regression guard was included so map stop short labels cannot overwrite the ERP origin option contract label.
- This pass is contract/test groundwork only; no page was wired to the new centers yet.

Evidence:
- Commit: `2963fe7`
- Actions: not checked after push.
- Pages: not checked after push.
- Tests: `node tests\erp-calculator-center.test.js`; `node tests\map-display-center.test.js`; `node tests\erp-alert-center.test.js`; `node tests\passenger-preview-normalization.test.js`; `node tests\geo-engine.test.js`; `node tests\line-event-engine.test.js`; `git diff --check` passed with line-ending warning only for pre-existing dirty `database.rules.json`.

Safety:
- Firebase writes: none.
- Seed applied: no.
- Production apply: no.
- Passenger/private data touched: none.
- Operational/private data touched: none.
- LINE notifications sent: none.
- `database.rules.json` remains dirty from unrelated prior work and was not committed.

Blockers:
- None for dry-run center contracts.
- New centers are not yet wired into Passenger, Check Ticket, Booking, Driver App, or Firebase backend flow.
- ERP Data Center still remains preview/review only unless owner separately approves production apply.

Next action:
- Wire Check Ticket and Passenger to consume backend/center outputs in a later scoped pass: Passenger displays all vehicle positions and timetable only; Check Ticket displays booked vehicle ETA and transfer guidance only.

## 2026-07-10 00:00 +07 (Asia/Bangkok) - Main Backbone Support AI - REVIEW

Scope:
- `erp-import-plan.js`
- `erp-schema.js`
- `erp-data-adapter.js`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Added explicit nested forbidden descendant validation under `data/erpDataCenter/*`.
- Blocked descendant names anywhere under `data/erpDataCenter`: `bookings`, `testBookings`, `passengers`, `tickets`, `ticketRecords`, `ticketAccess`, `checkIns`, `driverLogs`, `lineLogs`.
- Blocked nested runtime/private operation subtrees under `data/erpDataCenter/operations`: `bookings`, `passengers`, `liveVehicles`, `notificationEvents`, `notificationDeliveries`, `vehicleSessions`, `dailyAssignments`.
- Mirrored the guard in both import-plan validation and schema snapshot validation so allowed-root checks cannot bypass it.
- Gated adapter private write helpers (`createBooking`, `updateBookingStatus`, `createPassenger`) to reject by default instead of writing `operations/bookings` or `operations/passengers`.
- Kept `dryRun=true`, `writesEnabled=false`, `readyForApply=false`, and `data/erpDataCenter/*` as the only seed/import target.

Evidence:
- Commits: `1e974fd, 87d54cd, 5428162, 7073e5e, ac2f045`; latest patch commit `ac2f045`
- Actions: `Deploy GitHub Pages` passed for `becfe07`; `pages build and deployment` still pending at verification poll.
- Pages: GitHub Pages API `built`; live guard/schema/adapter/report files matched GitHub main and contained nested-forbidden markers.
- Tests: Node syntax checks passed for `erp-import-plan.js`, `erp-schema.js`, `erp-data-adapter.js`; mock validation blocked `data/erpDataCenter/bookings/b1`, `data/erpDataCenter/passengers/p1`, `data/erpDataCenter/ticketAccess/t1`, `data/erpDataCenter/foo/lineLogs/l1` with `forbidden-erp-descendant-name`; blocked `data/erpDataCenter/operations/liveVehicles/v1`, `data/erpDataCenter/operations/notificationDeliveries/d1`, and snapshot `data.erpDataCenter.operations.vehicleSessions` with `forbidden-erp-operations-subtree`; valid `data/erpDataCenter` dry-run plan remained `readyForReview=true`, `readyForApply=false`; adapter `createBooking`, `updateBookingStatus`, and `createPassenger` rejected with private/runtime write guard errors.

Safety:
- Firebase writes: none.
- Seed applied: no.
- Passenger/private data touched: none.
- Real booking/ticket/driver/live vehicle/LINE data touched: none.
- LINE notifications sent: none.

Blockers:
- None for nested forbidden import guard.
- Production apply remains owner-blocked; `readyForApply` remains false by design.

Next action:
- QA Release Guard AI should verify Actions, Pages, live markers, and the nested forbidden-path cases against GitHub main.

## 2026-07-08 00:00 +07 (Asia/Bangkok) - Main Backbone Support AI - REVIEW

Scope:
- `erp-import-plan.js`
- `erp-schema.js`
- `erp-data-adapter.js`
- `ai-handoffs/01-data-import-catalog-ai.md`
- `ai-handoffs/MAIN-AI-DASHBOARD.md`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Patched import/readiness guard so seed/import targets must be under `data/erpDataCenter/*` only.
- Marked legacy roots (`data/catalog/*`, `publishedCatalog`, `routeData`, `settings/routes`) as source-only and blocked as import targets.
- Blocked private/runtime paths including bookings, passengers, ticket/check-in records, driver logs, LINE logs, legacy live vehicle records, and runtime operations paths.
- Added fleet guard rules for `car1`-`car4` alias-only use, `car5` provisional/approval requirement, required `vehicleId`, duplicate `registrationNo` detection when login index exists, and plaintext credential field blocking.
- Added provider/payment guard rules requiring `paymentOwnership` for fares/fareSegments, enforcing `group_005/train` as `external_pay`, and blocking provider-owned fares without provider registry.
- Kept `dryRun=true`, `writesEnabled=false`, and import `readyForApply=false`.

Evidence:
- Commits: `43d52e1, 8a18652, 0a96c06, a08c418, caaa94c, 076f8cb, 55f9c91`; latest code commit `55f9c91`
- Actions: passed for `306aba0` (`Deploy GitHub Pages`, `pages build and deployment`).
- Pages: built; live files matched GitHub main for guard/schema/adapter/handoff files.
- Tests: Node syntax checks for `erp-schema.js`, `erp-import-plan.js`, `erp-data-adapter.js`; mock import-plan validation for valid `data/erpDataCenter` plan, legacy `data/catalog` update, runtime `operations/liveVehicles`, private `bookings`, fleet alias/credential, provider-owned fare without registry, `group_005/train` non-external-pay; mock `buildBackboneSeedPlan()` emits only `data/erpDataCenter/*` missing/update paths and excludes runtime/private collections.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.
- Real booking/ticket/driver/live vehicle/LINE data touched: none.
- LINE notifications sent: none.
- Seed applied: no.

Blockers:
- Provider registry content still needs owner/Data Import AI source approval before provider-owned fares can become apply-ready.
- Production apply remains blocked by owner approval; `readyForApply` remains false by design.

Next action:
- QA Release Guard AI should verify GitHub Actions, GitHub Pages, and live file markers for the guard patch.

## 2026-07-05 Asia/Bangkok - Main Backbone Lead - REVIEW

Scope:
- `erp-schema.js`
- `erp-data-adapter.js`
- `admin-erp.html`
- `ai-handoffs/*`

Summary:
- Added ERP backbone schema contract.
- Added schema-backed data adapter paths.
- Added read-only backbone snapshot assessment.
- Added admin Backbone Assessment page.
- Added dry-run backbone seed plan export.
- Added reference validation for route/stop, trip/route, fare/stop, and fleet relations.
- Added role-specific AI handoff files.

Evidence:
- Commits: `08c1947`, `1786b91`, `6f5abc3`, `3da8fa7`, `39cd7c6`, `6908457`, `29c9754`, `e2e9f80`, `2bc8e8c`, `76407c4`
- Actions: passed after latest related pushes.
- Pages: built and live files verified.
- Tests: schema mock validation, adapter mock assessment, admin inline script syntax, DOM id/static checks.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.

Blockers:
- Data Import AI must produce dry-run catalog/fleet/settings plan before safe real data import.
- Feature AIs should audit bridge plans before implementation.

Next action:
- Data Import AI starts dry-run import plan.
- QA Release Guard AI starts read-only regression tracking.
- Main Backbone Support AI reviews incoming handoffs and proposes missing schema/API contracts.

## 2026-07-05 17:36 +07 (Asia/Bangkok) - Passenger AI - REVIEW

Scope:
- `passenger.html` (audit only, no edits this pass)
- `passenger-logic.js` (audit only, no edits this pass)
- `erp-schema.js`, `erp-data-adapter.js`, `erp-engine.js`, `catalog-engine.js` (read-only inspection)

Summary:
- Passenger already reads `data/catalog/stops`, `data/settings`, `operations/liveVehicles` on-contract (no path changes needed).
- Found the schedule/dropdown code still depends on a pre-backbone `data/settings.routes` legacy shape as a fallback, because `data/catalog/routes`/`data/catalog/trips` are currently empty (Data Import AI has not seeded them yet) and `erp-data-adapter.js` has no list-style `getRoutes()`/`getTrips()` accessor yet.
- No hard-coded stop coordinates, stop order, or fare values remain in passenger files.
- Full field-mapping table, missing-API requests, bridge plan, risks, and test checklist written to `ai-handoffs/passenger-bridge-plan.md`.
- Flagged (not actioned): product owner asked to restore the real Longdo Maps API in `passenger.html` in place of the current Leaflet+shim approach ? this is UI/rendering-engine scope, not backbone schema, so raising it here for visibility rather than silently reverting already-pushed work.

Evidence:
- Commit: `<pending ? see next push>`
- Actions: not run this pass (no code changed).
- Pages: not applicable this pass.
- Tests: read-only inspection of `erp-schema.js`/`erp-data-adapter.js`/`erp-engine.js` against current `passenger.html`/`passenger-logic.js` field usage.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none ? `operations/bookings` and `operations/passengers` are not referenced anywhere in passenger files.

Blockers:
- `getRoutes()`/`getTrips()` list accessors needed in `erp-data-adapter.js` (Main Backbone Lead-owned file, Passenger AI will not add them directly per `COORDINATION-RULES.md` file ownership).
- `operations/liveVehicles` record shape not yet declared in `erp-schema.js` for validation.
- Data Import AI has not yet seeded `data/catalog/routes`/`trips`, so the bridge from legacy schedule data cannot be tested end-to-end yet.

Next action:
- Main Backbone Lead: review missing-API requests in `ai-handoffs/passenger-bridge-plan.md` ?4.
- Passenger AI: implement ?5 bridge steps once `getRoutes()`/`getTrips()` are available; implement Longdo Maps restoration as an isolated commit once confirmed by product owner.

## 2026-07-05 18:25 +07 (Asia/Bangkok) - Passenger AI - REVIEW

Scope:
- `passenger.html`
- `passenger-logic.js`

Summary:
- Restored the real Longdo Maps API per direct product-owner request (item flagged in `ai-handoffs/passenger-bridge-plan.md` ?6, now actioned as an isolated change).
- Removed the Leaflet-backed Longdo-compatible shim added in an earlier pass. `passenger.html` now loads `https://api.longdo.com/map3/?key=e4d45f7c8530c60ffd190c6eadb7e48a` again (byte-identical to the pre-migration script tag).
- No changes to the map/GPS engine logic itself (Kalman filter, dead-reckoning prediction, marker/animation code) ? it already called the Longdo API shape directly, so removing the shim required no changes to that logic, only to the shim file and the script tag.
- One follow-up left open: a transfer-options popup badge that depended on a Leaflet-only method (`bindPopup`) was removed rather than guessed at a Longdo-native equivalent; noted in code as a follow-up if wanted.
- This is independent of the backbone schema/data bridge work in `passenger-bridge-plan.md` ? no schema paths, Firebase reads/writes, or booking logic affected.

Evidence:
- Commit: `<pending ? see next push>`
- Actions: not yet verified post-push (will confirm in next report if requested).
- Pages: not yet verified post-push.
- Tests: syntax-checked both files; ran a mock-DOM smoke test confirming `passenger-logic.js`'s map engine drives a real-Longdo-shaped stub object with no shim interference.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.

Blockers:
- None for this change. Bridge-plan blockers (`getRoutes()`/`getTrips()`, `operations/liveVehicles` schema) from the previous report are still open and unrelated to this change.

Next action:
- Product owner: confirm visual/behavior parity on a real device once deployed (map rendering can only be verified in a live browser, not in this sandbox).
## 2026-07-05 18:56 +07 (Asia/Bangkok) - Main Backbone Support AI - REVIEW

Scope:
- `erp-schema.js`
- `erp-data-adapter.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Added additive `operations/liveVehicles` validation support without changing any schema paths.
- Added live vehicle field warnings for required shape, lat/lng range, speed/heading number sanity, service status, and optional references to fleet vehicles, queues, and catalog trips.
- Added a dry-run `readinessGate` object to schema validation output so Admin ERP/backbone reports can show required next checks before any production switch.
- Added read-only adapter list accessors: `getRoutes()`, `getTrips(routeId)`, `getFares()`, and `getCapacities()` from the existing cached catalog snapshot.
- This addresses the Passenger bridge requests for `getRoutes()`/`getTrips()` and live vehicle schema validation while leaving booking/passenger/check-ticket/driver features untouched.

Evidence:
- Commits: `b631137`, `34bf49f`, `258eac9`
- Actions: passed for latest commit `258eac9256380abde4e75cd5fad937082e39d2f7` (`pages build and deployment`, `Deploy GitHub Pages`).
- Pages: built for commit `258eac9256380abde4e75cd5fad937082e39d2f7`.
- Live source: `https://sl-transit.com/erp-schema.js?v=258eac9` contains `readinessGate`, `scanLiveVehicleRecords`, `invalid-latitude`; `https://sl-transit.com/erp-data-adapter.js?v=258eac9` contains `getRoutes`, `getTrips`, `getFares`, `getCapacities`.
- Tests: remote JS syntax parse for `erp-schema.js` and `erp-data-adapter.js`; mock schema validation confirmed malformed live vehicle latitude emits `invalid-latitude`; mock adapter load confirmed all four new accessor functions exist.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.
- Private collections read: none; `operations/bookings` and `operations/passengers` remain excluded by default in backbone snapshot/seed plan behavior.
- Schema paths changed: none.

Blockers:
- Data Import AI still needs to produce/validate dry-run catalog/fleet/settings data before feature bridges can be tested end-to-end.
- `readyForSwitch` remains false by design until Data Import, QA, feature bridge parity, Actions/Pages/live checks, and private-data safety evidence are complete.
- Driver Operations AI should confirm the final `operations/liveVehicles.serviceStatus` vocabulary and `currentTripId` join semantics.

Next action:
- Passenger AI can re-audit bridge step against `SLTransit.db.getRoutes()` and `SLTransit.db.getTrips(routeId)` once catalog routes/trips are populated.
- Data Import AI should continue dry-run backbone data plan.
- QA Release Guard AI should include the new schema/adaptor markers in release regression checks.

## 2026-07-05 Asia/Bangkok - Main Backbone Lead - DONE

Scope:
- `erp-import-plan.js`
- `admin-erp.html`
- `ai-handoffs/01-data-import-catalog-ai.md`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Added ERP import plan validator for Data Import AI dry-run JSON plans.
- Validator requires `dryRun: true` and `writesEnabled: false`.
- Validator blocks `operations/bookings` and `operations/passengers` in updates or snapshots.
- Admin ERP now loads `erp-import-plan.js` after schema and before data adapter.
- Data Import AI handoff now points to the validator.

Evidence:
- Commit: `7e579e9f360b4f146168f807d5d6ccab8ae8176d`
- Actions: passed (`Deploy GitHub Pages`, `pages build and deployment`).
- Pages: `built`.
- Live: `https://sl-transit.com/erp-import-plan.js` returned 200 and contains `validateImportPlan`.
- Tests: syntax check, admin inline script check, mock import plan validation for safe and unsafe plans.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.

Blockers:
- None for dry-run validation.

Next action:
- Data Import AI should submit a dry-run import plan and run it through `SLTransit.importPlan.validateImportPlan()`.
## 2026-07-05 19:58 +07 (Asia/Bangkok) - Main Backbone Implementation AI - REVIEW

Scope:
- `erp-schema.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Took over Main Backbone implementation role after reading latest GitHub `main`, coordination docs, role handoff, and current backbone files.
- Found `SLTransit.schema.buildSeedSkeleton()` threw `ReferenceError: blockers is not defined`, which would break dry-run seed plan export/readiness checks.
- Removed the dead readiness-gate block from `buildSeedSkeleton()` while preserving existing schema paths and dry-run seed shape.
- Restored `validateSnapshot()` readiness gate after mock validation caught the intermediate regression; final safe/unsafe import-plan checks now pass.

Evidence:
- Commits: `358ec5b` (work lock), `8eac466` (initial seed skeleton fix), `830265c` (restore validation readiness gate; final code state)
- Actions: passed for final code commit `830265cdb0ead21fd0870f4d2b76b99c1021716e` (`Deploy GitHub Pages`, `pages-build-deployment`).
- Pages: live source verified at `https://sl-transit.com/erp-schema.js?v=830265c`.
- Tests: GitHub Contents API and live-source Node VM checks confirmed `buildSeedSkeleton()` is callable; safe dry-run import plan returns `readyForReview=true`; unsafe private-path plan is blocked by `private-path-update` / `private-snapshot-data`.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.
- Private collections read: none.
- Schema paths changed: none.

Blockers:
- Data Import AI still needs to submit a dry-run catalog/fleet/settings import plan for `SLTransit.importPlan.validateImportPlan()` review.
- No Firebase apply/write is approved.

Next action:
- Read Data Import AI dry-run plan when submitted, validate with `SLTransit.importPlan.validateImportPlan()`, and return blockers or readiness report.
## 2026-07-05 22:35 +07 (Asia/Bangkok) - Passenger AI - BLOCKED (critical, cross-cutting)

Scope: not a code change — reporting a blocker found while investigating "stop markers and schedule disappeared" on `passenger.html`.

Summary:
- Root cause: `passenger-logic.js`'s `FIREBASE_CONFIG` points at the new project (`sl-transit-9464e`) but `apiKey`/`appId`/`messagingSenderId` are still placeholder values (`'TODO_FROM_FIREBASE_CONSOLE'`) — **this value has never been filled in anywhere in the repo**, including `admin-erp.html`'s own `FIREBASE_CONFIG_NEW`, which has the identical placeholder and explicitly refuses to call `firebase.initializeApp()` until it's real (`cfgOk()` check).
- Because of this, `passenger.html` cannot read Firebase at all right now — not `data/catalog/stops`, not `data/settings`, not `operations/liveVehicles`. That's why both the map markers and the schedule table are empty — it isn't a passenger-side logic bug, the whole page has had no live Firebase connection since the sl-transit-9464e migration.
- Separately: `booking.html` and `check_ticket.html` are **still on the old project** (`bus-booking-1d68c`, real working apiKey, old flat paths like `settings`/`routeData`/`bus`/`liveVehicles`) — they have not been migrated to Schema v3 / sl-transit-9464e at all yet. So even once `sl-transit-9464e` has a real apiKey, its `data/catalog` collections are almost certainly still empty (Data Import AI status is TODO per this board), meaning passenger would connect successfully but still show nothing until a real seed happens.
- Net effect: passenger, booking, and check_ticket are currently pointed at **two different Firebase projects** with different schemas. This is a cutover-readiness gap, not something Passenger AI can resolve by itself (no real Firebase credentials, and reverting passenger's schema paths back to the old flat structure would violate the "no schema path changes" rule and diverge from the backbone migration everyone else is building toward).

Evidence:
- `passenger-logic.js`: `apiKey: 'TODO_FROM_FIREBASE_CONSOLE'`
- `admin-erp.html`: identical placeholder in `FIREBASE_CONFIG_NEW`, with its own `cfgOk()` guard confirming the same gap independently.
- `booking.html` / `check_ticket.html`: real apiKey `AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw`, `databaseURL` still `bus-booking-1d68c-default-rtdb.firebaseio.com`.

Safety:
- Firebase writes: none. Passenger/private data touched: none. No schema paths changed (reporting only).

Blockers:
1. Need the real `sl-transit-9464e` apiKey/appId/messagingSenderId from the Firebase console — nobody on the AI side has these credentials.
2. Even with real credentials, `data/catalog` on `sl-transit-9464e` needs an actual seed from Data Import AI before passenger/booking would show real data.
3. Decision needed from product owner / Main Backbone Lead: keep passenger pointed at `sl-transit-9464e` and wait for credentials + seed (page stays broken until then), or temporarily point passenger back at the old project/schema to restore visible function in the meantime.

Next action:
- Requesting product owner supply real Firebase console credentials for `sl-transit-9464e`, or confirm which of the two options above to take.
## 2026-07-06 00:50 +07 (Asia/Bangkok) - Main Backbone Lead AI - REVIEW

Scope:
- `erp-schema.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Adjusted dry-run readiness behavior so empty `operations/liveVehicles` is no longer a blocker for catalog/fleet/settings import review.
- Moved `operations/liveVehicles` from required collections to optional collections because it is operational state, not seed catalog data.
- Added warning-only `empty-operational-state` when no live vehicles are present.
- Did not create fake live vehicle data.
- Kept `operations/bookings` and `operations/passengers` blocked/private in the import validator.

Evidence:
- Commits: `faa38c1` (work lock), `be228de` (validator/readiness fix)
- Validation: mock dry-run snapshot with `operations.liveVehicles: {}` returned `readyForReview=true`, `readyForApply=false`, no blocker paths, and warning `empty-operational-state`; mock private snapshot with `operations.bookings` and `operations.passengers` remained blocked by `private-snapshot-data`.
- Actions: `pages-build-deployment` passed for `be228de`; custom `Deploy GitHub Pages` failed twice with transient Pages deployment error (`Deployment failed, try again later`).
- Pages: live source verified at `https://sl-transit.com/erp-schema.js?v=be228de`; it contains `empty-operational-state`, has `operations/liveVehicles` optional, and no longer has the old required-collection pattern.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none.
- Private collections read: none.
- Fake live vehicle data created: none.
- Schema paths changed: none.

Blockers:
- Custom `Deploy GitHub Pages` workflow is still reporting a transient deployment failure even though the Pages build succeeded and live source is updated.

Next action:
- Data Import AI can rerun dry-run validator against the full snapshot. If only `operations/liveVehicles` is empty, it should warn rather than block.

## 2026-07-06 06:04 +07 (Asia/Bangkok) - Passenger AI - REVIEW (TEMPORARY ROLLBACK)

Scope:
- `passenger.html`
- `passenger-logic.js`

Summary — this is an explicit, owner-approved TEMPORARY COMPATIBILITY ROLLBACK, not a bridge/backbone change:
- Owner approved pointing `passenger.html` back at the OLD Firebase project (`bus-booking-1d68c`) — the exact same project and config `booking.html`/`check_ticket.html` already use — because `sl-transit-9464e` still has no real apiKey/appId/messagingSenderId anywhere in the repo and its catalog is unseeded (see the earlier Passenger AI BLOCKED entry above).
- `passenger-logic.js`: `FIREBASE_CONFIG` changed to the old project's real, working config (byte-identical to `booking.html`'s). The Schema v3 config is preserved commented-out in the same file with the 3 revert conditions spelled out.
- `passenger.html`: Firebase listener paths changed from `data/settings`/`data/catalog`/`operations/liveVehicles` back to `settings`/`routeData`/`publishedCatalog`/`bus`/`liveVehicles` — old flat schema, matching `check_ticket.html`'s dual `bus`+`liveVehicles` vehicle-tracking listener exactly. The functions these paths feed (`applyPassengerRouteSettings`, `applyPassengerRouteData`, `applyUnifiedCatalog`, vehicle merge) were not changed — they already supported this exact old shape from before the Schema v3 migration, so this is a path-only reversion in the passenger surface, not new logic.
- `passenger-logic.js`: `loadPassengerRouteData()`'s one-time bootstrap read changed from `data/catalog` back to `routeData`.
- Removed the DOMContentLoaded call to `SLPassengerLogic.getStopsSorted()` (Schema v3 ERP-adapter-only, would just return empty against the old project) — stops now come entirely from the `routeData`/`publishedCatalog` listeners, same as pre-migration.
- No changes to `booking.html`, `check_ticket.html`, `erp-schema.js`, `erp-data-adapter.js`, `erp-engine.js`, or `catalog-engine.js`.
- No changes to the map/GPS/Kalman engine, Longdo Maps API usage, or any UI rendering logic — only Firebase config + path wiring.

Evidence:
- Commit: `e149ae8a` (pushed to `main`)
- Actions: `Deploy GitHub Pages` and `pages build and deployment` both `completed`/`success` for `e149ae8a` (verified via GitHub API).
- Pages: `GET /repos/SL-Transit/bus/pages` reports `status: built`, custom domain `sl-transit.com` verified with HTTPS certificate approved; latest `github-pages` deployment confirmed for `e149ae8a` via the deployments API. Fetching the live page content directly from this sandbox is not possible (network egress restrictions on this AI session), so live rendering must be confirmed by the owner in a real browser.
- Tests: syntax-checked both files; ran a mock-Firebase smoke test confirming (a) `FIREBASE_CONFIG.projectId` is now `bus-booking-1d68c`, (b) `loadRouteData()` calls `db.ref('routeData')`, (c) old-shape `settings.routes` data correctly populates the origin/destination lists via `SLPassengerLogic.schedule.applySettings()`, (d) old-shape `bus` vehicle data correctly populates `SLPassengerLogic.vehicles.getAll()` via `setRawFeed()`.
- Same-Firebase-project confirmation: **yes** — `passenger-logic.js`'s `FIREBASE_CONFIG` now matches `booking.html`'s config exactly (`projectId: bus-booking-1d68c`, same apiKey/authDomain/databaseURL/storageBucket/messagingSenderId/appId).

Safety:
- Firebase writes: none (read-only listeners only, same as before).
- Passenger/private data touched: none — `bookings`/`ticketAccess`/`ticketLocations` paths are not referenced anywhere in `passenger.html`/`passenger-logic.js`.
- Schema backbone changed: none (`erp-schema.js`, `erp-data-adapter.js`, `erp-engine.js`, `catalog-engine.js` untouched).
- booking.html / check_ticket.html changed: none.

Blockers: none for this rollback itself. Standing blockers for the real Schema v3 cutover are unchanged (real sl-transit-9464e credentials, catalog seed, Main Backbone Lead/Supervisor cutover approval).

Next action:
- Push, verify GitHub Actions + Pages, then confirm on the live Pages URL that `passenger.html` loads real stop markers and a real schedule table again.
- Revert this block to the Schema v3 config/paths (kept commented in `passenger-logic.js`) only once the 3 conditions above are met and approved.

## 2026-07-06 (Asia/Bangkok) - Passenger AI - CORRECTION (read-only, audit only)

Scope: correcting a conclusion from the prior read-only compatibility audit (booking.html/booking1.html cutover check). No code changed.

Owner clarification received and recorded as the governing principle for `passenger.html`:
- Passenger is a display-only counter. It has no business logic or hard-coded rules of its own — it only asks the ERP backend and renders whatever it is told, nothing more. If ERP says show a schedule for every stop, passenger shows a schedule for every stop. If ERP sends live positions for every vehicle, passenger shows every vehicle on the map with every station's position. Passenger must never independently classify, restrict, or filter what ERP provides (e.g. Nongkhok is a normal primary stop like any other — passenger has no basis to treat it as special).

Correction to the 2026-07-06 NEEDS_OWNER_DECISION report above:
- Findings (3), (4), and part of (6) — which suggested passenger needs its own pass_through/external_pay classification logic — are **withdrawn**. Per the principle above, adding such logic to passenger would itself be a violation (passenger deciding what's "special"), not a fix. Any stop classification/restriction belongs in ERP's data or in the booking flow, not in passenger's display code.
- Findings (1), (2), and (5) stand unchanged (confirmed: passenger only reads from ERP-owned nodes, has no write paths, and is unaffected by `bookings/`).

New finding from the same review, consistent with the stated principle — flagging, not fixing (audit-only):
- `passenger-logic.js` currently contains its own decision logic that computes things ERP should already be providing pre-computed: `isLeg2Dest()`, `normalizeRouteAlias()`, `cleanRouteLabel()`, `getLeg1TimesToTransferHub()` decide, inside passenger, whether a destination requires a transfer, which hub, and split leg-1/leg-2 times. Per the display-only principle, this is passenger-side logic that shouldn't exist — ERP should send a ready-to-render schedule/transfer structure, and passenger should just render it.
- Also: the schedule table currently requires picking one origin+destination pair from a dropdown before showing times, rather than showing the schedule for every stop at once as described by the owner. This is a UI/data-flow difference from the stated intent, not yet confirmed as something to change.

Safety: no code/Firebase/data changes made in this correction pass.

Next action:
- Owner/Main Backbone Lead to decide: (a) should the transfer/leg-splitting computation move into ERP's data (pre-computed schedule) so passenger can drop `isLeg2Dest`/`normalizeRouteAlias`/`cleanRouteLabel`/`getLeg1TimesToTransferHub` entirely, and (b) should the schedule view change from dropdown-pair-selection to showing every stop's schedule at once. No implementation until approved.

## 2026-07-07 13:52 +07 (Asia/Bangkok) - Passenger AI - REVIEW

Scope:
- `passenger.html`
- `passenger-logic.js`
- `ai-handoffs/passenger-schedule-node-request.md` (new)

Summary — owner approved moving straight to the "precomputed node" design discussed in the prior correction entry, even though the node doesn't exist yet (no live passengers using this page currently):
- Removed all passenger-side schedule/transfer decision logic: `isLeg2Dest`, `cleanRouteLabel`, `normalizeRouteAlias`, `findKnownRouteLabel`, `getPassengerErpTimes`, `getPassengerErpDisabledTimes`, `getPairTimes`, `isPassengerTimeDisabled`, `getActivePassengerTimes`, `getLeg1Times`, `getLeg1TimesToTransferHub`, and the entire legacy `data/settings.routes` parser `applyPassengerRouteSettings`. State vars `ROUTES`, `CONFIRMED_*`, `LEG2_DESTINATIONS`, `DEST_LEG2`, `ADMIN_ROUTE_TIMES`, `ADMIN_ROUTE_DISABLED_TIMES`, `ORIGIN_LIST`, `DEST_NORMAL`, `ADMIN_ROUTE_SOURCE_LOADED`, `PASSENGER_CATALOG_ROUTES_APPLIED/ROUTE_DATA_APPLIED/VERSION_APPLIED/RAW` all removed.
- Removed the passenger-side stop-order guessing fallback (`passengerStopSortValue`, `sortStopLabels`, `addUnique`, `isMainRouteLabel`) — `applyPassengerRouteData()` now sorts stops purely by ERP's own `.order` field (missing order just sorts last + falls back to key order), consistent with the in-progress Main AI stop-ordering task.
- Added a new, display-only schedule API: `SLPassengerLogic.schedule.getOrigins()` / `getDestinations()` / `getPair(origin, dest)` / `isReady()` / `applyPublishedSchedule(node)`, reading a single precomputed node (requested as `publishedSchedule`, see the new spec doc) that already contains ready-to-render origins, destinations (with ERP-assigned group labels), and per-pair segments with per-time `disabled` flags and optional per-segment `note` strings (e.g. for external-pay legs).
- Rewrote `buildDropdowns()`/`renderSched()`/`buildTimeCell()`/`buildLeg2TimeItem()` in `passenger.html` to just render this node — zero decisions left in passenger about transfers, aliases, disabled times, or which destinations are "special".
- Wrote `ai-handoffs/passenger-schedule-node-request.md`: full requested JSON shape, design rationale, and an explicit list of what passenger will never decide again.
- The node does not exist yet, so the schedule UI currently shows "waiting for schedule data" — accepted by the owner since no live passengers are using this page.

Evidence:
- Commit: `<pending — see next push>`
- Tests: syntax-checked both files; ran a mock `applyPublishedSchedule()` smoke test confirming direct-route and transfer-route pairs both render correctly, including a segment `note` (external-pay style) passing through untouched.

Safety:
- Firebase writes: none — this is a specification request, not an implementation. Whoever owns write access (Main Backbone Lead / Data Import AI) would build the real node.
- Passenger/private data touched: none.
- Schema backbone changed: none (`erp-schema.js`, `erp-data-adapter.js`, `erp-engine.js`, `catalog-engine.js` untouched).
- booking.html / check_ticket.html changed: none.

Blockers:
- `publishedSchedule` node does not exist yet — schedule UI is non-functional until it's built and populated. Acceptable for now per owner (no live passengers).
- Standing rollback-revert conditions (real sl-transit-9464e credentials, catalog seed, cutover approval) unchanged from the earlier rollback entry.

Next action:
- Requesting Main Backbone Lead / Data Import AI review `ai-handoffs/passenger-schedule-node-request.md` and build the `publishedSchedule` node (or propose an alternative shape/path — passenger's renderer just needs *a* precomputed node in roughly this shape, the exact path/name is backbone's call).

## 2026-07-11 12:22 +07 (Asia/Bangkok) - Passenger AI - REVIEW

Scope:
- `passenger.html` (CSS only)

Summary — bug reported directly by owner with a screenshot (admin test session on live `sl-transit.com/passenger.html`):
- The location-consent popup ("ขอเข้าถึงตำแหน่งของคุณ") showed its title and body text but the Allow/Deny buttons and privacy-policy link were not visible or reachable, so the popup couldn't be dismissed.
- Root cause: `.location-consent-overlay` used `position:absolute; inset:0;` sized to `.map-page`'s box. `.map-page` is `height:100dvh` in the mobile layout, but the admin-test banner (`.admin-test-strip`, shown only for admin test sessions) sits in normal flow *before* `.map-page` and is not accounted for in that height. With `body`/`.map-page` both `overflow:hidden`, the extra banner height pushed the bottom of `.map-page` (and everything positioned relative to it, including the consent card's buttons) below the visible viewport with no way to scroll to it.
- Fix: changed the overlay to `position:fixed; inset:0;` so it anchors to the true viewport regardless of what's pushed above `.map-page`, added `overflow-y:auto` on both the overlay and the card as a defensive fallback for any other extreme-viewport case (small screens, on-screen keyboard, unusual browser chrome), and added `env(safe-area-inset-bottom)` padding for devices with a home-indicator bar. Bumped z-index from 60 to 200 for extra safety margin above all other fixed/absolute elements on the page (previous max in use was 60).
- No JS changes — CSS only, so no behavior change to consent logic, geolocation handling, or any data flow.

Evidence:
- Commit: `<pending — see next push>`
- Tests: syntax-checked the inline script (unchanged, confirms no JS regression); visually traced the CSS cascade for `.map-page`/`.admin-test-strip`/`.location-consent-overlay` to confirm the root cause matches the reported symptom exactly (title+body visible, buttons clipped).

Safety:
- Firebase writes: none. Passenger/private data touched: none. Schema backbone changed: none. booking.html/check_ticket.html changed: none.

Blockers: none.

Next action:
- Owner to confirm the fix on a real device (same admin test session that surfaced the bug), including checking that the Allow/Deny buttons are now reachable with the admin banner visible.

## 2026-07-11 12:32 +07 (Asia/Bangkok) - Passenger AI - REVIEW

Scope:
- `passenger.html` (JS + CSS)

Summary — follow-up bug reported by owner (screenshot confirmed the previous popup-clipping fix worked, buttons now visible), two new issues:
1. Accidentally tapped "ไม่อนุญาต" (deny), then tapping the follow-me button again to reconsider showed nothing — popup never reappeared.
   - Root cause: `requestLocationConsent()` had a hard `if (status === 'declined') return Promise.resolve(false)` with no way to override it, so **any** caller — including the follow-me button, which is supposed to let the user reconsider — got silently blocked forever after one decline, not just the automatic page-load check.
   - Fix: added a `forcePrompt` parameter. The automatic page-load call stays parameterless (still respects a prior decline, doesn't nag every visit). The follow-me button now calls `requestLocationConsent(true)`, which always re-shows the popup unless consent was already granted.
2. Reported buttons "not centered" / easy to mis-tap — CSS already used flexbox with equal-width buttons; added an explicit `text-align:center` on `.lc-btn` as a defensive fix in case of a font/rendering-specific offset. Could not fully reproduce root cause from the screenshot alone; flagging that this part may need another look if still off after this deploy.

Evidence:
- Commit: `<pending — see next push>`
- Tests: syntax-checked the inline script; traced the call sites of `requestLocationConsent()` (auto page-load vs. follow-me button click) to confirm only the button path now force-reprompts.

Safety:
- Firebase writes: none. Passenger/private data touched: none. Schema backbone changed: none. booking.html/check_ticket.html changed: none.

Blockers: none.

Next action:
- Owner to re-test: (a) tap "ไม่อนุญาต" once, then tap the follow-me button again and confirm the popup reappears; (b) confirm whether the button-centering issue is resolved or needs another screenshot to diagnose further.

## 2026-07-12 20:12 +07 (Asia/Bangkok) - Passenger AI - REVIEW (Passenger Preview, preview-only)

Scope:
- `passenger.html`
- `passenger-logic.js`

Summary — owner-approved Passenger Preview bridge to ERP Data Center Round 2 (`preview/publishedSchedule`, schema `publishedSchedule.v1.preview`; `dryRun=true`/`writesEnabled=false`/`readyForApply=false` at the source):
- Changed the Firebase read path from `publishedSchedule` (a never-built node I'd previously only requested) to `preview/publishedSchedule` (the real Round 2 preview output, generated by `tools/published-schedule-v1-dry-run.js`). Single-line path change — the pair-key format (`originLabel__destLabel`) already matched the generator's `compatibilityPairKey()`, so `getPair()`/`getOrigins()`/`getDestinations()` needed no logic changes.
- Added rendering for fields the real node provides that my earlier placeholder shape didn't: `isEstimated` badge (`entry.displayBadgeTh`, confirmed equals `เวลาโดยประมาณ`), a disclaimer footer collecting `pair.transferDisclaimerTh`/`pair.externalDisclaimerTh`/per-time `entry.disclaimerTh` verbatim (confirmed `เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง` renders unmodified), and a header badge for transfer-reference pairs (`pair.displayBadgeTh`, confirmed `ข้อมูลต่อรถอ้างอิง`).
- `excludedPreviewPairs` (`transferUnknown`/`transferInfeasible`) is never read by any passenger code path — those pairs cannot surface as selectable journeys by construction (no filter to bypass), not by a check that could be wrong.
- Missing pair (no key in `.pairs`) already showed `ไม่พบตารางเวลาสำหรับเส้นทางนี้` rather than inventing a route/time — confirmed unchanged.
- **Self-correction during this pass:** an earlier draft added a per-time "ภายนอกระบบ" badge and an "ข้อมูลอ้างอิงภายนอก" header fallback that were **not** present in the source node. Removed both before finalizing — passenger must only render what the node provides, and the ERP-provided disclaimer text alone already unambiguously conveys the external/pay-separately nature.
- **Bug caught before going live:** `toMin()`/`nowMin()` were called in `passenger.html`'s `buildTimeCell`/`buildLeg2TimeItem` but only ever defined inside `passenger-logic.js`'s private scope, never exported — would have thrown `ReferenceError` the first time `renderSched()` got real pair data with times to render. This was dormant only because `publishedSchedule` was always `null` before (so `renderSched()` always hit its loading-state early return and never reached these calls) — today's wiring would have been the first real exercise of that code path. Added small local `toMin()`/`nowMin()` helpers in `passenger.html` (generic time-string parsing, not an ERP decision, same category as the existing local `splitBalanced()`). Scanned for any other instance of this pattern — none found.

Evidence:
- Commit: `<pending — see next push>`
- Tests: syntax-checked both files; built a mock object matching the real generator's exact output shape (`tools/published-schedule-v1-dry-run.js`) and verified end-to-end rendering for a direct pair, a transfer-reference pair, an external-reference pair, and a missing pair — all badges/disclaimers/fallback messages confirmed correct; confirmed excluded/infeasible/unknown transfer pairs are unreachable via `getPair()`. Attempted to run the real generator against live Firebase to get a true snapshot instead of a mock — blocked by network egress restrictions in this sandbox (expected/appropriate; no live Firebase access was available or used).

Safety:
- Firebase writes: none. Seeding: none. Production apply: none — `readyForApply` stays `false`, enforced at the data source, unaffected by this passenger-side read-path change.
- Booking/Ticket/Driver/Payment/LINE files: untouched.
- Operational/private data: untouched. No fake GPS/ETA introduced.

Blockers: none for this change. Owner should confirm on a real device once deployed, since this sandbox cannot fetch `sl-transit.com` directly.

Next action:
- Owner to verify live rendering once `preview/publishedSchedule` has real data behind it (origins/destinations dropdowns populate, a transfer-reference journey shows the reference badge + disclaimer, an external/train destination shows its disclaimer, a missing pair shows the unavailable message).
