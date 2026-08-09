# SL-Transit Work Board

## Work-lock format

| Workstream | Owner | Status | Scope | Start | Output | Firebase / Production writes |
| --- | --- | --- | --- | --- | --- | --- |
| `<name>` | `<AI or person>` | `TODO / IN_PROGRESS / REVIEW / DONE / BLOCKED` | `<files and contract>` | `<UTC+7 timestamp>` | `<expected artifact>` | `none / approved reference` |

Before editing a scope, replace the matching `TODO` row with an `IN_PROGRESS` lock. Do not overlap another active lock. Each completed item must add a concise entry in `DECISION-LOG.md`.

## Current workstreams

| Workstream | Owner | Status | Scope | Start | Output | Firebase / Production writes |
| --- | --- | --- | --- | --- | --- | --- |
| Coordination context baseline | Codex | DONE | `ai-handoffs/` project context, business rules, API specification, testing, and workflow | 2026-08-09 +07 | Unified onboarding and delivery process | none |
| Network master-data contract | Main Backbone | TODO | Stable IDs, provider/node/terminal/boarding-point/group-stop boundaries, version contract | — | Approved schema and migration map | none |
| Import Package and CSV mapping | Data Import | TODO | CSV package manifest, field mapping, staging validation, error report | — | Dry-run import package | none |
| Admin ERP1 integration | Admin ERP1 | TODO | Draft, validation, review, version history, import status UI | — | Admin workflow using central adapter | none |
| Published Read Model | Backbone / Read Model | TODO | Build consumer-safe published version from approved ERP data | — | Versioned read contract | none |
| Booking and Passenger bridge | Consumer Integration | TODO | Read published route, trip, time, fare, and connection answers only | — | UI adapter audit and bridge plan | none |
| QA, security, and release | QA / Release Guard | TODO | Validation matrix, RBAC, rollback, no-private-data regression checks | — | Release checklist and test evidence | none |

## Required sequence

1. Read current source, tests, `PROJECT-CONTEXT.md`, `BUSINESS-RULES.md`, `API-SPECIFICATION.md`, and `DECISION-LOG.md`.
2. Write requirements with measurable acceptance criteria.
3. Lock one workstream and publish a scoped plan.
4. Implement only the locked scope.
5. Run the required tests from `TESTING-AND-REVIEW.md` and perform a focused review.
6. Record the result and only then unlock or hand off the work.

## Global blockers

- No production import or Firebase write until the Owner approves a specific publish/rollback procedure.
- No consumer-page rule may replace ERP Logic or Calculator decisions.
- No new source path, direct database write, or role permission change without the relevant workstream lock and Owner approval.
