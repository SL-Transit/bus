# Driver Master Data Contract

Status: draft for owner review

Purpose: allow the Admin Dashboard vehicle/driver settlement table to show a safe driver display name when ERP Data Center has an approved public driver master record.

## Source

- Preferred source: `data/erpDataCenter/fleet/drivers/{driverId}`
- Vehicle source: `data/erpDataCenter/fleet/vehicles/{vehicleId}`
- Dashboard summary reader: `readAdminDashboardSummary`

## Allowed Dashboard Fields

Driver:

- `driverId`
- `driverDisplayName`
- `displayName`
- `displayNameTh`
- `publicName`
- `shortName`
- `dashboardDisplayAllowed`
- `publicDisplayAllowed`

Vehicle:

- `vehicleId`
- `vehicleAlias`
- `carAlias`
- `alias`
- `displayCode`
- `publicCode`

## Forbidden Dashboard Fields

The Dashboard response must not expose:

- raw `name`
- `firstName`
- `lastName`
- `surname`
- `phone`
- `lineUserId`
- password or temporary password
- bank account data
- private passenger fields

If the Excel workbook contains first name / surname only, those fields must first be normalized into an owner-approved `driverDisplayName` before the Admin Dashboard may show them.

## Current Finding

The ERP dry-run snapshot currently has:

- `drivers: 0`
- `vehicleLoginIndex: 0`
- `vehicleDriverLogin.previewOnly: true`
- `productionCredentialUseAllowed: false`

This means the Excel workbook may contain driver names, but the central ERP data model has not yet accepted those rows as production driver master data.

## Dashboard Behavior

- If `driverDisplayName` exists and is allowed, show it in the vehicle/driver table.
- If no approved driver display field exists, show `driverId` or `—`.
- Never infer a driver name from private identity fields.
- Never create driver rows from fake data.
