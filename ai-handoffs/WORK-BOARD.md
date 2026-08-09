# SL-Transit Work Board

## Work-lock format

| Workstream | Owner | Status | Scope | Start | Output | Firebase / Production writes |
| --- | --- | --- | --- | --- | --- | --- |
| `<name>` | `<AI or person>` | `TODO / IN_PROGRESS / REVIEW / DONE / BLOCKED` | `<files and contract>` | `<UTC+7 timestamp>` | `<expected artifact>` | `none / approved reference` |

Before editing a scope, replace the matching `TODO` row with an `IN_PROGRESS` lock. Do not overlap another active lock. Each completed item must add a concise entry in `DECISION-LOG.md`.

## Current workstreams

| Workstream | Owner | Status | Scope | Start | Output | Firebase / Production writes |
| --- | --- | --- | --- | --- | --- | --- |
| Network master-data contract | Main Backbone | TODO | Stable IDs, provider/node/terminal/boarding-point/group-stop boundaries, version contract | — | Approved schema and migration map | none |
| Import Package and CSV mapping | Data Import | TODO | CSV package manifest, field mapping, staging validation, error report | — | Dry-run import package | none |
| Admin ERP1 integration | Admin ERP1 | TODO | Draft, validation, review, version history, import status UI | — | Admin workflow using central adapter | none |
| Published Read Model | Backbone / Read Model | TODO | Build consumer-safe published version from approved ERP data | — | Versioned read contract | none |
| Booking and Passenger bridge | Consumer Integration | TODO | Read published route, trip, time, fare, and connection answers only | — | UI adapter audit and bridge plan | none |
| QA, security, and release | QA / Release Guard | TODO | Validation matrix, RBAC, rollback, no-private-data regression checks | — | Release checklist and test evidence | none |

## Required sequence

1. Approve the network master-data contract.
2. Approve the Import Package and validation report.
3. Build Admin ERP1 draft/review integration.
4. Build the versioned Published Read Model.
5. Connect consumer pages to the one published contract.
6. Run QA and obtain Owner approval before any production write.

## Global blockers

- No production import or Firebase write until the Owner approves a specific publish/rollback procedure.
- No consumer-page rule may replace ERP Logic or Calculator decisions.
- No new source path, direct database write, or role permission change without the relevant workstream lock and Owner approval.
