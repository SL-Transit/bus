# Async Import and Retention Architecture

## Why the gateway must stay light

The HTTPS gateway owns authentication, coarse/fine authorization, envelope validation, idempotency and job creation only. File parsing, schema validation and Draft construction run in a Task Queue worker so an Admin request does not remain open for the duration of a large import.

    Admin -> staged object -> import.start -> 202/jobId
                                      |
                                      v
                               queued Import Job
                                      |
                                      v
                              Task Queue Worker
                                      |
                         stream/checksum/validation
                                      |
                                      v
                              Draft or error report

The browser never sends a full package to the command endpoint and never writes authoring RTDB paths directly.

## Retention indexes

RTDB cleanup must not read the database root or all Drafts. Creation writes a small expiry pointer:

    maintenance/expiryBuckets/{YYYY-MM-DD}/importJobs/{jobId}
    maintenance/expiryBuckets/{YYYY-MM-DD}/drafts/{draftId}

Cleanup owns a lease and a date cursor. Each invocation processes a configured number of dates and candidates. Protected or actively leased resources are moved to a later bucket instead of being deleted.

## Deletion safety

Draft entity groups are removed one entity type at a time, then metadata is removed in a small final update with the expiry pointer and a compact audit event. Approved/current/rollback/legal-hold resources are outside automatic deletion.

No retention duration is a source-code default. Production values, Storage Lifecycle rules, budget alerts and deployment remain separate Owner approvals.