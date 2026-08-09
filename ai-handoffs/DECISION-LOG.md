# SL-Transit Decisions and Handoffs

## Active decisions

| Date (UTC+7) | Decision | Status | Owner / Evidence |
| --- | --- | --- | --- |
| 2026-08-09 | Reset all prior AI handoff content and use this folder as the single coordination board. | Approved | Owner instruction |
| 2026-08-09 | `admin-erp1.html` is the future primary Admin ERP interface. | Approved | Owner instruction |
| 2026-08-09 | Use one versioned ERP network source; CSV/Excel are import sources only. | Approved | Owner instruction |
| 2026-08-09 | Use stable canonical network identities to connect providers at the same physical location. | Approved | Owner instruction |
| 2026-08-09 | No production Firebase write or seed is implied by the new board. | Active safeguard | Owner approval required per release |
| 2026-08-09 | Every work item must follow Read → Requirements → Project Context → Plan → Implement → Review. | Approved | Owner instruction |
| 2026-08-09 | Architecture, business rules, API specification, and testing requirements are mandatory context before implementation. | Approved | Owner instruction |

## Reporting template

```text
DATE: YYYY-MM-DD HH:mm +07
WORKSTREAM:
STATUS: TODO / IN_PROGRESS / REVIEW / DONE / BLOCKED
OWNER:
SCOPE:
RESULT:
VERIFICATION:
SAFETY: Firebase writes / production data / private data
NEXT ACTION:
```

## Latest handoff

DATE: 2026-08-09
WORKSTREAM: Coordination reset
STATUS: DONE
OWNER: Codex
SCOPE: `ai-handoffs/`
RESULT: Historical board content replaced with mandatory project context, architecture, business rules, API specification, work sequence, testing gates, and the unified versioned ERP network direction.
VERIFICATION: `admin-erp-data-adapter`, `admin-erp1-integration`, `erp-data-center-dry-run-snapshot`, `erp-stable-id-registry`, `erp-workbook-source-contract`, `admin-erp-authorization`, `admin-erp-function-config`, `admin-console-safety`, and `booking-security-rules` tests passed. `schedule-resolver-matrix` was skipped because its legacy source path is not publicly readable; this is not treated as a pass.
SAFETY: Firebase writes: none. Production data: none. Private data: none.
NEXT ACTION: Main Backbone locks the network master-data contract workstream and defines the import mapping against the approved CSV package.
