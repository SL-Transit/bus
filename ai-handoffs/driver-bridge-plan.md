# Driver / Operations AI — Bridge Plan (Audit Pass)

Status: REVIEW (audit + plan only — no code changes, no Firebase writes, no schema changes)
Date: 2026-07-05 (Asia/Bangkok)

## 1. Files Inspected

`driver-android/src/main/java/com/sanamchai/drivergps/`:
- `MainActivity.java` — UI, prefs, vehicle identity, schedule refresh, QR check-in
- `GpsService.java` — foreground GPS service, Firebase write loop, connection/queue logic
- `BootReceiver.java` — restart/watchdog on boot and OEM quickboot events

Also inspected (read-only, for schema alignment): `erp-schema.js`, `erp-data-adapter.js`, `admin-erp.html` (Fleet tab).

## 2. Current State (as of `main`)

- App still writes GPS to a **flat legacy path** `liveVehicles/{queueId}` (old project `bus-booking-1d68c`), not `operations/liveVehicles` from the backbone contract.
- Vehicle identity is a **hardcoded array** `car1`–`car5` (`MainActivity.java`), auto-assigned to whichever device installs the app first, with **no authentication at all** — any device can claim any vehicle identity.
- No concept of `queueId` vs `vehicleId` vs `ownerId` as three separate entities — the app conflates them into one string (e.g. `"car1"`).
- No FCM / push notification integration currently in `main` (not yet touched this pass).

## 3. Identity Mapping — App Concept → Backbone Path

| App concept today | Backbone path (per `erp-schema.js`) | Notes |
|---|---|---|
| hardcoded `car1`..`car5` string | `data/fleet/vehicles/{vehicleId}` — requires `vehicleId`, `status` | App's string should become the `vehicleId` key. `plateNo` is stored as `name` in the admin Fleet form, not as the key itself. |
| (none — not modeled) | `data/fleet/queues/{queueId}` — requires `queueId`, `groupId`; optional `vehicleId`, `ownerId` | This is where "which vehicle serves which route slot" belongs. App does not read this today. |
| (none — not modeled) | `data/fleet/queueOwners/{ownerId}` | Owner/driver-person record. Not the same as `vehicle`. |
| flat `liveVehicles/{queueId}` | `operations/liveVehicles/{vehicleId}` (required collection, but **no record shape defined yet** in `RECORD_REQUIREMENTS`) | Path key should be `vehicleId`, not `queueId` — queue assignment can change per day/shift; the physical vehicle is the stable GPS source. |

## 4. Mock Test Data (dry-run only — not written to Firebase)

```json
{
  "data": {
    "fleet": {
      "vehicles": {
        "MOCK_V001": { "vehicleId": "MOCK_V001", "status": "active", "name": "70-1234", "groupId": "G01", "queueId": "MOCK_Q001" }
      },
      "queues": {
        "MOCK_Q001": { "queueId": "MOCK_Q001", "groupId": "G01", "vehicleId": "MOCK_V001", "ownerId": "MOCK_O001" }
      },
      "queueOwners": {
        "MOCK_O001": { "ownerId": "MOCK_O001", "ownerName": "Mock Owner" }
      }
    }
  },
  "operations": {
    "liveVehicles": {
      "MOCK_V001": {
        "vehicleId": "MOCK_V001",
        "lat": 13.501,
        "lng": 101.001,
        "speed": 0,
        "heading": 0,
        "updatedAt": 1751600000000,
        "serviceStatus": "idle",
        "queueId": "MOCK_Q001",
        "currentTripId": null
      }
    }
  }
}
```
This mock block matches the now-defined `liveVehicle` schema (`vehicleId, lat, lng, updatedAt, serviceStatus`, plus optional `queueId`/`currentTripId` reference fields) confirmed in `erp-schema.js` as of this update. It is for local/manual testing only — nothing here has been written to any Firebase project.

## 5. Proposed Bridge Steps (implementation gated on backbone readiness)

