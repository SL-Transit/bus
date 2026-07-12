# SL-Transit Main AI Dashboard

Purpose: coordinate the main AI roles while ERP Data Center is completed as the blocking core of the SL-Transit travel network platform.

## Current Priority: ERP Data Center Near Completion / Continue ERP Logic Center

Owner status:
- ERP Data Center is near completion.
- Firebase preview data has already been written and independently verified at `preview/publishedSchedule`.
- `readyForReview=true`
- `readyForApply=false`
- Production apply is still not approved.

Progress:
- ERP Data Center: about 99.5%
- Passenger Preview Readiness: about 98%
- Whole SL-Transit production readiness: about 60%

Important reminder:
- ERP Data Center is almost complete, but the system is not fully finished because ERP Logic Center work remains.
- Do not forget pending legacy logic migration.
- Work must proceed in order. If the main task is waiting or blocked, continue the next safe dependency task instead of jumping to unrelated production work.
- While Passenger Preview or other main UI work is waiting, continue ERP Logic Center.

Pending legacy logic that must be inventoried and centralized:
- 2.5 km check-in radius
- distance / geofence logic
- passenger near-transfer notification
- LINE notification trigger
- ETA calculation
- transfer feasibility
- queue / vehicle / trip assignment
- booking availability / capacity
- ticket/check-in policy

ERP Logic Center immediate work order:
- Read and inventory old business logic currently scattered across UI pages and helper engines.
- Identify which logic belongs in ERP Logic Center, which logic stays as UI display-only, and what must be kept as Notification Service / operational runtime behavior.
- Start read-only/design-first unless the owner separately approves implementation.
- Do not write Firebase.
- Do not seed.
- Do not production apply.
- Do not touch bookings/passengers/tickets/driver/live vehicle/payment/LINE data.

## 2026-07-12 Active Work Orders: Passenger / Booking / Check Ticket

Plain owner summary: ERP Data Center preview data has been written and read back successfully at `preview/publishedSchedule`. Passenger, Booking, and Check Ticket may now work against the preview data only. Do not write production data, do not seed, and do not enable production booking.

Current approved preview source:
- Firebase preview path: `preview/publishedSchedule`
- Source commit: `9599a7b5d7af2916cc0be09f7136518a6c8fcad3`
- Backup metadata path: `previewBackups/publishedSchedule/20260712T072812Z_9599a7b5d7af2916cc0be09f7136518a6c8fcad3`
- Top-level `publishedSchedule`: intentionally not written
- Preview metadata: `dryRun=true`, `writesEnabled=false`, `readyForApply=false`, `productionReady=false`, `publicationStatus=preview`
- Verified counts: origins 15, destinations 49, visible pairs 471, schedule time rows 819, feasible transfer reference pairs 264, infeasible transfer audit pairs 58, transfer unknown pairs 0
- Safety verified: no GPS, ETA, live vehicle, vehicle assignment, driver, booking, ticket, payment, LINE, notification, or operations data in the preview payload

### ERP Logic Center AI: approved parallel work

Appointed role:
- Official role name: `ERP Logic Center AI`.
- Owner intent: this AI owns the central business logic layer for SL-Transit, similar in importance to ERP Data Center AI.
- Position in architecture: `ERP Data Center -> ERP Logic Center -> Page Logic Adapters -> UX/UI`.
- ERP Data Center stores facts and versioned source data. ERP Logic Center turns those facts into decisions and journey results.
- Passenger, Booking, Check Ticket, Driver, Payment, and LINE must consume ERP Logic Center results instead of recreating business rules locally.

Core ownership:
- Journey planning and route choice.
- Transfer feasibility and transfer wait-time interpretation.
- ETA and distance/geofence interpretation when real operational evidence exists.
- 2.5 km check-in radius and ticket/check-in policy.
- Queue, vehicle, trip, assignment, and schedule-readiness interpretation.
- Booking availability, capacity, closed-stop, and owner override rules.
- Notification decision rules, including LINE trigger eligibility, without directly sending messages unless separately approved.
- Fare/fee/payment ownership interpretation from ERP-approved data.
- Preview vs production gating: `readyForReview`, `readyForApply`, `productionReady`, and reference-only states.

