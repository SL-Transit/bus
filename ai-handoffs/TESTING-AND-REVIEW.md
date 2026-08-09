# SL-Transit Testing and Review

## Required evidence before marking work complete

1. Requirements and affected business rules identified.
2. Current source and API contract inspected.
3. Work lock recorded before implementation.
4. Relevant automated tests executed.
5. Changed UI/API behavior manually reviewed where applicable.
6. No private or production data was created, exposed, or altered unless explicitly approved.
7. Result, test command, outcome, and next action recorded in `DECISION-LOG.md`.

## Minimum tests by workstream

| Workstream | Minimum automated checks |
| --- | --- |
| Schema / import | `erp-schema`, `erp-import-plan`, stable-ID, import/duplicate validation tests |
| Admin ERP1 | Admin ERP1 integration, authorization, function configuration, UI contract tests |
| Published read model | Workbook source contract, booking bridge, passenger normalization, schedule resolver tests |
| Booking / Passenger | Booking availability/capacity, booking preview data, passenger display and map wiring tests |
| Firebase rules | Security-rule tests plus a confirmed manual Firebase Console/CLI deployment when rules change |

## Review gates

| Gate | Required result |
| --- | --- |
| Unit/contract tests | Pass, or pre-existing failures documented separately |
| Data validation | No duplicate stable IDs, unresolved references, invalid time order, or forbidden paths |
| Security | Least-privilege read/write scope; no private data in published output |
| Versioning | Draft cannot alter active published version; rollback path documented |
| UI | Loading, empty, error, forbidden, and ready states are visible and truthful |
| Release | Owner approval, backup, rollback note, and rules review before any production publish |

## Current verification baseline

The repository already contains targeted tests for Admin ERP adapters/integration, ERP schema/import plans, booking and passenger contracts, map display, and Firebase security. Each implementation must run the subset relevant to its files first; a broad test suite may be added afterward.

## Prohibited shortcuts

- Do not mark a mock, local browser draft, or downloaded JSON as published production data.
- Do not treat a Git commit as Firebase rules deployment.
- Do not use fabricated GPS, ETA, trips, passengers, bookings, or payments to make a screen appear ready.
