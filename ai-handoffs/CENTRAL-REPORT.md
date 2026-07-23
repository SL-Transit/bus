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

## 2026-07-23 12:00 +07 (Asia/Bangkok) - Supervisor AI / Board Closure And Remaining Work Snapshot - DONE

Scope:
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/MAIN-AI-DASHBOARD.md`
- `ai-handoffs/CENTRAL-REPORT.md`
- `tests/tracking-cancel-routing.test.js`

Summary:
- Checked latest `main` against `origin/main`: both point to `7e883dc33afef55bf372e5b048f6100e1d8b7f46`.
- Confirmed the recent owner-reviewed work is already merged: Booking1 capacity refresh via PR #13 (`e3ca71c`) and legacy Booking entrypoint cutover via PR #14 (`7e883dc`).
- Updated the central work board so completed Booking and Check Ticket bridge rows no longer look unstarted.
- Marked Driver operations runtime delivery as `BLOCKED`, not `TODO`, because the owner-paused vehicle/device identity issue still prevents safe `driverWorkByServiceDate` runtime read access.
- Added a current runtime snapshot to the main dashboard so the next AI sees the actual live compatibility phase: Booking1 is the public booking entry, central capacity counters own seat availability, Track Trip/Cancel Ticket/Check Ticket read through Ticket Center first, and driver identity remains paused.
- Updated the tracking/cancel routing regression guard so it matches the current cutover: `booking.html` is redirect-only and must not own QR/check-in tracking links; Booking1 remains the QR/tracking entry owner.

Evidence:
- Commit: this board-closure commit.
- Actions: not run yet; documentation-only change.
- Pages: not run yet; documentation-only change.
- Tests: `git status -sb`; `git rev-parse --short HEAD`; `git rev-parse --short origin/main`; `gh pr list --state open`; grep/rg audit of Booking, Track Trip, Cancel Ticket, Check Ticket, capacity, and driver-work references; `node tests/legacy-booking-entrypoint.test.js`; `node tests/booking1-preview-data.test.js`; `node tests/ticket-data-center-page-wiring.test.js`; `node tests/tracking-cancel-routing.test.js`; `git diff --check`.

Safety:
- Firebase writes: none.
- Seed: none.
- Production apply: none.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: still blocked/paused.

Blockers:
- Driver runtime work cannot be completed until the owner approves a backend-owned vehicle/device identity flow.
- Data Import / catalog dry-run and QA release guard remain separate non-runtime workstreams.
- PR #2 (`[codex] Add review check website`) remains open as an old draft/review-site PR and was not merged or closed in this pass.

Next action:
- If the owner wants every board item closed, handle Data Import dry-run and QA release guard as separate read-only/scoped passes. Do not resume paused driver identity work without explicit owner approval.

## 2026-07-23 11:25 +07 (Asia/Bangkok) - Supervisor AI / Legacy Booking Entrypoint Cutover - DONE

Scope:
- `booking.html`
- `index.html`
- `passenger.html`
- `tests/legacy-booking-entrypoint.test.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Audited the legacy `booking.html` after PR #11 and PR #13 were merged.
- Found that the old page still owned local route tables, hardcoded fares, transfer-point/buffer rules, local service-fee/total calculations, booking availability scans, queue counters, and a separate capacity ledger.
- Replaced `booking.html` with a redirect-only entrypoint to `booking1.html`.
- Updated public links in `index.html` and `passenger.html` to point directly to `booking1.html`.
- Added regression guards so the legacy entrypoint cannot silently regain direct Firebase booking reads/writes or local route/fee/total logic.

Evidence:
- Commit: merged to `main` via PR #14 at `7e883dc33afef55bf372e5b048f6100e1d8b7f46`.
- Actions: no required checks on PR; merge completed on GitHub.
- Pages: GitHub Pages deployment was checked after merge in the owner handoff flow.
- Tests: `node tests/legacy-booking-entrypoint.test.js`; `node tests/booking1-preview-data.test.js`; `node tests/booking-capacity-transaction.test.js`; `node tests/passenger-preview-normalization.test.js`; simple HTML close-tag check for `booking.html`, `index.html`, and `passenger.html`; `git diff --check`.

Safety:
- Firebase writes: none in this pass.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.

Blockers:
- Full live cross-device booking reduction still needs either an owner-run real booking or explicit approval for a controlled live test booking. This pass did not create fake operational bookings.

Next action:
- None for the legacy entrypoint cutover. Continue with separate Data Import / QA / driver-identity-blocked workstreams only.