Non-ownership:
- ERP Logic Center must not own raw master data storage; that belongs to ERP Data Center.
- ERP Logic Center must not own UI rendering; that belongs to Page Logic Adapters and UX/UI pages.
- ERP Logic Center must not write Firebase runtime paths, create bookings, send notifications, seed production data, or mutate operational/private data unless the owner separately approves a production apply step.
- ERP Logic Center must not invent fake GPS, fake ETA, fake vehicle, fake driver, fake ticket, fake assignment, fake capacity, or fake payment state.

Goal: prepare the preview-safe journey planning logic contract and dry-run resolver that consumes `preview/publishedSchedule` without changing Passenger, Booking, Check Ticket, Driver, LINE, or production data.

This work can proceed while Passenger Preview implementation is waiting. It must remain logic/design/dry-run only unless the owner separately approves implementation.

First required pass:
- Read and inventory the existing legacy logic that must be migrated or centralized before building new ERP Logic Center behavior.
- Inspect at least: `geo-engine.js`, `network-engine.js`, `ticket-policy-engine.js`, `line-event-engine.js`, `schedule-engine.js`, `booking-bridge.js`, `booking-capacity.js`, `booking-pos.js`, `passenger-logic.js`, and `check_ticket.html`.
- Focus on radius/geofence logic, 2.5 km check-in radius, ETA calculation, LINE notification trigger, ticket/check-in policy, transfer feasibility, queue/vehicle/trip assignment, booking capacity/closed-booking rules, Passenger live vehicle display logic, and any UI-local business rules that should move to ERP Logic Center.
- Return a migration inventory before changing code: discovered logic groups, current file/function locations, what moves to ERP Logic Center, what remains UI display-only, risks if left duplicated, recommended migration order, and no-write confirmation.

Required behavior:
- Read the verified preview contract from `preview/publishedSchedule` as the input shape.
- Build or design a resolver boundary that can answer: origin, destination, visible route choices, reference-only transfer choices, estimated pass-through times, external reference rows, and unavailable cases.
- Preserve `readyForApply=false`, `productionReady=false`, and `writesEnabled=false` as hard preview gates.
- Do not treat `group_001`, Chachoengsao, or any single node as a permanent transfer hub.
- Transfer nodes must be per-candidate, derived from preview/ERP data.
- Feasible transfer pairs remain reference-only: not guaranteed, not booking-enabled.
- Infeasible transfer pairs remain excluded/audit-only.
- External/train rows remain external-reference only and must not imply SL-Transit fare collection.
- Estimated/pass-through timetable values remain reference data and must not become GPS/ETA.
- Logic must not create fake vehicle, driver, assignment, GPS, ETA, booking, ticket, or payment state.

Suggested dry-run outputs:
- `getAvailableOrigins()` from preview origins.
- `getAvailableDestinations(originKey)` from visible pairs.
- `getJourneyPreview(originKey, destinationKey)` returning only prepared preview data: segments, times, badges, disclaimers, external-reference status, transfer-reference status, unavailable reason.
- `validatePreviewJourneyContract(payload)` guarding counts, flags, no operational fields, no global transfer hub, no production-ready credentials, no visible infeasible transfer, no fake ETA/GPS.

Strict ERP Logic Center safety:
- Do not write Firebase.
- Do not seed.
- Do not production apply.
- Do not modify Passenger, Booking, Check Ticket, Driver, Payment, LINE, GPS, ETA, or operations/private data.
- Do not create bookings, tickets, check-ins, notifications, fake GPS, fake ETA, fake vehicles, fake drivers, or fake assignments.
- If code is changed, keep it isolated to logic/dry-run/helper/test files and report exact files.

