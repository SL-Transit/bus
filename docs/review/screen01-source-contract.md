# Screen 01 Source-Contract Report

Status: corrective branch report before enabling production calculations.

| Domain | Status | Firebase path | Canonical ID | Service-date field | Status fields | Timestamp fields | Amount fields | Permission assumptions | Related modules |
|---|---|---|---|---|---|---|---|---|---|
| Booking | proposed | `operations/bookings` | `bookingId` or record key | `serviceDate` preferred, `date` observed in legacy ticket code | `status`, `bookingStatus` | `createdAt`, `updatedAt` | none for booking count | Admin read-only permission must be approved; no writes | `erp-data-adapter.js`, `functions/index.js`, `functions/driver-ticket-center.js` |
| Payment | unresolved | not confirmed | unresolved | unresolved: service date vs payment date not confirmed | `paymentStatus` observed on legacy `/bookings/{code}` only | unresolved | unresolved | Do not enable revenue until owner confirms source and rules | `functions/index.js`, `booking-bridge.js` |
| Refund | unresolved | not confirmed | unresolved | unresolved | `refundStatus`/refund lifecycle not confirmed for central ops | unresolved | unresolved | Do not enable refund KPI until owner confirms contract | `ticket-action-center.js`, `cancel_ticket.html` |
| Vehicle runtime | proposed | `operations/liveVehicles`, `operations/driverWorkByServiceDate/{serviceDate}` | `vehicleId` or record key | driver work path date | live vehicle `status`; driver work `status`, `workState`, `activeTripId` | `gpsTimestamp`, `locationUpdatedAt`, `updatedAt`, `lastSeenAt` | none | Read-only access only; GPS alone is not enough to count running | `erp-data-adapter.js`, `driver-map-logic.js`, `functions/driver-work-auto-center.js`, `functions/driver-ticket-center.js` |
| Incident | unresolved | not confirmed | unresolved | unresolved | unresolved | unresolved | none | Display unavailable until an incident/blackbox source is approved | `erp-alert-center.js`, `staff-notification-center.js` |
| System health | unresolved | not confirmed | module-specific only | not date-scoped unless source says so | unresolved | unresolved | none | Do not mark healthy because Firebase read succeeded | none confirmed |
| Recent activity | proposed | `operations/notificationEvents`, `data/erpDataCenter/meta/audit` | record key | optional | `event`, `type`, `status` | `createdAt`, `updatedAt`, `timestamp`, `at` | none | Read-only activity preview only; not a full audit contract | `erp-admin-master-data.js`, `functions/index.js` |

Legacy source rejected:

- `/bookings` is legacy/public booking storage. It is not used as automatic Dashboard fallback.
- Screenshot values are not data contracts.

Revenue and refund are intentionally unavailable in runtime until the owner confirms:

- authoritative data source
- canonical amount field
- paid status
- cancellation handling
- refund-pending status
- completed refund handling
- partial refunds
- service date versus payment date
