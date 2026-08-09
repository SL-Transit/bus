# SL-Transit AI Coordination Board

This folder is the single source of coordination for all AI work in this repository.

## Start here

1. Read `SYSTEM-DIRECTION.md`.
2. Read `WORK-BOARD.md` and do not start work already locked by another owner.
3. Add a work lock before changing code or data contracts.
4. Record the result, verification, and next action in `DECISION-LOG.md`.

## Hard rules

- GitHub `main` is the repository source of truth.
- `admin-erp1.html` is the future primary Admin ERP interface.
- `data/erpDataCenter` is the only master-data source for published consumer information.
- CSV and Excel are import sources only; consumer pages never read them directly.
- No Firebase production write, seed, security-rule deployment, or private passenger/booking data access without explicit Owner approval.
- Do not create duplicate schema, importer, Admin workflow, or page-specific business rules.

Historic coordination material was intentionally reset on 2026-08-09. Git history remains the archive.
