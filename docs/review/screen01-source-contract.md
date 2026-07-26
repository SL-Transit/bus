# Screen 01 Source-Contract Report

Status: corrective PR 18 report before enabling production calculations.

This report documents technical evidence found in the repository. Owner confirmation is still needed for business meaning and final rules; the Dashboard must not present proposed sources as Owner-approved operational totals.

| Domain | Status | Firebase path/query | Canonical ID | Service-date field | Status fields | Timestamp fields | Amount fields | Permission assumptions | Related modules |
|---|---|---|---|---|---|---|---|---|---|
| Booking | proposed | `operations/bookings.orderByChild('date').equalTo(serviceDate)` | `bookingId`, `code`, `id`, or record key | `date` is the indexed/query field; `serviceDate` is accepted only for fixture/backward parsing | `status`, `bookingStatus` | `updatedAt`, `createdAt`, `reservedAt` | none for booking count | `operations/bookings` requires authenticated read; Admin read permission must be approved | `erp-data-adapter.js`, `database.rules.json`, `booking-capacity.js` |
| Payment | unresolved | not confirmed | unresolved | unresolved: service date vs payment date not confirmed | unresolved | unresolved | unresolved | Do not enable revenue until source/rules are confirmed | `functions/index.js`, `booking-bridge.js` |
| Refund | unresolved | not confirmed | unresolved | unresolved | unresolved central lifecycle | unresolved | unresolved | Do not enable refund KPI until source/rules are confirmed | `ticket-action-center.js`, `cancel_ticket.html` |
| Vehicle runtime | proposed | `operations/liveVehicles` plus `operations/driverWorkByServiceDate/{serviceDate}` | `vehicleId`, `runtimeVehicleId`, `id`, or record key | driver work path date | live vehicle `serviceStatus`; driver work `status`, `workState`, `serviceState`, `activeTripId`, `currentTripId`, `tripId` | `gpsTimestamp`, `locationUpdatedAt`, `updatedAt`, `lastSeenAt` | none | Broad `driverWorkByServiceDate` read is restricted by rules; Admin permission/role contract must be approved | `erp-schema.js`, `functions/driver-work-auto-center.js`, `database.rules.json`, `driver-android/.../MainActivity.java` |
| Incident | unresolved | not confirmed | unresolved | unresolved | unresolved | unresolved | none | Display unavailable until an incident/blackbox source is approved | `erp-alert-center.js`, `staff-notification-center.js` |
| System health | unresolved | no consolidated health contract found | module-specific source read states only | not date-scoped unless source says so | unresolved | unresolved | none | UI must say data-connection status, not application health | none confirmed |
| Recent activity | proposed | `operations/notificationEvents.limitToLast(50)`, `data/erpDataCenter/meta/audit.limitToLast(50)` | record key | optional | `event`, `type`, `status` | `createdAt`, `updatedAt`, `timestamp`, `at` | none | Read-only activity preview only; not a full audit contract | `erp-admin-master-data.js`, `functions/index.js` |

## Evidence

- `erp-data-adapter.js` contains `watchBookings(date)` and uses `operations/bookings.orderByChild('date').equalTo(date)`.
- `database.rules.json` declares `operations/bookings` with `.indexOn`: `date`, `originKey`, `destKey`, `status`.
- No `operations/bookingsByServiceDate/{serviceDate}` path was found in the repository.
- `functions/driver-work-auto-center.js` writes daily driver work contracts to `operations/driverWorkByServiceDate/{serviceDate}/{vehicleId}`.
- `driver-work-center.js` defines `driver_work_v1`: stored contracts use `status: assigned`, `service_complete`, or `unassigned`, and include `currentTrip`/`nextTrip`.
- `erp-schema.js` validates `operations/liveVehicles` fields including `lat`, `lng`, `serviceStatus`, `vehicleId`, `queueId`, and `currentTripId`.
- `database.rules.json` restricts `driverWorkByServiceDate` reads to authenticated driver identity matching a runtime vehicle. This means Admin Console broad read access is not confirmed in this PR.

## Corrected Vehicle Model

Operational state and telemetry state are separate.

Availability is also separate:

- `fleet.operational.status`, `fleet.operational.activeServiceCount`, and `fleet.operational.error` come from `operations/driverWorkByServiceDate/{serviceDate}`.
- `fleet.telemetry.status`, `fleet.telemetry.vehicles`, and `fleet.telemetry.error` come from `operations/liveVehicles`.
- A failure in one source must not discard valid data from the other source.

