# SL-Transit Project Context

## Product model

SL-Transit is a multi-provider transport platform. A provider is comparable to an airline, a scheduled vehicle trip is comparable to a flight, and a stable network location is comparable to an airport. The platform helps a passenger find a direct trip or an approved connection across providers.

## Architecture

```text
Provider CSV / Excel / API
  -> Import Package + Mapping
  -> Staging Draft + Validation
  -> Admin ERP1 Review + Owner Approval
  -> Versioned ERP Data Center
  -> Published Read Model
  -> Booking / Passenger / Map / Ticket / Reporting
```

### Control plane

`admin-erp1.html` is the future primary backoffice interface. It must use the approved Admin adapter and backend workflow; it must not write Firebase master data directly.

### Data plane

`data/erpDataCenter` is the canonical master-data root. Existing schema paths include providers, stops, terminals, boarding points, service groups, routes, trips, stop times, fares, transfer rules, fleets, versions, and audit metadata. `erp-schema.js` is the current path registry and validator.

### Published read plane

Passenger-facing pages consume a prepared published result, not raw input files or drafts. The read model contains only the data each page needs: selectable origins/destinations, eligible trips, planned times, fare display, connection guidance, and approved map display data.

### Runtime/private plane

Bookings, payment records, passenger identity, driver identity, live locations, notifications, and daily assignments are operational or private domains. They are not imported as ERP master data and must be protected by separate access rules.

## Current implementation facts

| Area | Current state | Rule for future work |
| --- | --- | --- |
| Admin ERP1 | New interface and read integration exist; draft workflow is not yet a production publisher. | Make it the only Admin UI after the approved workflow is connected. |
| ERP Data Center | Read endpoint exists and requires authenticated Admin access. | Keep it as the canonical data root. |
| Direct Admin update endpoint | Endpoint exists but intentionally returns `draft_workflow_required`. | Do not re-enable direct canonical writes. |
| CSV / Excel | Existing Admin accepts files for local parsing; multi-file package import is not yet implemented. | Treat files as source input to a staged importer. |
| Consumer pages | Some sources still use legacy/published bridge paths. | Consolidate behind one versioned published read contract. |
| Firebase rules | Rules enforce path-level access; rule deployment is separate from Git push. | Never claim rules are live until Firebase deployment is verified. |

## Source-of-truth order

1. Explicit Owner decision recorded in `DECISION-LOG.md`
2. Approved canonical schema and versioned ERP data
3. Published Read Model
4. Source Excel/CSV for the next import batch
5. Legacy data only as migration/reference evidence

No UI page, local browser state, screenshot, or legacy alias can override an approved canonical record.
