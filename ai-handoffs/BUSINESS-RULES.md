# SL-Transit Business Rules

## Network identities

- `providerId` identifies a company/service provider.
- `networkNodeId` identifies one physical or network location shared by providers.
- `terminalId` identifies a facility at a network node.
- `boardingPointId` identifies the exact passenger pickup/drop-off point.
- `groupStopId` identifies one provider/service group's use of a network node.
- IDs are stable and opaque. Names, local codes, display order, and translations may change without changing identity.

## Route and timetable rules

- A route belongs to one provider/service group and references canonical network locations.
- A trip belongs to one route and one service calendar.
- A stop-time belongs to one trip, identifies the location and sequence, and carries planned arrival/departure information.
- The primary guaranteed timetable value is the scheduled departure from a trip's actual origin.
- Intermediate pass-through and destination arrival values are planning estimates unless a trip explicitly defines a waiting/departure point.
- Service calendars must support daily, weekday, weekend, rotation, and dated override patterns.
- A missing schedule means the passenger page does not show that offer; it does not create a fake schedule.

## Connection rules

- A provider-local stop maps to one canonical network node before it can participate in cross-provider routing.
- A connection is explicit: incoming trip/location, outgoing trip/location, transfer buffer, effective dates, and status.
- A valid connection requires arrival plus the approved minimum transfer minutes before the next departure.
- GPS is not required for planned connections. It improves live ETA only when current, real, and policy-approved.
- Passenger pages display connection results prepared by ERP Logic/Calculator; they do not independently select a transfer.

## Fare and booking rules

- A fare references the approved origin and destination/leg, provider, currency, effective period, and status.
- A booking snapshots the published schedule, fare, policy, and connection version used at the time of booking.
- Changing a later schedule or fare must never rewrite an existing booking/ticket snapshot.
- Passenger-facing totals distinguish transport fare from platform service fee when both apply.
- No payment, refund, settlement, or passenger-private field may be included in a public timetable/read model.

## Version and approval rules

```text
draft -> validated -> in_review -> approved -> published -> archived
```

- Validation failure leaves the current published version unchanged.
- Publish creates an immutable version and changes one active-version pointer atomically.
- Rollback points the active version to a previously approved version; it does not mutate historical versions.
- Owner approval, backup reference, rollback reference, and Firebase rules review are required before production publication.
