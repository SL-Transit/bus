# Passenger Bridge Plan

Author: Passenger AI
Date: 2026-07-05 17:36 +07 (Asia/Bangkok)
Status: REVIEW — audit + plan only, no code changed this pass

## 1. Inspected files

- `passenger.html` (current live: commit `6ca72a7`)
- `passenger-logic.js` (current live: commit `6ca72a7`)
- `erp-schema.js` (backbone contract, Main Backbone Lead, commit `08c1947`/`3ed7e93`/`119e4cd`/`3bb1fef`)
- `erp-data-adapter.js` (backbone data layer, Main Backbone Lead, commit `1786b91`)
- `erp-engine.js` (shared schedule/fare helper — already used by `booking.html` and `check_ticket.html`)
- `catalog-engine.js` (shared stop/catalog alias helper)
- `ai-handoffs/*` (coordination docs)

No Firebase reads beyond what `passenger.html` already runs in production (`data/settings`, `data/catalog`, `operations/liveVehicles`). No passenger/private records touched. No Firebase writes.

## 2. Field-by-field mapping: passenger display → backbone path

| Passenger display | Current source in `passenger-logic.js` | Backbone path (per `erp-schema.js`) | Status |
| --- | --- | --- | --- |
| Stop markers on map (name, lat/lng, order, icon, transfer badges) | `SLTransit.db.getStops()` → `data/catalog/stops` | `data/catalog/stops` | ✅ already on-contract |
| Live vehicle position/heading/speed on map | `watchLiveVehicles()` → `operations/liveVehicles` | `operations/liveVehicles` | ✅ path on-contract, **record shape not yet in `erp-schema.js`** (see §4) |
| Test-mode banner | `data/settings` (`settings.testMode`) | `data/settings` | ✅ on-contract |
| Schedule time grid (direct routes) | `getPairTimes()` → tries `SLTransitERP.routeTimes(catalog, from, to)` first (reads `data/catalog/routes` + `data/catalog/trips` — on-contract), **falls back** to `ADMIN_ROUTE_TIMES` built from legacy `data/settings.routes` shape | `data/catalog/routes` + `data/catalog/trips` (target); `data/settings.routes` (legacy fallback, off-contract) | ⚠️ dual path, see §3 |
| LEG2 / transfer schedule | Same as above via `LEG2_DESTINATIONS`, built from the same legacy `data/settings.routes` parser | same | ⚠️ same dual path |
| Origin/destination dropdown lists | `ORIGIN_LIST` / `DEST_NORMAL` / `DEST_LEG2`, populated only by the legacy `data/settings.routes` parser (`applyPassengerRouteSettings`) | should be `data/catalog/routes` (list of `fromStopKey`/`toStopKey` pairs) | ❌ **no backbone-native path today** — needs `getRoutes()` (see §4) |
| PDPA location consent | `localStorage` only, never Firebase | n/a (correct — passenger-side only, no backend involvement) | ✅ |

## 3. Hard-coded / duplicated route logic found

1. **`applyPassengerRouteSettings()`** (`passenger-logic.js`) is a from-scratch parser for an old `data/settings.routes` shape (`{ groupId: { name, routes: [{ from, to, times, disabledTimes }] } }`). This shape does not exist in `erp-schema.js` at all — it is a pre-backbone artifact. It populates `ROUTES`, `ADMIN_ROUTE_TIMES`, `ADMIN_ROUTE_DISABLED_TIMES`, `ORIGIN_LIST`, `DEST_NORMAL`, `DEST_LEG2`, `LEG2_DESTINATIONS` — all passenger-local state with no equivalent in `booking.html`.
2. This duplicates logic that already exists correctly in the shared `erp-engine.js` (`routeTimes`, `routeDisabledTimes`, `catalogView`) — which is already the **first-choice path** in `getPassengerErpTimes()`/`getPassengerErpDisabledTimes()`, and is the same helper `booking.html`/`check_ticket.html` use. So passenger.html already has the right shared bridge for **times on a known from/to pair** — it just has no backbone-native way to build the **list of valid from/to pairs** (origin/destination dropdowns), which is why the legacy parser still exists as the only source for that.
3. **Practical consequence today:** since `data/catalog/routes` and `data/catalog/trips` are still empty (Data Import AI has not run a seed yet, per `WORK-STATUS.md`), `SLTransitERP.routeTimes()` always returns `null`, so 100% of passenger schedule data currently comes from the legacy `data/settings.routes` fallback. This is expected during the transition, not a bug, but the dropdown/time-grid code path should be re-pointed once catalog data exists — see §5 for the safe order of operations.
4. No hard-coded **stop coordinates** or **stop order** remain in `passenger.html`/`passenger-logic.js` — both were removed in commit `52f5c34` (now sourced from `data/catalog/stops` only).
5. No hard-coded **fare/price** values found in the current file (fares are optional-display and not currently rendered on `passenger.html`).

## 4. Missing backbone fields/APIs (requests to Main Backbone Lead — not implemented by Passenger AI)

