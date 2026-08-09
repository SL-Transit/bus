# SL-Transit AI Coordination Board

This folder is the single source of coordination for all AI work in this repository.

## Required work sequence

Every task follows this order. Do not skip a step.

1. **Read** — inspect the relevant source, current board, tests, and latest `main`.
2. **Requirements** — state the user outcome, scope, acceptance criteria, and restrictions.
3. **Project Context** — read the Architecture, Business Rules, API Specification, and Decisions below.
4. **Plan** — post a scoped plan and take a work lock in `WORK-BOARD.md`.
5. **Implement** — change only the locked scope.
6. **Review** — run relevant tests, inspect the changed behavior, record safety impact, and update the decision log.

## Mandatory context

- `PROJECT-CONTEXT.md` — system architecture and authoritative data boundaries
- `BUSINESS-RULES.md` — network, timetable, fare, booking, and version rules
- `API-SPECIFICATION.md` — current interfaces and planned import/publish contract
- `DECISION-LOG.md` — approved decisions and unresolved items
- `TESTING-AND-REVIEW.md` — minimum verification and release evidence
- `WORK-BOARD.md` — active work locks and delivery order

## Hard rules

- GitHub `main` is the repository source of truth.
- `admin-erp1.html` is the future primary Admin ERP interface.
- `data/erpDataCenter` is the only master-data source for published consumer information.
- CSV and Excel are import sources only; consumer pages never read them directly.
- No Firebase production write, seed, security-rule deployment, or private passenger/booking data access without explicit Owner approval.
- Do not create duplicate schema, importer, Admin workflow, or page-specific business rules.

Historic coordination material was intentionally reset on 2026-08-09. Git history remains the archive.
