# SL-Transit Main AI Dashboard

Purpose: coordinate the main AI roles while ERP Data Center is completed as the blocking core of the SL-Transit travel network platform.

Source of truth:
- Latest reviewed main before this dashboard update: dd6e5ffa76a4c6a2460ede105abccb42c1870974
- Bridge audit dashboard: ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- Owner-approved network decisions in this dashboard override stale `main`, `bangkok`, `coastal`, vehicle/queue, and `nongkhok: pass_through` assumptions in older coordination notes.
- Completion Round 2 remains local/uncommitted and must be revised against this dashboard before commit.
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
- The current local Round 2 snapshot was built before the network/group-stop/queue_005 corrections and must not be committed unchanged.
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
