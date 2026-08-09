# SL-Transit API Specification

## Current implemented Admin API

### `GET readAdminErpDataCenter`

Purpose: return a permission-filtered snapshot of `data/erpDataCenter` for authenticated Admin users.

| Item | Contract |
| --- | --- |
| Method | `GET` |
| Authentication | `Authorization: Bearer <Firebase ID token>` |
| Authorization | User must be granted Admin read access through `data/erpDataCenter/adminAccounts/{uid}` |
| Success | `200` with `status`, `path`, `erpDataCenter`, `permissions`, `roles`, `generatedAt` |
| Failure | `401` missing/invalid token; `403` invalid origin or insufficient permission; `429` rate limit; `500` unavailable |
| Consumer | `admin-erp-data-adapter.js` and Admin ERP1 read integration |

### `POST updateAdminErpDataCenter`

Purpose: reserved for a controlled write workflow.

| Item | Current contract |
| --- | --- |
| Method | `POST` |
| Authentication | Firebase ID token and Admin edit permission |
| Current behavior | Always returns `409 draft_workflow_required` |
| Production write | Disabled |
| Rule | Do not use this endpoint to bypass Draft → Validate → Review → Approve → Publish |

## Planned import package interface

The importer is not implemented yet. Its first version must accept a named package of CSV files or a workbook with equivalent named sheets.

```json
{
  "packageVersion": "network-import-v1",
  "batchId": "IMP_YYYYMMDD_001",
  "source": {"type": "csv_bundle", "name": "provider-master-data"},
  "entities": [
    {"name": "providers", "file": "01_operators.csv"},
    {"name": "networkNodes", "file": "02_canonical_stops.csv"},
    {"name": "providerStopMappings", "file": "03_operator_stop_mapping.csv"},
    {"name": "routes", "file": "04_routes.csv"},
    {"name": "serviceCalendars", "file": "05_service_calendar.csv"},
    {"name": "trips", "file": "06_trips.csv"},
    {"name": "stopTimes", "file": "07_stop_times.csv"},
    {"name": "fares", "file": "08_fares.csv"},
    {"name": "transferRules", "file": "09_transfer_rules.csv"}
  ],
  "dryRun": true,
  "writesEnabled": false
}
```

Required importer result:

```json
{
  "batchId": "IMP_YYYYMMDD_001",
  "status": "validated",
  "counts": {"accepted": 0, "rejected": 0},
  "issues": [{"code": "foreign_key_missing", "entity": "trips", "row": 0}],
  "draftVersionId": "draft_...",
  "readyForReview": false,
  "readyForApply": false
}
```

## Published read contract

Consumer pages must use an active published version, conceptually:

```json
{
  "activeVersionId": "ver_...",
  "origins": [],
  "destinationsByOrigin": {},
  "offersByRoute": {},
  "connections": {},
  "mapView": {},
  "generatedAt": 0
}
```

This is a consumer-safe projection. It must not contain passwords, bank details, passenger records, payment evidence, driver personal data, or write permissions.

## API change policy

- New endpoint, path, request field, or response field requires an entry in `DECISION-LOG.md` and an active lock in `WORK-BOARD.md`.
- New API behavior must include authorization, validation, error response, test coverage, and rollback impact.
- A UI must consume a stable adapter/API contract rather than call unrelated Firebase paths ad hoc.