Return:
1. PASS / FAIL / NEEDS_OWNER_DECISION
2. Files changed, if any
3. Exact logic contract or helper added
4. Counts verified from preview input
5. Sample journey previews for:
   - Chachoengsao -> Phanom Sarakham
   - Phanom Sarakham -> Phai Chit
   - Nong Khok -> Chachoengsao
   - Chachoengsao -> Hua Takhe
   - Huai Som -> Ao Udom
6. Remaining blockers before Passenger/Booking consumption
7. Explicit no-write/no-production confirmation

### Passenger Preview AI: approved next work

Goal: make `passenger.html` / passenger preview load and render the verified Firebase preview data so the owner can inspect it on the website.

Required behavior:
- Read only from `preview/publishedSchedule` for this preview phase.
- Populate origin and destination selectors from preview data.
- Render only visible `pairs`.
- Do not render `excludedPreviewPairs.transferInfeasible` as selectable journeys.
- Treat feasible transfers as reference-only, not guaranteed and not booking-enabled.
- Show estimated/pass-through times with badge `เวลาโดยประมาณ`.
- Show estimated disclaimer: `เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง`.
- Render external/train rows as external reference only. Do not imply SL-Transit fare collection or operational guarantee.
- If a pair is missing, show unavailable/no-route message. Do not invent route, time, transfer, fare, queue, vehicle, GPS, or ETA.
- Passenger remains display-only. It must not calculate route, transfer feasibility, fare, queue assignment, booking eligibility, GPS, ETA, LINE, or payment rules locally.

Strict Passenger safety:
- Do not write Firebase.
- Do not seed.
- Do not production apply.
- Do not touch Booking, Check Ticket, Driver, Payment, LINE, GPS, ETA, or operations/private data.
- Do not create fake GPS or fake ETA.
- Return files changed, read path, UI behavior, smoke-test evidence, and whether owner can inspect Passenger Preview.

### Booking AI: approved next work

Goal: prepare Booking to consume preview schedule choices safely after Passenger Preview can display them. This is preview/cutover preparation only, not production booking activation.

Required behavior:
- Use `preview/publishedSchedule` only as read-only preview input.
- Respect preview flags: `readyForApply=false`, `productionReady=false`, `writesEnabled=false`.
- Do not allow booking from reference-only transfer pairs unless a later owner approval explicitly enables it.
- Do not allow booking from external/train reference rows as SL-Transit fare collection.
- Preserve booking restrictions from owner rules, including Wang Nam Yen booking disabled and specific queue/time restrictions encoded in preview policy.
- If implementing UI wiring, keep it behind preview/test gating and return clear evidence that no real booking write occurred.
- Booking must not duplicate ERP Logic Center rules locally. If data is insufficient, show unavailable or owner-review state.

Strict Booking safety:
- Do not create real bookings.
- Do not write `operations/bookings`, passenger records, payments, tickets, driver records, notifications, or live vehicles.
- Do not seed or production apply.
- Do not send LINE/SMS/OTP.
- Return scope, files changed, preview gates, blocked production actions, and no-write evidence.

### Check Ticket AI: approved next work

Goal: prepare Check Ticket to display/validate preview-compatible ticket information after Booking preview is ready. This is not live check-in production activation.

Required behavior:
- Do not create or modify tickets.
- Do not create check-ins.
- Do not mark passengers boarded.
- Do not write operational ticket/check-in logs.
- If reading preview schedule data, read only from `preview/publishedSchedule` and treat it as preview/reference data.
- Check Ticket must display ticket/schedule information only when provided by approved preview/booking outputs. It must not infer fare, transfer, queue, vehicle, driver, ETA, or payment state locally.
- If no preview booking/ticket object exists yet, report the missing dependency instead of creating fake ticket data.

