# SL-Transit: Single ERP Network Direction

## Objective

Operate SL-Transit as a multi-provider transport platform. A provider is analogous to an airline, a vehicle trip is analogous to a flight, and a stable network location is analogous to an airport. The platform must support direct trips and approved connections across providers without duplicating physical stops.

## Canonical flow

```text
CSV / Excel / provider source
  -> Import Package and Mapping
  -> Staging Draft
  -> Validation
  -> Review and Owner Approval
  -> Versioned Publish
  -> data/erpDataCenter
  -> Published Read Model
  -> Admin / Booking / Passenger / Map / Reports
```

## Authority boundaries

### Admin ERP1

`admin-erp1.html` is the future backoffice control interface. It creates and reviews drafts, displays validation, and requests publication. It is not a direct Firebase editor.

### ERP Data Center

`data/erpDataCenter` owns approved master and planned-service data: providers, network locations, terminals, boarding points, provider stop mappings, routes, trips, stop times, service calendars, fares, transfer rules, versions, and audit metadata.

### Published Read Model

Consumer pages read only published, versioned answers prepared from ERP data. A consumer page may display a route, time, price, connection, or map marker, but must not invent fare, timetable, transfer, capacity, ETA, or policy logic.

### Operational and private data

Bookings, payments, passenger data, driver identity, live GPS, and operational assignments remain outside master-data import paths. They require separate security, ownership, and release decisions.

## Network identity rules

- Stable IDs are opaque and never depend on an editable display name, provider alias, or stop order.
- A physical/network location is shared across providers through one `networkNodeId`.
- A terminal, boarding point, and a provider's use of a location are distinct records.
- Provider-local codes map to a canonical record; duplicate local codes do not create duplicate network locations.
- Routes reference locations; trips reference routes; stop times reference trips and locations; fares and transfer rules reference approved route/location IDs.
- Historical bookings and tickets retain the version IDs used at the time of booking.

## Data lifecycle

```text
draft -> validated -> in_review -> approved -> published -> archived
```

Only the Owner may publish or roll back. Publishing creates an immutable version, switches one active-version pointer, and refreshes the derived read model. A failed validation never changes the currently published data.

## Data domains

| Domain | Owner | Examples |
| --- | --- | --- |
| Master network | ERP Data Center | providers, nodes, terminals, boarding points, mappings |
| Planned service | ERP Data Center | routes, service calendars, trips, stop times, fares, transfer rules |
| Policy | ERP Logic / Calculator | booking eligibility, connection feasibility, fare and wait calculations |
| Presentation | Published Read Model | origin options, trip cards, map display data |
| Runtime/private | Operations services | booking records, payments, GPS, drivers, live assignments |

## Non-negotiable consumer rule

Booking, Passenger, Map, Check Ticket, Driver, and report pages receive prepared published data. They do not read CSV files, edit ERP master data, or create their own business policy.