Operational state:

- `active_service`: `driver_work_v1` contract has `status: assigned` and a real `currentTrip` object.
- `inactive`: `driver_work_v1` contract has `status: assigned` with only `nextTrip`, or `status: service_complete`, or `status: unassigned`.
- `unknown`: vehicle appears only in live GPS data and has no matching driver-work contract for the selected service date.
- `unknown`: driver work has an unknown `contractVersion` or unsupported shape.

Telemetry state:

- `live_gps`: valid coordinate and GPS timestamp within the configured freshness threshold.
- `stale_gps`: valid coordinate exists but timestamp is missing or older than the threshold.
- `missing_gps`: no valid coordinate or no live vehicle record for a vehicle that exists in driver work.

The KPI "รถที่กำลังวิ่ง" uses `active_service` count only. It does not use total `operations/liveVehicles` records.

Unsupported generic status strings such as `ready`, `active`, or `running` are not enough to mark active service unless the confirmed `driver_work_v1` shape proves current service with `status: assigned` and `currentTrip`.

Partial fleet behavior:

- Driver Work readable + Live Vehicles unavailable/error: preserve `active_service` count, show operational data, mark telemetry unavailable/error, and do not create map positions.
- Live Vehicles readable + Driver Work unavailable/error: preserve real GPS markers, mark operational state as `unknown`, and make the active-service KPI unavailable/error. GPS alone never means running.
- Both readable: combine by union of vehicle IDs.
- Both empty: use read-empty behavior.

## GPS Freshness

No Owner-confirmed GPS freshness configuration source was found. The read model accepts a runtime `gpsStaleMs` contract. If none is passed, it uses a temporary proposed default of 5 minutes and labels it as proposed. This default is only for deterministic read-only review and is not a production rule.

## Service-Date Query Decision

Decision for PR 18: use the repository's existing indexed query:

`operations/bookings.orderByChild('date').equalTo(serviceDate)`

Do not read all `operations/bookings` and filter in the browser. Do not create or modify Firebase Rules/indexes in this PR.

Unresolved future option:

- If Owner wants a materialized read model, create `operations/bookingsByServiceDate/{serviceDate}` in a separate approved task.

## Error-State Behavior

- Successful read with zero records: `empty`, count may be `0`.
- No Firebase/config/adapter: `unavailable`, count is `null`, UI displays `ยังไม่ได้เชื่อมต่อ`.
- Permission/network/read failure: `error`, count is `null`, UI displays `อ่านข้อมูลไม่ได้`.
- Unconfirmed source contract with readable records: `proposed`, UI displays `รอยืนยันแหล่งข้อมูล`.
- Unconfirmed source contract with zero records: status may be `empty`, but `contractStatus: proposed` is preserved and UI displays `รอยืนยันแหล่งข้อมูล - ยังไม่มีรายการที่อ่านพบ`.
- Unresolved contract: `unresolved`, UI displays unavailable/no data instead of invented values.

Top-level model states:

- `unavailable`: every read source is unavailable, usually missing Firebase/config/adapter.
- `unavailable_partial`: some sources read successfully while other required sources are not connected.
- `error`: every available read failed or only error/unavailable states are present.
- `error_partial`: at least one source failed while at least one other source is readable.
- `proposed_partial`: at least one proposed source is readable and no read source failed.
- `empty`: every read source succeeded with zero records.

Connection-status panel behavior:

- `unavailable`: `ยังไม่ได้เชื่อมต่อ`
- `error`: `อ่านข้อมูลไม่ได้`
- `empty`: `ไม่มีข้อมูล`
- `proposed`: `เชื่อมต่อบางส่วน`
- `unavailable_partial`: valid partial data is preserved, while unavailable parts remain clearly marked.

Activity model:

- Activities are normalized as `{ status, items, errors, sources }`.
- Notification/Audit read failures are shown as `อ่านข้อมูลไม่ได้`, not as an empty-activity message.
- Activity `empty + unavailable` and `proposed + unavailable` are `unavailable_partial`, not `empty`.

## Legacy Source Rejected

- `/bookings` is legacy/public booking storage. It is not used as automatic Dashboard fallback.
- `operations/bookings` and `/bookings` are not concatenated.
- Screenshot values are not data contracts.

Revenue and refund remain intentionally unavailable in runtime until these are confirmed:

- authoritative data source
- canonical amount field
- paid status
- cancellation handling
- refund-pending status
- completed refund handling
- partial refunds
- service date versus payment date
