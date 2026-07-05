# SL-Transit Bridge Audit Dashboard

Purpose: use this dashboard to start contract-based bridge audits after the Data Import dry-run snapshot passed Main Backbone review.

Source of truth:
- Latest reviewed main: afabdfd76dd13a85c422a899d0d5cb3379a754ed
- Data Import dry-run review: PASS
- readyForReview: true
- readyForApply: false
- No production apply or Firebase seed is approved.

Shared snapshot contract:
- settings: 1
- stops: 49
- routes: 244
- trips: 819
- fares: 720
- vehicles: 4
- queues: 4
- liveVehicles: 0
- fare direct: 233
- fare via_chachoengsao: 322
- fare external_pay: 165
- primary stops: chachoengsao, sanamchaikhet, khlonghat
- nongkhok: pass_through
- group_005/train: external_pay; passenger pays outside SL-Transit; SL-Transit collects no train fare
- canonical destination keys: system-managed and stable

Global hard constraints for all bridge AIs:
- Read latest GitHub main before starting.
- Read this dashboard plus your own ai-handoffs role file.
- Audit first. Do not implement unless explicitly instructed by Supervisor AI / owner.
- No Firebase writes.
- No seeding.
- Do not touch operations/bookings or operations/passengers real data.
- Do not create test bookings or passenger records.
- Do not create fake liveVehicles.
- Do not change schema paths.
- If a code commit is explicitly approved later, push through GitHub only and verify Actions + Pages.
- Report in the short Supervisor format only. Do not explain to the owner.

Short report format:

```txt
STATUS: PASS / BLOCKED / NEEDS_OWNER_DECISION / FAIL
SCOPE:
- <1 line>
LATEST_MAIN:
- <commit>
RESULTS:
- <counts/findings only>
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

## Booking Logic AI

```txt
Role: Booking Logic AI for SL-Transit.

Task: Contract-based bridge audit for booking flow against the approved dry-run snapshot. Audit only.

Read:
- ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- ai-handoffs/03-booking-logic-ai.md
- ai-handoffs/WORK-STATUS.md
- ai-handoffs/CENTRAL-REPORT.md

Scope:
- booking.html and booking-related logic only.
- Map current booking route/stop/trip/fare/capacity/queue dependencies to the backbone contract.
- Check how booking should consume data/catalog/stops, routes, trips, fares, capacities if present, data/settings, and data/fleet/queues.
- Confirm how external_pay train/group_005 fares should be displayed/handled without SL-Transit collecting train fare.
- Confirm direct fare should be preferred when both direct and via_chachoengsao are available.
- Identify required adapter/API gaps and private-data risks.

Do not:
- write Firebase
- seed data
- create bookings
- touch real passenger data
- implement changes yet

Return only the short Supervisor report format.
```

## Passenger AI

```txt
Role: Passenger AI for SL-Transit.

Task: Contract-based bridge audit for passenger timetable/status UI against the approved dry-run snapshot. Audit only.

Read:
- ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- ai-handoffs/04-passenger-ai.md
- ai-handoffs/passenger-bridge-plan.md
- ai-handoffs/WORK-STATUS.md
- ai-handoffs/CENTRAL-REPORT.md

Scope:
- passenger.html and passenger-logic.js only.
- Map displayed stops/routes/trips/fares/status/live vehicle fields to the backbone contract.
- Account for known blocker: new Firebase project config is still missing/placeholder, so live behavior may remain blocked.
- Check display behavior for primary stops, pass_through nongkhok, destination_only, and external_pay train/group_005 destinations.
- Identify what can be prepared by contract and what must wait for Firebase config/catalog availability.

Do not:
- write Firebase
- read or modify real passenger/private data
- seed data
- switch Firebase project unless explicitly approved
- implement changes yet

Return only the short Supervisor report format.
```

## Check Ticket AI

```txt
Role: Check Ticket AI for SL-Transit.

Task: Contract-based bridge audit for ticket lookup, QR, and passenger-safe display against the approved dry-run snapshot. Audit only.

Read:
- ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- ai-handoffs/05-check-ticket-ai.md
- ai-handoffs/WORK-STATUS.md
- ai-handoffs/CENTRAL-REPORT.md

Scope:
- check_ticket.html and ticket lookup/QR display assumptions only.
- Map required booking output fields to catalog display fields: route, trip, fare, origin/destination, external_pay notices, and status.
- Identify minimum booking contract needed before check-ticket can safely bridge.
- Ensure passenger-private fields are not exposed unnecessarily.
- Confirm whether current check_ticket still points to old Firebase project and report impact.

Do not:
- write Firebase
- create or modify tickets
- touch real passenger data
- implement changes yet

Return only the short Supervisor report format.
```

## Driver Operations AI

```txt
Role: Driver Operations AI for SL-Transit.

Task: Contract-based bridge audit for driver/fleet/queue/live vehicle readiness against the approved dry-run snapshot. Audit only.

Read:
- ai-handoffs/BRIDGE-AUDIT-DASHBOARD.md
- ai-handoffs/06-driver-operations-ai.md
- ai-handoffs/WORK-STATUS.md
- ai-handoffs/CENTRAL-REPORT.md

Scope:
- driver app/pages, fleet, queue, and live vehicle bridge assumptions only.
- Map current driver vehicle/queue/live GPS dependencies to data/fleet/vehicles, data/fleet/queues, and operations/liveVehicles.
- Treat liveVehicles: 0 as valid empty operational state for dry-run.
- Identify missing real vehicle registration, queue owner, driver identity, and live GPS contract needs.
- Define mock-only test checklist; no real device writes without approval.

Do not:
- write Firebase
- create fake liveVehicles
- touch passenger/private data
- perform real driver/live writes
- implement changes yet

Return only the short Supervisor report format.
```