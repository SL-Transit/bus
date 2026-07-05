# SL-Transit AI Coordination Rules

## Goal
Prevent duplicate work, overlapping edits, and hidden changes across multiple AI agents.

## Mandatory Flow For Every AI
1. Read `START-HERE-FOR-ALL-AIS.md`.
2. Read `WORK-STATUS.md`.
3. Read your role file.
4. If your area is already `IN_PROGRESS`, do not edit it.
5. Add or request a work lock before making changes.
6. Work only inside your assigned scope.
7. After finishing, update/report in `CENTRAL-REPORT.md`.
8. If you pushed, verify GitHub Actions and GitHub Pages.

## Work Lock Requirements
A valid work lock must say:
- owner AI
- exact area/files
- status
- start time
- intended output
- whether Firebase writes are involved

Firebase writes should normally be `none`.

## File Ownership Guidance
- `erp-schema.js`: Main Backbone Lead or Main Backbone Support only.
- `erp-data-adapter.js`: Main Backbone Lead or Main Backbone Support only unless requested.
- `admin-erp.html`: Main Backbone Lead, Main Backbone Support, or QA-approved UI support.
- `data/catalog/*` plan: Data Import AI.
- `booking.html`: Booking Logic AI.
- `passenger.html`: Passenger AI.
- `check_ticket.html`: Check Ticket AI.
- driver app files: Driver Operations AI.
- workflow/deploy files: Main Backbone Lead or QA Release Guard only.

## Collision Handling
If two AIs need the same file:
1. The second AI must stop before editing.
2. It should write a proposed change in `CENTRAL-REPORT.md`.
3. Main Backbone Lead decides merge order.

## Completion Levels
- `REVIEW`: work is pushed or ready but needs inspection.
- `DONE`: reviewed, reported, and no known blocker remains.

## Minimum Report After Push
A pushed change is not complete until the AI reports:
- commit hash
- changed files
- Actions result
- Pages result
- live source check if web-facing
- test evidence
- safety statement
- next action