## 2026-07-22 21:00 +07 (Asia/Bangkok) - Supervisor AI / Booking1 Capacity Refresh After Booking - DONE

Scope:
- `booking1-preview-adapter.js`
- `tests/booking1-preview-data.test.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Owner reported Booking1 still showing 3 seats for a just-booked 11:30 trip.
- Read-only Firebase verification showed the central capacity counter did decrease for booking `BK2133505594`: `/operations/bookingCapacityByServiceDate/2026-07-23/2026-07-23__คลองหาด__พนมสารคาม__11:30` has `bookedSeats=1` and `seatsAvailable=2`.
- The screenshot route was `คลองหาด -> ฉะเชิงเทรา (แปดริ้ว)`, while the verified latest counter/booking was `คลองหาด -> พนมสารคาม`, so this pass does not fabricate or backfill a counter for the screenshot route.
- Added Booking1 refresh guards so the trip list reloads from the central counter after a successful booking, after browser back/forward-cache restore, and when the tab becomes visible/focused again.
- This keeps Booking1 display-only: it still reads `availabilityDecision.seatsAvailable` from the central Booking Bridge and does not calculate seat counts locally.

Evidence:
- Commit: merged to `main` via PR #13 at `e3ca71c757580bc0592478aead0271607e59607b`.
- Actions: no required checks on PR; merge completed on GitHub.
- Pages: GitHub Pages deployment was checked after the following main merge in the owner handoff flow.
- Firebase read-only checks: `/operations/bookingCapacityByServiceDate/2026-07-22` returned `null`; `/operations/bookingCapacityByServiceDate/2026-07-23` contained the 11:30 counter for `คลองหาด__พนมสารคาม`; `/bookings/BK2133505594` confirmed `date/serviceDate=2026-07-23`.
- Tests: `node tests/booking1-preview-data.test.js`; `node tests/booking-capacity-transaction.test.js`; `node tests/booking-availability-center.test.js`; `node tests/driver-firebase-cutover.test.js`; `git diff --check`.

Safety:
- Firebase writes: none in this pass.
- Firebase reads: scoped diagnostic reads of booking/capacity nodes only.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.

Blockers:
- If the owner expects `คลองหาด -> ฉะเชิงเทรา (แปดริ้ว)` 11:30 to be reduced, the matching booking code/counter must exist for that exact pair/date/time. It was not found in the scoped read performed here.

Next action:
- None for Booking1 refresh itself. If a future screenshot shows stale seats again, verify the exact route/date/time capacity key before changing code.

## 2026-07-22 14:02 +07 (Asia/Bangkok) - Supervisor AI / Car2 LINE Central Record - DONE

Scope:
- Firebase RTDB central notification config: `/data/notificationCenter/staffLineTargets/driversByVehicleId/car2/car2_driver`
- Owner Excel workbook: `C:\Users\com\Downloads\SL-Transit_20260712_payment_contact_updated.xlsx`, sheet `08_StaffLineConfig`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Owner approved recording the car2 driver LINE user ID that was provided as evidence from the central board.
- Added `car2_driver` to the central notification target config in Firebase under `driversByVehicleId/car2`.
- Updated the owner Excel workbook row `targetKey=car2_driver`, `vehicleId=car2` with the same LINE user ID.
- Created an Excel backup before the workbook update: `C:\Users\com\Downloads\SL-Transit_20260712_payment_contact_updated.backup_before_car2_line_20260722_135816.xlsx`.
- Existing central driver targets for `car1`, `car3`, and `car4` were not changed.
- The full LINE user ID is intentionally not committed verbatim to GitHub; this report records the central path and status only.

Evidence:
- Commit: branch head of `agent/car2-line-central-record` after push.
- Actions: not run; documentation-only branch not pushed yet.
- Pages: not run; documentation-only branch not pushed yet.
- Tests: `node tests/staff-notification-center.test.js`; `node tests/staff-line-function-wiring.test.js`; `node tests/driver-firebase-cutover.test.js`; `git diff --check`.
- Firebase verification: `firebase.cmd database:get /data/notificationCenter/staffLineTargets/driversByVehicleId/car2 --project sl-transit-9464e` returned `car2_driver` with `active=true`, `displayName=Driver car2`, and `staffId=driver_002`.
- Excel verification: sheet `08_StaffLineConfig` row 15 has `targetKey=car2_driver`, `staffId=driver_002`, `displayName=Driver car2`, `vehicleId=car2`, `active=TRUE`, and the provided LINE user ID.

Safety:
- Firebase writes: exactly one owner-approved scoped config write to `/data/notificationCenter/staffLineTargets/driversByVehicleId/car2/car2_driver`.
- Firebase triggers: suppressed with `--disable-triggers` during the config write.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.
- Operational booking/ticket/passenger data: untouched.

Blockers:
- Queue/terminal LINE targets are still not configured unless the owner provides those IDs and approves a separate scoped write.
- Driver vehicle identity and `driverWorkByServiceDate` read access remain intentionally paused.

Next action:
- Push this central-board documentation branch and open a PR.

## 2026-07-22 12:39 +07 (Asia/Bangkok) - Booking Logic AI (Booking1) - BLOCKED

Scope:
- `booking1.html`, `booking1-preview-adapter.js` (redesigned trip card UI: same-group vs transfer-group stop list, route-text position, `assets/2088.png` route icon, seats display, "ที่นั่งเต็มแล้ว" state)
- `erp-calculator-center.js` (recommended-trip fallback for cross-group/reference-only pairs)
- Inspected only, not modified: `booking-bridge.js`, `booking-availability-center.js`, `tools/published-schedule-v1-dry-run.js`

Summary:
- Owner reported Booking1's redesigned trip cards don't show seat counts even though the reference design does. Root-caused against ERP data (not assumed): `booking-bridge.js#_tripFromTimeEntry()` calls `SLTransitBookingAvailabilityCenter.decideBookingAvailability()` without `capacity`/`bookedSeats`, so `availabilityDecision.seatsAvailable` is always `null` at listing time. Booking1 correctly renders nothing in that case (pure-counter rule: never fabricate a number ERP hasn't provided) — this is a real data-plumbing gap, not a Booking1 bug.
- The separately-merged `Booking1 capacity transaction` work (PR #7, `582ed32`) already tracks real `bookedSeats`/`seatsAvailable` per trip under `operations/bookingCapacityByServiceDate/{serviceDate}/{capacityKey}`, but only reads/writes that counter at booking-confirm time (`reserveBookingCapacity`/`releaseBookingCapacity`), not when the trip list is first rendered.
- Requesting whoever owns `booking-bridge.js` next (Main Backbone Lead or the capacity-transaction AI) decide the read strategy (e.g. batch-read the relevant `operations/bookingCapacityByServiceDate/{serviceDate}` node once per pair render vs. per-trip reads, with caching) and wire the resulting count into the `decideBookingAvailability()` call so `seatsAvailable` is real at listing time. Filed as a `BLOCKED` row in `WORK-STATUS.md` instead of implemented directly here because `booking-bridge.js` is shared/actively developed by another AI and this needs a real read-strategy decision, not a cosmetic patch.
- Also fixed, in the same pass: a self-inflicted display bug where `Number(null) === 0` in JS caused the "no seat data yet" case to render as a false "ที่นั่งว่าง 0 ที่นั่ง" on every card; and a stop-list icon mismatch where the single 3-element route icon (`assets/2088.png`, confirmed by the owner via screenshot) was being stretched over 2-row (same-group/direct) cards too, producing a floating unlabeled middle dot.
- Booking1 is ready to display real seats and correctly show "ที่นั่งเต็มแล้ว" + disable booking the moment `seatsAvailable` starts arriving as a real number (including `0`); no further Booking1-side change needed for that once the data is wired.
- **Update same day:** the request above was picked up and delivered — see "Booking Remaining Seats Display" report immediately below. `booking-bridge.js#loadAvailableTrips` now calls `attachRuntimeCapacity(...)`, which reads the real `operations/bookingCapacityByServiceDate/...` counter per trip and re-runs `decideBookingAvailability()` with real `capacity`/`bookedSeats` before Booking1 ever sees the trip list. Confirmed `booking1-preview-adapter.js` was not touched by that change, so Booking1's existing seats/"ที่นั่งเต็มแล้ว" rendering (already reading `trip.availabilityDecision.seatsAvailable`) picks up real numbers with no further Booking1-side change. Re-verified full test suite after merging both sides' work locally: pass (see commit evidence below).

Evidence:
- Commits: `b5f04a6`, `aa5d12c`, `eef50f4`, `a8560ee` (pushed to `main`; merged cleanly with `Booking1 capacity transaction` PR #7 at `5afc880`, and with `Booking Remaining Seats Display` PR #10 / `Cancel Capacity Release` PR #9 at `78212f0`)
- Actions: not run from this session
- Pages: not checked from this session
- Tests: `tests/booking1-preview-data.test.js`, `tests/erp-calculator-center.test.js`, `tests/booking-capacity-transaction.test.js` pass (`TZ=Asia/Bangkok`) both before and after merging PR #9/#10; full suite run, same 5 pre-existing unrelated failures as unmodified `main` (Firebase-network-dependent ERP dry-run tests, 403s in this sandbox)

Safety:
- Firebase writes: none
- Passenger/private data touched: none

Blockers:
- None remaining for this item — resolved by the "Booking Remaining Seats Display" work merged same day.

Next action:
- None; closing this row to DONE in `WORK-STATUS.md`.

## 2026-07-22 00:35 +07 (Asia/Bangkok) - Supervisor AI / Booking Remaining Seats Display - REVIEW

Scope:
- `booking-bridge.js`
- `tests/booking-capacity-transaction.test.js`
- `tests/booking1-preview-data.test.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Filled the central-board gap where ERP/Booking Bridge had a capacity transaction but did not read central remaining-seat counters back for Booking display.
- Booking Bridge now reads `operations/bookingCapacityByServiceDate/{serviceDate}/{capacityKey}` as a central read source before returning trips from `loadAvailableTrips(...)`.
- Trips are enriched with `capacity.source = booking_capacity_center` and `availabilityDecision.seatsAvailable`, so Booking1 displays the remaining seats from the central counter rather than guessing locally.
- If the central counter is missing, Booking Bridge falls back to the central capacity contract limit and zero booked seats instead of scanning bookings or inventing a count.
- Owner provided evidence for the missing `car2` LINE user ID. The board now records that evidence is available, while the actual Firebase central-config write remains a separate approval-gated action.

Evidence:
- Commit: branch `agent/booking-remaining-seats-display`, local merge with latest `origin/main` in progress.
- Actions: not run; branch update not pushed yet.
- Pages: not run; branch update not pushed yet.
- Tests: pending rerun after conflict resolution.

Safety:
- Firebase writes: none performed during implementation/tests.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.
- LINE user ID evidence: not written to Firebase and not committed verbatim to repo.

Blockers:
- Live runtime still needs read access to the central capacity counter path if Firebase rules currently block it. This pass does not change rules.
- car2 driver notification still requires a separate owner-approved Firebase write to `/data/notificationCenter/staffLineTargets/driversByVehicleId/car2/...`.

Next action:
- Resolve this branch against latest `main`, rerun tests, commit, push PR #10 update.

## 2026-07-22 00:20 +07 (Asia/Bangkok) - Supervisor AI / Cancel Capacity Release - DONE

Scope:
- `ticket-action-center.js`
- `cancel_ticket.html`
- `tests/ticket-action-center.test.js`
- `tests/ticket-action-center-page-wiring.test.js`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Extended `ticket_action_center_cancel_v1` so successful cancellation can release the original Booking1 capacity reservation.
- Cancel Ticket now loads `booking-bridge.js` and passes `window.SLBookingBridge` into Ticket Action Center.
- Ticket Action Center reads the existing `booking.capacity` contract from the ticket/booking and calls `releaseBookingCapacity(...)` through the central Booking Bridge transaction.
- If an older ticket has no capacity contract, cancellation still succeeds and the capacity release is reported as skipped instead of guessing a trip.
- Added regression guards for capacity release wiring.

Evidence:
- Commit: merged to `main` via PR #9 at `5436bab`.
- Actions: not run locally for this report.
- Pages: not run for this action-center wiring change.
- Tests: `node tests/ticket-action-center.test.js`; `node tests/ticket-action-center-page-wiring.test.js`; `node tests/booking-capacity-transaction.test.js`; `node tests/ticket-data-center.test.js`; `node tests/ticket-data-center-page-wiring.test.js`; `node tests/tracking-cancel-routing.test.js`; `node tests/booking1-preview-data.test.js`; `node tests/booking-availability-center.test.js`; `node tests/erp-calculator-center.test.js`; `node tests/driver-firebase-cutover.test.js`; `git diff --check`.

Safety:
- Firebase writes: none performed during implementation/tests.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.

Blockers:
- Live runtime still depends on existing approved write permission for the scoped booking record and capacity counter path. This pass does not change Firebase rules.
- A future backend/server action may still be preferred for stronger all-or-nothing cancellation + capacity release guarantees.

Next action:
- Continue with Booking remaining seats display PR #10.

## 2026-07-22 00:00 +07 (Asia/Bangkok) - Supervisor AI / Cancel Ticket Action Center - DONE

Scope:
- `ticket-action-center.js`
- `cancel_ticket.html`
- `tests/ticket-action-center.test.js`
- `tests/ticket-action-center-page-wiring.test.js`
- `tests/ticket-data-center-page-wiring.test.js`
- `tests/tracking-cancel-routing.test.js`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Merged PR #6 into `main`, so Track Trip / Check Ticket / Cancel Ticket now have the shared Ticket Data Center read contract on main.
- Added `ticket_action_center_cancel_v1` as the central cancellation action contract.
- Moved cancellation eligibility and cancellation write payload construction out of `cancel_ticket.html`.
- `cancel_ticket.html` now asks `SLTransitTicketActionCenter.evaluateCancellation(...)` before showing/enabling cancellation and calls `SLTransitTicketActionCenter.cancelTicket(...)` for the cancellation action.
- Added regression guards so the cancellation page does not reintroduce local `canCancel`, local departure policy calculation, or direct `db.ref(currentBookingPath).update(...)` writes.

Evidence:
- Commit: merged to `main` via PR #8 at `a15f465`.
- Actions: not run locally for this report.
- Pages: not run for this action-center wiring change.
- Tests: `node tests/ticket-action-center.test.js`; `node tests/ticket-action-center-page-wiring.test.js`; `node tests/ticket-data-center.test.js`; `node tests/ticket-data-center-page-wiring.test.js`; `node tests/tracking-cancel-routing.test.js`; `node tests/check-ticket-center-wiring.test.js`; `node tests/check-ticket-vehicle-assignment-wiring.test.js`; `node tests/check-ticket-alert-center-wiring.test.js`; `node tests/booking-capacity-transaction.test.js`; `node tests/booking1-preview-data.test.js`; `node tests/booking-availability-center.test.js`; `node tests/erp-calculator-center.test.js`; `node tests/driver-firebase-cutover.test.js`; `git diff --check`.

Safety:
- Firebase writes: none performed during implementation/tests.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.

Blockers:
- Live cancellation still depends on the existing approved client write permission for the booking record. This pass centralizes page behavior but does not change Firebase rules.
- Seat-capacity restoration after cancellation is not added in this pass; it should be a later scoped Booking Availability / Ticket Action Center transaction pass.
- Paused driver vehicle identity work remains paused.

Next action:
- Continue with Booking remaining seats display PR #10.

## 2026-07-19 00:08 +07 (Asia/Bangkok) - Supervisor AI / Booking1 Capacity Transaction - DONE

Scope:
- `booking-bridge.js`
- `booking1-preview-adapter.js`
- `tests/booking-capacity-transaction.test.js`
- `tests/booking1-preview-data.test.js`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Added a `booking_capacity_v1` contract in the Booking bridge.
- The default trip capacity is 3 seats when ERP Data Center has not yet published a capacity policy, matching the owner Excel limit.
- Booking1 now reserves seats through a Firebase transaction at `operations/bookingCapacityByServiceDate/{serviceDate}/{capacityKey}` before writing `bookings/{code}`.
- If the capacity transaction would exceed 3 seats, the booking write is blocked.
- If the capacity reservation succeeds but the booking write fails, Booking1 rolls back the reserved seats.
- ERP Calculator Center remains responsible for fare/service-fee/total arithmetic. Booking Availability/bridge owns the booking-capacity decision and transaction boundary.

Evidence:
- Commit: merged to `main` via PR #7 at `582ed32`.
- Actions: not run locally for this report.
- Pages: not run for this bridge/workflow change.
- Tests: `node tests/booking-capacity-transaction.test.js`; `node tests/booking1-preview-data.test.js`; `node tests/booking-availability-center.test.js`; `node tests/erp-calculator-center.test.js`; `node tests/driver-firebase-cutover.test.js`; `git diff --check`.

Safety:
- Firebase writes: none performed during implementation/tests.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.

Blockers:
- Live Firebase rules must already allow the scoped capacity counter write path for Booking1 runtime, or a later owner-approved rules pass will be required. This pass did not alter rules.

Next action:
- Keep the live Firebase rules caveat visible; do not change rules without a separate owner-approved pass.

## 2026-07-18 23:22 +07 (Asia/Bangkok) - Supervisor AI / Ticket Center Read Contract - DONE

Scope:
- `ticket-data-center.js`
- `check_ticket.html`
- `cancel_ticket.html`
- `tests/ticket-data-center.test.js`
- `tests/ticket-data-center-page-wiring.test.js`
- `tests/check-ticket-center-wiring.test.js`
- `tests/tracking-cancel-routing.test.js`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Added a shared `ticket_data_center_read_v1` helper for ticket lookup by booking code or phone number.
- Check Ticket and Cancel Ticket now call the shared Ticket Data Center read helper instead of each page owning its own booking lookup path logic.
- Cancel Ticket remains standalone and map-free: no redirect to Check Ticket, no Mapbox dependency, and no `trackingMap`.
- This is a read-boundary cleanup only. Cancellation eligibility/write behavior is still existing page/runtime behavior and should be moved behind an ERP Logic/Notification-owned action contract in a later scoped pass.

Evidence:
- Commit: merged to `main` via PR #6 at `6fdcb5f`.
- Actions: not run locally for this report.
- Pages: not run for this read-boundary change.
- Tests: `node tests/ticket-data-center.test.js`; `node tests/ticket-data-center-page-wiring.test.js`; `node tests/tracking-cancel-routing.test.js`; `node tests/check-ticket-center-wiring.test.js`; `node tests/check-ticket-vehicle-assignment-wiring.test.js`; `node tests/check-ticket-alert-center-wiring.test.js`; `node tests/booking1-preview-data.test.js`; `node tests/driver-firebase-cutover.test.js`; `git diff --check`.

Safety:
- Firebase writes: none performed during implementation/tests.
- Seed applied: no.
- Production apply: no.
- `database.rules.json`: untouched.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.

Blockers:
- None for this read-contract pass.
- Full cancellation action ownership still needs a separate ERP Logic/Notification Center pass.

Next action:
- Continue cancellation/action ownership in the scoped Ticket Action Center pass.

## 2026-07-18 20:55 +07 (Asia/Bangkok) - Supervisor AI / Booking1 Notification Center Bridge - DONE

Scope:
- `booking1-preview-adapter.js`
- `booking-assignment-center.js`
- `functions/index.js`
- `functions/staff-notification-center.js`
- `functions/driver-ticket-center.js`
- `ai-handoffs/NOTIFICATION-CENTER-CONTRACT.md`
- `tests/staff-line-function-wiring.test.js`
- `tests/staff-notification-center.test.js`
- `tests/driver-ticket-center.test.js`
- `tests/booking-assignment-center.test.js`

Summary:
- Booking1 real booking flow has been tested end-to-end against `sl-transit-9464e`.
- Booking pages write booking payloads to `/bookings/{code}` only; staff notification policy is not owned by the page.
- `syncDriverTicketOnBookingWrite` enriches schedule-only bookings from `operations/driverWorkByServiceDate/{serviceDate}` and ERP Data Center stop aliases at `data/erpDataCenter/groupStops`.
- `sendStaffLineOnBooking` listens to `/bookings/{code}` writes, resolves missing staff recipients through ERP Notification Center, and prevents duplicates through `/staff_line_sent/{code}`.
- Staff LINE recipients are centralized at `/data/notificationCenter/staffLineTargets`; driver recipients are keyed by `driversByVehicleId/{carId}`.
- Current driver LINE readiness: `car1`, `car3/2575`, and `car4/2649` are configured; owner has provided `car2` LINE user ID evidence, but it still needs an approval-gated Firebase central-config write before car2 driver notification can send.
- Passenger LINE remains separate: it sends to the passenger only when the booking has LINE identity and passenger notification preference.
- Stop alias hard-code for `แปดริ้ว/ฉะเชิงเทรา` was removed from driver ticket matching; alias resolution now comes from ERP Data Center.

Evidence:
- Commits: `a8391b1`, `a3ddf9e`, `908beda`, `5e9e3dc`
- Actions: not run locally; GitHub push succeeded.
- Pages: not run for this backend/function work.
- Functions deployed: `sendStaffLineOnBooking`, `syncDriverTicketOnBookingWrite`.
- Live test bookings: `BK7978267473` and `BK7991918149`.
- Firebase verification: `/staff_line_sent/BK7978267473` contains both `admin` and `driver` for `car3`; driver ticket mirror exists at `operations/driverTicketsByServiceDate/2026-07-19/car3/BK7978267473`.
- Tests: `staff-line-function-wiring`, `staff-notification-center`, `driver-ticket-center`, `booking-assignment-center`.

Safety:
- Firebase writes: owner-approved test bookings and scoped booking retry/update only; backup created at `/bookingsBackups/staffLineRetry/20260718T133649Z/BK7978267473`.
- Seed applied: no.
- Production apply: no.
- `readyForApply=false` unchanged.
- Passenger/private data touched: no bulk/private passenger export; notification targets read from central config only.
- Fake GPS/ETA/vehicle/driver assignment: none.

Blockers:
- `car2` LINE user ID evidence has been provided by the owner, but the Firebase central config is not updated in this pass, so car2 driver notification cannot send yet.
- Queue/terminal LINE targets are not configured yet, so queue/terminal notification awaits central config.
- Passenger ETA notification is future work and must use real operational ETA via ERP Logic Center + ERP Calculator Center before ERP Notification Center sends it.

Next action:
- With owner approval for Firebase write, add the provided `car2` LINE user ID to central notification config; add queue/terminal target config when owner provides those IDs.
- Continue keeping any future booking UI replacement as a bridge that writes the stable booking contract to `/bookings/{code}`.

## 2026-07-16 08:18 +07 (Asia/Bangkok) - Supervisor AI / Booking1 Real Booking ERP Totals - REVIEW

Scope:
- `booking1-preview-adapter.js`
- `booking1.html`
- `booking-bridge.js`
- `erp-calculator-center.js`
- `passenger.html`
- `passenger-logic.js`
- `check_ticket.html`
- scoped regression tests

Summary:
- Rebased the approved Passenger, Booking1, and Check Ticket ERP-center cleanup onto latest inspected `origin/main` `57fd2b2`.
- Kept owner-approved Booking1 real legacy `bookings/{code}` creation from latest main.
- Removed the Booking1 real-write payload fallback that locally multiplied fare by passenger count.
- Booking1 now fails closed before real booking write unless ERP Calculator Center returns a ready booking total.
- Real booking payload writes `price`, `fare`, `serviceFee`, and `catalogFare` from the Calculator Center result only.
- Existing scoped cleanup remains: Passenger exact ERP pair key only, Booking1 totals/seat limit/transfer display from ERP centers, and Check Ticket timetable/queue/transfer/coordinates from ERP Data Center.

Evidence:
- Commit: local only; see repository history/final Supervisor report for hash.
- Actions: not run; nothing pushed.
- Pages: not run; nothing pushed.
- Tests: all `tests/*.test.js` passed; inline script syntax checks passed for `booking1.html`, `check_ticket.html`, and `passenger.html`; `git diff --check` passed with Windows line-ending warnings only.

Safety:
- Firebase writes: none performed by this AI.
- Real booking creation: code path preserved only because owner explicitly approved option 2 for Booking1.
- Seed applied: no.
- Production apply: no.
- Firebase rules changed: no.
- Driver vehicle identity and `driverWorkByServiceDate` read access: untouched.
- Passenger/private/runtime operational data touched: none.

Blockers:
- GitHub `main` moved while work was pending; branch was rebased onto `57fd2b2` before final edits.
- Dashboard still contains older preview-only wording, now superseded for this specific owner-approved Booking1 real booking path.

Next action:
- Push only after explicit owner approval, then verify `origin/main`, Actions, Pages, and live source where relevant.

## 2026-07-15 22:16 +07 (Asia/Bangkok) - Supervisor AI / Check Ticket Preview Contract - REVIEW

Scope:
- `tools/erp-logic-center-dry-run.js`
- `tests/erp-logic-center-check-ticket-preview.test.js`
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Added pure `check_ticket_preview_v1` contract production in ERP Logic Center without wiring any page or runtime path.
- Requires approved preview safety flags, a Booking Preview snapshot, selected trip, matching `publishedSchedule` pair/time, fare contract, and explicit assignment contract.
- Produces ready-to-render ticket, journey, fare, assignment, check-in, transfer, ETA-source, journey-status, and notification-intent fields without inferring route groups from labels or selecting a vehicle locally.
- Missing dependencies, mismatched pair/time, incomplete live assignment, incomplete fare, or unsafe preview flags return explicit blockers and `readyForDisplay=false`.
- Every operational action remains false; the contract has no target path and cannot create/update/cancel/check in a ticket or deliver a notification.

Evidence:
- Implementation started from main `03b4fcbd886464413bf84d2bb22dfd31efaeb667`, then was fast-forwarded and re-tested against latest inspected main `a4f4112da0342e260689695954dfc5715f948692`.
- Commit: none; local review only, awaiting owner approval.
- Actions: not run; nothing pushed.
- Pages: not run; nothing pushed.
- Tests: syntax checks; `erp-logic-center-check-ticket-preview.test.js`; existing ERP Logic Center ticket, transfer, and booking-availability tests; scoped `git diff --check`.

Safety:
- Firebase writes: none.
- Seed applied: no.
- Production apply: no.
- Page/runtime behavior changed: no.
- Real passenger, booking, ticket, GPS, vehicle, payment, notification, LINE, operational, and private data touched: none.
- Test inputs are synthetic contract objects only.
- `check_ticket.html`, Booking pages, Driver App, `database.rules.json`, and paused driver identity/read-rule work: untouched.

Blockers:
- Runtime Check Ticket Preview remains blocked until an approved handoff supplies the Booking snapshot, selected trip, and matching preview pair to this contract.
- Latest inspected main `a4f4112da0342e260689695954dfc5715f948692` has Booking reading top-level `/publishedSchedule`, while `MAIN-AI-DASHBOARD.md` still approves only `preview/publishedSchedule` and records top-level `/publishedSchedule` as intentionally unwritten. Therefore current Booking output is not yet an approved runtime handoff for this contract.
- The existing operational `check_ticket.html` is not wired by this pure-contract pass.

Next action:
- Owner reviews the local pure contract, then explicitly approves a scoped commit if accepted. Page wiring requires a separate approval and must remain preview-only/no-write.

## 2026-07-14 15:30 +07 (Asia/Bangkok) - Supervisor AI / Check Ticket Alert Center - REVIEW

Scope:
- `erp-alert-center.js`
- `check_ticket.html`
- `tests/erp-alert-center.test.js`
- `tests/check-ticket-alert-center-wiring.test.js`
- `ai-handoffs/WORK-STATUS.md`

Summary:
- Extended ERP Alert Center once-only checks to recognize the central once-key already reserved on a ticket record, its sent-key map, or its stored LINE payload.
- Check Ticket now asks `SLTransitAlertCenter.shouldSendOnce()` inside the existing ticket transaction before reserving and sending a transfer-arrival alert.
- A repeated once-key stops before `sendLineMessage()` and returns a successful skipped result instead of creating another LINE trigger.
- The once-only decision fails closed if the Alert Center API is unavailable; Check Ticket does not invent a fallback notification rule.

Evidence:
- Base main: `37b52f91ec2877a03062f5c538930786e7b72b98`.
- Commit: owner approved a scoped local commit; see repository history.
- Actions: not run; nothing pushed.
- Pages: not run; nothing pushed.
- Tests: `node --check erp-alert-center.js`; `node tests/erp-alert-center.test.js`; `node tests/check-ticket-alert-center-wiring.test.js`; `node tests/check-ticket-center-wiring.test.js`; scoped `git diff --check`.

Safety:
- Firebase writes: none during implementation or tests.
- Seed applied: no.
- Production apply: no.
- LINE notifications sent: none.
- Passenger/private/operational data touched: none.
- `database.rules.json`, Driver App, and paused vehicle-identity/read-rule work: untouched.

Blockers:
- None for local review. Commit and push require separate owner approval.

Next action:
- Push only after separate explicit owner approval, then verify origin/main, Actions, Pages, and live source.

## 2026-07-14 16:35 +07 (Asia/Bangkok) - Data Import / ERP Architecture Handoff - REVIEW

Scope:
- `ai-handoffs/MAIN-AI-DASHBOARD.md`
- `ai-handoffs/CENTRAL-REPORT.md`

Summary:
- Recorded the owner-approved 5 ERP Centers as separate architecture boundaries: ERP Data Center, ERP Logic Center, ERP Calculator Center, ERP Alert / Notification Center, and Map Display Center.
- Clarified that ERP Data Center owns source/master/display data, including stops, routes, timetable, fares, queues, vehicles, map stop lat/lng, icons, and `publishedSchedule`.
- Clarified that ERP Logic Center owns rule decisions only: booking eligibility, transfer feasibility, check-in eligibility, journey status, assignment decisions, and whether notification is required.
- Replaced stale wording that implied ERP Logic Center owns numeric ETA/fare totals with: ERP Logic Center decides policy and uses ERP Calculator Center for numeric ETA/fare/distance/wait-time calculations.
- Clarified that ERP Calculator Center owns numeric calculation only, ERP Alert / Notification Center owns notification intent only, and Map Display Center owns display-ready map state only.
- Preserved `readyForApply=false` as the hard production stop.

Evidence:
- Commit: none yet; documentation update is local only.
- Actions: not run; not pushed.
- Pages: not run; not pushed.
- Tests: documentation stale-line scan and scoped `git diff --check`.

Safety:
- Documentation-only update.
- Firebase writes: none.
- Seed applied: no.
- Production apply: no.
- App behavior changed: no.
- Booking, passenger, ticket, driver, live vehicle, payment, LINE, operational, and private data touched: none.
- Unrelated local `database.rules.json` and `outputs/` changes were not included.

Blockers:
- None for this documentation update.

Next action:
- Commit/push this docs-only handoff update only after explicit approval, excluding unrelated `database.rules.json` and generated JSON/output files.

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
