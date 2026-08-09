# SL-Transit Decisions and Handoffs

## Active decisions

| Date (UTC+7) | Decision | Status | Owner / Evidence |
| --- | --- | --- | --- |
| 2026-08-09 | Reset all prior AI handoff content and use this folder as the single coordination board. | Approved | Owner instruction |
| 2026-08-09 | `admin-erp1.html` is the future primary Admin ERP interface. | Approved | Owner instruction |
| 2026-08-09 | Use one versioned ERP network source; CSV/Excel are import sources only. | Approved | Owner instruction |
| 2026-08-09 | Use stable canonical network identities to connect providers at the same physical location. | Approved | Owner instruction |
| 2026-08-09 | No production Firebase write or seed is implied by the new board. | Active safeguard | Owner approval required per release |

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
RESULT: Historical board content replaced with one direction for the versioned ERP network, Admin ERP1, staged imports, and published consumer read models.
VERIFICATION: Board contains only README, system direction, work board, and decision log; no runtime or Firebase files changed.
SAFETY: Firebase writes: none. Production data: none. Private data: none.
NEXT ACTION: Main Backbone locks the network master-data contract workstream and defines the import mapping against the approved CSV package.