Strict Check Ticket safety:
- No Firebase writes.
- No seed.
- No production apply.
- No ticket/check-in/passenger/driver/payment/LINE writes.
- No fake tickets, fake check-ins, fake GPS, or fake ETA.
- Return dependency status, files changed if any, test evidence, and no-write confirmation.

### Coordination order

Recommended order:
1. Passenger Preview reads and renders `preview/publishedSchedule`.
2. QA verifies Passenger Preview live UI.
3. Booking preview/cutover preparation consumes the same preview data behind safe gates.
4. Check Ticket preview preparation follows Booking preview outputs.

Do not skip straight to production `publishedSchedule`, real booking, real ticket, check-in, payment, LINE, GPS, or ETA. Owner approval is required for each production-facing step.

Source of truth:
- Latest reviewed main before this dashboard update: a65d535d5e57ff3311052a45ab087fb838773278
- Bridge audit dashboard: ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- Owner-approved network decisions in this dashboard override stale `main`, `bangkok`, `coastal`, vehicle/queue, and `nongkhok: pass_through` assumptions in older coordination notes.
- Completion Round 2 dry-run snapshot and tests were committed and pushed at `2f4fbca28427cec818cb7aebca2bf0b62826c087`; post-push QA passed for the four ERP snapshot/registry implementation and test files.
- Data Import dry-run state: readyForReview true, readyForApply false
- Production apply / Firebase seed: NOT approved

