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

## 2026-07-05 - Driver Operations AI - REVIEW

Scope:
- `driver-android/src/main/java/com/sanamchai/drivergps/MainActivity.java` (audit only)
- `driver-android/src/main/java/com/sanamchai/drivergps/GpsService.java` (audit only)
- `driver-android/src/main/java/com/sanamchai/drivergps/BootReceiver.java` (audit only)
- `erp-schema.js`, `erp-data-adapter.js`, `admin-erp.html` Fleet tab (read-only inspection)

Summary:
- Full audit + bridge plan written to `ai-handoffs/driver-bridge-plan.md`.
- Driver app currently writes to a flat legacy path (`liveVehicles/{queueId}`, old project) with a hardcoded 5-vehicle identity list and no authentication — flagged as a pre-existing security gap, not fixed this pass.
- Mapped app's vehicle-identity concept to backbone `data/fleet/vehicles` / `data/fleet/queues` / `data/fleet/queueOwners`.
- `operations/liveVehicles` record shape request is already resolved by Main Backbone Support AI's `scanLiveVehicleRecords`/`liveVehicle` requirement addition (see commits `b631137`/`34bf49f`/`258eac9` above); bridge plan updated to match the confirmed field names (`vehicleId, lat, lng, updatedAt, serviceStatus`, optional `queueId`/`currentTripId`).
- Still requesting: credential (login) field location and push-notification token field location — neither exists in the schema yet.
- Re: Passenger AI's cross-cutting Firebase-config blocker reported above — this AI holds a real `sl-transit-9464e` **Android** apiKey/appId (given directly by the product owner earlier this session for the driver app's own Firebase init). That's a different credential than the **web** apiKey Passenger AI needs, but confirms the product owner does have Firebase Console access and real values exist; recommending the product owner supply the equivalent web apiKey/appId/messagingSenderId to unblock Passenger AI.
- Mock-only test fixture included in the plan; nothing written to Firebase.

Evidence:
- Commit: `de590d8532e2d0e4ca07e22f9a458926acb3432a`
- Actions: not run this pass (no code changed).
- Pages: not applicable this pass.
- Tests: read-only inspection only; mock JSON fixture included in `driver-bridge-plan.md`, not executed against any live database.

Safety:
- Firebase writes: none.
- Passenger/private data touched: none — driver app does not currently read `operations/bookings`/`operations/passengers`, and this pass proposes it never should without a server-side minimization layer.

Blockers:
- No schema location decided yet for driver login credentials or FCM tokens.
- `data/fleet/vehicles`/`queues` not yet seeded with real records (Data Import AI dependency) — bridge cannot be tested end-to-end until then.

Next action:
- Main Backbone Lead: decide on remaining missing-field requests in `driver-bridge-plan.md` §6 (credential field, fcmToken field).
- Data Import AI: seed at least one real fleet/queue record.
- Product owner: supply Passenger AI's requested web apiKey/appId/messagingSenderId for `sl-transit-9464e` (separate from this AI's Android credential) to unblock the cross-cutting Firebase-config issue reported above.
- Driver Operations AI: implement bridge steps (§5) only after the above, with explicit approval for any real/live write.