1. ~~Main Backbone Lead defines a `liveVehicle` entry in `RECORD_REQUIREMENTS`~~ **DONE** — confirmed in `erp-schema.js`.
2. Driver app resolves its own `vehicleId` (currently: local hardcoded string) by matching against `data/fleet/vehicles` instead of a hardcoded array.
3. Driver app writes GPS to `operations/liveVehicles/{vehicleId}`, keyed by `vehicleId`, not `queueId`, using the confirmed field names (`lat`, `lng`, `updatedAt`, `serviceStatus` — note: `serviceStatus` replaces this AI's earlier ad hoc `in_service`/`off_duty` naming from before this schema existed; must use `VALID_LIVE_VEHICLE_STATUS` enum values instead: `active, moving, idle, standby, off_duty, offline`).
4. Driver app treats `queueId` as a separate, day-scoped assignment read from `data/fleet/queues` (which queue this vehicle is currently serving), not something it invents itself, and writes it plus `currentTripId` onto its own `operations/liveVehicles/{vehicleId}` record per the now-defined optional reference fields.
5. None of steps 2–4 should be implemented for real until: (a) `data/fleet/vehicles` / `queues` have real seeded records (Data Import AI dependency), (b) missing-field requests #2–3 below are resolved, and (c) explicit approval to write live/real driver data is given, per Hard Constraints.

## 6. Missing Fields / APIs (requests to Main Backbone Lead — not actioned by this AI)

1. ~~**`operations/liveVehicles` record shape is undefined.**~~ **RESOLVED** — Main Backbone Support AI added `liveVehicle: ['vehicleId', 'lat', 'lng', 'updatedAt', 'serviceStatus']` plus `VALID_LIVE_VEHICLE_STATUS` (`active/moving/idle/standby/off_duty/offline`) and reference validation for `vehicleId`→`fleetVehicles`, `queueId`→`fleetQueues`, `currentTripId`→`catalogTrips` (commits `b631137`/`34bf49f`/`258eac9`). Bridge plan §5 above already targets this shape.
2. **No login/credential field exists anywhere in the schema.** The product owner's direction (separate from this coordination framework, given directly in an earlier session) was: admin/ERP assigns each vehicle a login of plate number + password, no SMS. This needs either (a) a new typed field on `data/fleet/vehicles` (e.g. `authPasswordHash`, explicitly `.read: false` in security rules), or (b) a decision that credentials live in a separate collection entirely. Requesting Main Backbone Lead's decision before any schema field is added.
3. **No push-notification token field.** If/when "notify driver on new booking" is approved, a field such as `fcmToken` on the vehicle record (or a separate `data/fleet/vehicleTokens` collection, if the Main Backbone Lead prefers keeping tokens out of the core vehicle record) is needed.
4. **No `saveLiveVehicle`/write accessor in `erp-data-adapter.js`.** Only `watchLiveVehicles` (read) exists today. The Android app uses the native Firebase SDK directly rather than this JS adapter, so this isn't a hard blocker for the Android side, but the missing write accessor means no web-side tool (admin/QA) can simulate or inspect a live-vehicle write yet either.
5. **No audit-log record shape defined** for `operations/auditLogs`, needed if driver-facing manifest/PII access logging is approved later.

## 7. Safety / Risk Notes

- Current `main` driver app has **no authentication and a hardcoded 5-vehicle list** — this is a real security gap (any installed copy of the app can claim any vehicle identity with zero verification), independent of the backbone migration. Flagging for visibility; not fixing in this pass per Hard Constraints (real driver-identity changes need explicit approval).
- `operations/liveVehicles` is public-read in current rules drafts seen this session — reasonable for a public "where's my bus" map, but the record shape (§6 item 1) should avoid including anything passenger-identifying (it shouldn't — GPS/vehicle telemetry only).
- Any future manifest/PII feature (driver sees passenger name/phone for their queue) must not read `operations/bookings`/`operations/passengers` directly from the client — needs a server-side function with field minimization, per Hard Constraint "Do not create, modify, or read real passenger/private data unless explicitly approved."

## 8. Real-Device Test Checklist (for when implementation is approved)

- [ ] Fresh install, no prior login state — app must not auto-assign any vehicle identity.
- [ ] Vehicle identity resolves only from a real `data/fleet/vehicles` record match, never a local fallback list.
- [ ] GPS write lands at `operations/liveVehicles/{vehicleId}`, confirmed via a read-only listener (not the writing device).
- [ ] Killing the app (swipe from recents) — GPS write resumes via `BootReceiver`/watchdog without manual relaunch.
- [ ] Airplane-mode toggle test — pending writes flush once connectivity returns; no duplicate/stale points land out of order.
- [ ] Two devices cannot claim the same `vehicleId` simultaneously (needs a decision from Main Backbone Lead on whether this is enforced server-side or is out of scope for v1).
- [ ] Battery/OEM background-restriction check on at least one non-stock Android skin (e.g. MIUI/ColorOS/MagicOS), since this fleet's devices are known to vary.
- [ ] Confirm no passenger PII of any kind appears in Logcat/device logs during normal operation.

## 9. Status of Previously-Drafted Work (this session, pre-dating this coordination framework)

Earlier in this conversation (before `ai-handoffs/` existed), the product owner directly asked for and approved: real plate+password login, a `getDriverManifest` Cloud Function, FCM push notifications, and rule changes — implemented against an ad hoc schema (`data/fleet/roster`, password/phone directly on the vehicle record) that predates and diverges from the now-canonical `erp-schema.js` (which separates `vehicles`/`queues`/`queueOwners` and has no roster/credential/token fields at all).

That work was pushed to a separate branch (`driver-app`), not `main`, and has **not** been merged. Recommending it be treated as a reference draft only — the actual implementation should be redone against whatever schema decision comes out of items in §6, not merged as-is.

## Next Action

- Main Backbone Lead: decide on §6 items 1–3 (liveVehicle shape, credential field location, token field location).
- Data Import AI: seed `data/fleet/vehicles`/`queues` with at least one real (non-mock) record so bridge steps in §5 can be tested end-to-end.
- Driver Operations AI: on approval, implement §5 steps against real schema, using the mock block in §4 as the initial test fixture.