Shared approved ERP Data Center contract:
- SL-Transit is an interconnected journey-planning and transport-service platform, not a single-main-route website.
- Canonical flow: ERP Data Center -> ERP Logic Center -> Page Logic Adapters -> UX/UI.
- ERP Data Center owns static/versioned network, timetable, fleet/queue, fare, capability, and lineage data.
- ERP Logic Center owns multi-leg path finding, trip/transfer feasibility, fare decisions, assignments, and ETA.
- Consumer pages must not recreate business rules.
- current destination/network locations: 49
- source-proven group_001 corridor stops: 15
- routes: 244
- trips: 819
- raw legacy route sequence evidence containers: 16 (12 complete queue trips + 4 singleton fragments)
- owner-approved queue_005 sequence evidence: 2 additional complete trips
- unique active routeSequenceVersions after normalization: 6
- active queue trips: 14
- unique proven stopTimes: 94
- total retained lineage containers: 26
- fares: 720
- vehicles: 5
- queues: 5 after the approved queue_005 correction
- liveVehicles: 0
- direct fares: 233
- via_chachoengsao fares: 322
- external_pay fares: 165
- primary stops: chachoengsao, sanamchaikhet, khlonghat
- canonical stop corrections: huaisom display is `ห้วยโสม`; `nongkhok` is not permanently pass-through-only
- group_005/train: external_pay; passenger pays outside SL-Transit; SL-Transit collects no train fare
- canonical destination keys: system-managed and stable
- seed/import target root: data/erpDataCenter/*
- legacy sources only: data/catalog/*, publishedCatalog, routeData, settings/routes
- runtime contract-only paths: operations/dailyAssignments, operations/vehicleSessions, operations/liveVehicles, operations/notificationEvents, operations/notificationDeliveries

## Owner-Approved Platform Vision And Current Priority

- ERP Data Center is the blocking heart of the project. Pause Admin expansion and Booking/Passenger/Check Ticket/Driver/Payment/LINE implementation until the ERP Data Center Phase 1 contract and dry-run snapshot pass owner review and QA.
- The network behaves like an interconnected web: a passenger starts near home, travels to a city terminal or transfer node, and may continue through other vehicle, van, bus, or train services.
- A location may participate in multiple service groups, routes, terminals, boarding points, and transfers.
- Phase capability is configurable. A node that is origin-disabled now is not permanently destination-only.
- `group_001` is the Phase 1 pilot. Other groups may later enable origin selection and live tracking through approved data/config without page-code changes.

### Owner Vision: Real-World Travel Routine

- SL-Transit must digitize the way local travel already works in real life, not force drivers or passengers into artificial rules.
- Before leaving home, a passenger plans the journey, chooses a nearby stop, checks the approximate time a vehicle may pass that stop, and books or reserves the ride like the old phone-booking routine.
- While waiting at the stop, the passenger uses the planned pass-through time as a waiting aid. When real tracking is available, live vehicle position and ETA become the stronger signal.
- A vehicle follows its assigned queueTrip, passes intermediate stops, stops for pickup/drop-off demand, and continues immediately. Intermediate stops are not waiting points unless the specific queueTrip explicitly defines that stop as a scheduled departure or waiting point.
- When a passenger boards, the system should help answer the normal real-world question: "about how many minutes until my destination or transfer stop?"
- At a destination or transfer node, the platform should eventually help the passenger see the next queue/route, departure time, fare, and boarding point instead of requiring the passenger to ask every terminal manually.
- ERP Data Center stores the real-world network, queue schedules, route sequences, stop roles, and reference timetable data. ERP Logic Center turns that into journey planning, ETA, transfer guidance, fare visibility, and notification decisions. UI pages display the result and must not invent business rules locally.

### Neutral Service Groups

| Legacy alias | Canonical ID |
|---|---|
| `main` | `group_001` |
| `bangkok` | `group_002` |
| `coastal` | `group_003` |
| `group_004` | `group_004` |
| `group_005` | `group_005` |

- Legacy names are migration aliases only and must not drive business rules.
- Admin-editable display order must not determine journey order. ERP Logic Center calculates group/route order per journey.

### Network Entity Boundary

- `networkNode`: stable opaque physical/network location identity.
- `terminal`: facility associated with a network node.
- `boardingPoint`: exact boarding location associated with a node and optionally a terminal.
- `groupStop`: one service group's use of a network node.
- `routeSequenceVersion`: direction-specific, effective-dated node/group-stop order.
- `transferConnection`: explicit route/group connection at an approved node.
- Stable IDs must be opaque and independent from editable names and corridor position codes.
- Stop, terminal, boarding-point, and group-stop records remain distinct; do not collapse all location concepts into one record.

### group_001 Corridor

- Current corridor codes are both group stop codes and canonical corridor positions.
- Base/outbound direction: `g01p001` -> `g01p015`.
- Return direction: `g01p015` -> `g01p001`.
- Mapping:
  1. `g01p001` ฉะเชิงเทรา
  2. `g01p002` พนมสารคาม
  3. `g01p003` สนามชัยเขต
  4. `g01p004` กม.1
  5. `g01p005` กม.7
  6. `g01p006` ห้วยโสม
  7. `g01p007` ท่าตะเกียบ
  8. `g01p008` หนองคอก
  9. `g01p009` คลองตะเคียน
  10. `g01p010` หนองเรือ
  11. `g01p011` ไพรจิต
  12. `g01p012` ทุ่งกบินทร์
  13. `g01p013` สี่แยกโคนม
  14. `g01p014` วังน้ำเย็น
  15. `g01p015` คลองหาด
- `nodeId` and `groupStopId` remain internally stable. Code/order changes require a new sequence version and version-scoped historical aliases.
- Trips and tickets must retain the exact sequence version they used. Never rewrite historical sequence references.
- A stop's origin/intermediate/destination role is trip-specific, not a permanent node classification.

### Fleet, Queues, And Assignments

- Vehicle identity and queue/work schedule are separate.
- Vehicles are analogous to employees; queues are work schedules; queue trips are the work performed during that schedule.
- `veh_001` through `veh_004` rotate across `queue_001` through `queue_004` through an effective-dated rotation rule.
- `veh_005` is fixed to `queue_005`, does not join the rotation, begins its workday at `g01p008` หนองคอก, and ends its workday at the same stop.
- Owner-approved queue_005 schedule runs every day with no regular day off:
  - 06:20 หนองคอก -> 06:35 ท่าตะเกียบ -> 07:20 สนามชัยเขต -> 07:40 พนมสารคาม -> 08:20 ฉะเชิงเทรา
  - 17:20 ฉะเชิงเทรา -> 18:00 พนมสารคาม -> 18:20 สนามชัยเขต -> 18:50 ท่าตะเกียบ -> 19:05 หนองคอก
- The 08:20 and 19:05 arrivals are owner-approved from matching reference durations: หนองคอก -> ฉะเชิงเทรา 120 minutes and ฉะเชิงเทรา -> หนองคอก 105 minutes.
- `veh_005` has an assignment and is not schedule-only merely because it lacks GPS.
- Queue_005 booking/assignment state is `assignmentMode=fixed`, `scheduleOnly=false`, and `liveTrackingAvailable=false`.
- `veh_005.liveTrackingAvailable=false` until real live data exists. Never create fake GPS or ETA.
- Assignment modes must support `rotation`, `fixed`, and `manual_override`.
- Daily assignments are runtime/derived and must not be seed master data.
- Booking snapshots use `assignmentId`, `queueId`, and `vehicleId`; `car1` through `car5` remain legacy aliases only.
- Queue schedules and assignment rules must be versioned/effective-dated and support future vehicle/queue additions without hard-coded counts.

### Journey Planning And Passenger ETA

- ERP Logic Center calculates multi-leg paths, trip selection, transfer feasibility, fare totals, assignment/tracking availability, and ETA.
- Platform service fee is one configurable amount per booking, not an assumed per-leg allocation.
- Transfer feasibility uses `feasible`, `infeasible`, or `unknown` until owner-approved timing thresholds exist.
- Passenger Phase 1 continues to read static timetable/stop/route data from ERP Data Center and real positions from `operations/liveVehicles/{vehicleId}`.
- Passenger may request a narrow group_001 ETA result from ERP Logic Center; do not introduce a full PassengerViewModel in Phase 1.
- Passenger displays the result only and must not calculate fare, queue, assignment, transfer, booking, LINE, GPS, or ETA rules.
- If real position/trip mapping is unavailable or stale under a future approved policy, return ETA unavailable. Never estimate from fake data.
- ETA has two approved passenger contexts:
  - pre-boarding ETA: estimate when the assigned vehicle will reach the passenger pickup stop.
  - in-vehicle ETA: after boarding, estimate when the same vehicle will reach the passenger drop-off stop or transfer node.
- Both ETA contexts must be calculated by ERP Logic Center from real live vehicle position, route sequence, queueTrip, stop/node positions, and booking/trip context. Static schedule estimates must not override real ETA when live evidence exists.
- LINE or other notifications may use ETA outputs only through ERP Notification Service after separate owner approval. UI pages must not send notifications directly.

### Timetable Time Semantics

- The primary timetable authority is each queueTrip's planned departure from its actual starting stop.
- Intermediate-stop and planned-arrival times are rough planning estimates and are not a guarantee that a vehicle will pass a stop at the exact minute.
- Intermediate stop times exist so passengers who board along the route can estimate when to wait near their stop. They are passenger waiting aids and driver-schedule estimates, not guaranteed departure times.
- Vehicles do not wait at every intermediate stop. They stop for pickup/drop-off demand and continue immediately unless that queueTrip defines the stop as a scheduled departure or conditional waiting point.
- Distinguish:
  - `scheduled_origin_departure`: the planned departure from the actual queueTrip origin; this is the timetable's primary time.
  - `estimated_pass_through`: a rough time the vehicle may pass an intermediate stop.
  - `estimated_arrival`: a rough planned arrival at the queueTrip destination.
  - `pickup_on_demand`: vehicle may stop for passenger pickup/drop-off demand.
  - `no_waiting_stop`: vehicle should not wait after pickup/drop-off is complete.
  - `conditional_waiting_point`: a stop where a specific owner-approved queueTrip may wait until its scheduled departure time.
  - live ETA: a separate ERP Logic Center result calculated only from real operational position/trip evidence.
- For the 14 active queueTrips and 94 stopTimes, expect 14 origin departures and treat the remaining intermediate/destination times as estimates; Data Import must verify the exact role counts rather than assume every stopTime is equally authoritative.
- The 73 group_001 offers previously classified as `needs_review/missing_stop_time` are owner-created estimated timetable offers, not missing data. Reclassify them under estimated timetable semantics using the actual queue-origin boundary.
- An estimated offer may be used for journey planning/reference, but must not claim an exact pickup time, queueTrip, vehicle, assignment, GPS, live tracking, or ETA unless separately evidence-mapped.
- Passenger-facing surfaces must label estimated timetable values clearly, for example: `เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง`.
- Preserve the planned timetable even when a live ETA is available; do not overwrite scheduled/estimated source data with runtime predictions.
- For intermediate-stop pickup, the platform should focus on the real vehicle position and approaching-stop ETA when available; the rough pass-through time remains reference data only.

### Payment And Service Fee Policy

- SL-Transit is the booking/payment platform and settlement intermediary for approved non-train services.
- Standard platform service fee is currently THB 5 per booking, Admin-configurable.
- Trial-period effective service fee is THB 0.
- Service fee applies to every group, including train.
- Train platform fare is THB 0 / `external_pay`; passengers pay the railway directly.
- Checkout shows fare, service fee, and total. Ticket fare excludes the service fee; post-payment summary separates the amounts.
- Real settlement remains blocked until recipients and payout data are owner-approved.

### Current ERP Data Center Gate

- Proven active routes: 244. Keep `ROUTE-MAIN-211` through `ROUTE-MAIN-221` review-only and excluded from active Phase 1 data.
- Proven unique stopTimes before queue_005 correction: 84 from 120 raw rows after 36 corroborating duplicates were removed.
- Owner-approved queue_005 adds 10 unique stopTimes with no overlap, producing 94 active Phase 1 stopTimes.
- `km_1` 15:10, `km_7` 15:15, `huaisom`/ห้วยโสม 15:20, and `tatakiab` 15:30 belong to `TRIP-ROUTE-MAIN-021-1400`.
- Older local Round 2 drafts must not be used. The current reviewed Round 2 artifact is commit `2f4fbca28427cec818cb7aebca2bf0b62826c087`, with `readyForReview=true` for internal dry-run review only; `readyForApply=false` remains enforced, and Firebase seed/production apply is not approved.
- Fleet Queue Audit established that queue_001-queue_004 rotate veh_001-veh_004 and queue_005 is fixed to veh_005.
- Owner-approved normalized Round 2 counts: vehicles 5, queues 5, queue schedule versions 5, active queue trips 14, assignment rules 2, unique routeSequenceVersions 6, trip-to-sequence assignments 14, unique stopTimes 94, and retained raw lineage containers 26.
- The six active sequence versions are: สนามชัยเขต -> ฉะเชิงเทรา, ฉะเชิงเทรา -> คลองหาด, คลองหาด -> ฉะเชิงเทรา, ฉะเชิงเทรา -> สนามชัยเขต, หนองคอก -> ฉะเชิงเทรา, and ฉะเชิงเทรา -> หนองคอก.
- Queue_002 08:00 raw order is not authoritative. Use the approved reverse corridor order and chronological times; preserve the malformed raw ordering only as source-conflict evidence.
- The legacy singleton rows at กม.1 15:10, กม.7 15:15, ห้วยโสม 15:20, and ท่าตะเกียบ 15:30 are intermediate evidence for the queue_003 14:00 trip, not separate queue_004/005/006 trips.
- `readyForReview=true` may describe an internally valid dry-run only. It is not production approval.
- `readyForApply=false` remains a hard stop.

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