1. **`SLTransit.db.getRoutes()`** — `erp-data-adapter.js` already loads the full `data/catalog` tree into `_catalog.routes` at init (`refreshCatalog()`), but only exposes `getRoute(routeId)` (single lookup). Passenger (and booking) need a list accessor to build origin/destination pickers without route IDs known in advance. Proposed signature: `getRoutes()` → `Promise<Array<route record, each with routeId injected>>`, sorted stable (e.g. by `sortOrder` if present, else insertion order) — mirrors the existing `getStops()` pattern.
2. **`SLTransit.db.getTrips(routeId)`** (or `getTrips()` unfiltered) — same gap for trips; needed to compute a from/to pair's list of departure times directly from `data/catalog/trips` instead of the `erp-engine.js` `routeTimes()` per-pair scan, and needed by the Data Import AI validation cycle too.
3. **`operations/liveVehicles` record shape is not declared in `erp-schema.js`.** `RECORD_REQUIREMENTS` covers `stop`/`route`/`trip`/`vehicle`/`queue` but not the live-vehicle broadcast record. Passenger currently expects (from the driver app, per earlier handoff): `{ lat, lng, speed, heading, updatedAt, vehicleId, queueId, currentTripId, serviceStatus }`. Requesting Main Backbone Lead (in coordination with Driver Operations AI) formalize this in `erp-schema.js` so `validateSnapshot()` can check it like the other collections.
4. **No documented relation between `operations/liveVehicles.queueId`/`currentTripId` and `data/catalog/trips`/`data/fleet/queues`.** Once trips exist, passenger will want to show "which trip stop-sequence a vehicle is on" using `trip.stopTimes` — confirm whether `currentTripId` is the join key.

None of the above requires a passenger-side Firebase write or schema-path change; both are additive read-only functions Main Backbone Lead (or Main Backbone Support AI) can add to `erp-data-adapter.js`/`erp-schema.js` without touching `passenger.html`.

## 5. Bridge plan (implementation order, once approved)

Only step 5.1 is currently safe to implement without further backbone work; steps 5.2+ are blocked on §4.

1. **No action needed now** — passenger already reads `data/catalog/stops`, `data/settings`, `operations/liveVehicles` on-contract; no path changes required.
2. Once `getRoutes()`/`getTrips()` land (§4.1–4.2): replace `applyPassengerRouteSettings()`'s dropdown-building with a backbone-native builder (group trips by `fromStopKey`/`toStopKey`, label via `data/catalog/stops`), remove `ROUTES`/`ADMIN_ROUTE_TIMES`/`ADMIN_ROUTE_DISABLED_TIMES`/`ORIGIN_LIST`/`DEST_NORMAL`/`DEST_LEG2`/`LEG2_DESTINATIONS` entirely.
3. Once Data Import AI seeds real `data/catalog/routes`/`trips`: verify `SLTransitERP.routeTimes()` returns real data end-to-end (currently untestable — collections are empty) and retire the legacy fallback parser only after that's confirmed working, so passenger schedule display never goes blank mid-migration.
4. Formalize `operations/liveVehicles` record shape in `erp-schema.js` (Main Backbone Lead + Driver Operations AI) so the passenger map's field expectations are validated, not just assumed.

## 6. Open item raised directly by product owner (not backbone-related, flagging before acting)

Product owner asked in this session to restore the real Longdo Maps API in `passenger.html` ("เอา longdo map api กลับมา เราแค่แยก logic ไม่ใช่ให้ longdo map api ออก"). Current live `passenger.html` (since `52f5c34`) uses Leaflet with a Longdo-API-compatible shim (`window.longdo` implemented on top of Leaflet in `passenger-logic.js`) so the existing GPS/Kalman/animation code didn't need to change. This is a map-rendering-engine choice, independent of the data backbone — it doesn't touch any schema path and doesn't require Main Backbone Lead review. Flagging it here rather than reverting silently, since it undoes tested, already-pushed work; will implement as a separate, isolated commit once confirmed, with the same "preserve existing vehicle-tracking behavior" constraint as before.

## 7. Risks

- Passenger schedule currently has **zero real backbone-sourced schedule data** (empty `data/catalog/routes`/`trips`) — 100% dependent on the legacy `data/settings.routes` fallback. If that Firebase node is ever cleared before the catalog is seeded, passenger schedule breaks with no fallback.
- `operations/liveVehicles` record shape is only documented informally (in passenger's own code comments) — any driver-app change to field names without updating `erp-schema.js` would silently break passenger's map with no validator catching it.
- `getRoutes()`/`getTrips()` additions are the responsibility of Main Backbone Lead per `COORDINATION-RULES.md` file-ownership table (`erp-data-adapter.js` is lead-only) — Passenger AI should not add them directly even though the change is small, to avoid a merge collision with backbone work already in `REVIEW`.

## 8. Test checklist (for whoever implements §5)

- [ ] `getRoutes()`/`getTrips()` unit-checked against a snapshot with populated `data/catalog/routes`/`trips` (mock, no live Firebase writes)
- [ ] Passenger dropdown list matches `booking.html`'s origin/destination list for the same catalog snapshot (parity check)
- [ ] Schedule time grid for a known from/to pair matches `booking.html`'s times for the same pair (parity check)
- [ ] Fallback path (legacy `data/settings.routes`) still renders correctly if catalog routes/trips are empty (regression guard during transition)
- [ ] `operations/liveVehicles` schema validator (once added) flags a deliberately malformed test record in a **local mock only**, never against real data
- [ ] No passenger/private data path touched (`operations/bookings`, `operations/passengers` untouched — confirmed not referenced anywhere in `passenger.html`/`passenger-logic.js`)

## Safety statement

- Firebase writes: none.
- Passenger/private data touched: none — confirmed `operations/bookings` and `operations/passengers` are not referenced anywhere in `passenger.html` or `passenger-logic.js`.
- Schema paths changed: none (this pass is audit + plan only).
- Booking logic changed: none.
