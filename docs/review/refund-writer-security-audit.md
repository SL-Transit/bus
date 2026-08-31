# Refund Writer Security Audit

Status: BLOCKED_REFUND_WRITER_REQUIRES_ADMIN_AUTH

Scope: Admin Dashboard refund event readiness for SL-Transit bookings.

## Findings

- No authoritative Cloud Function or backend endpoint was found that safely writes completed refund state.
- No verified Admin Firebase Auth custom claim or staff role gate was found for approving or completing refunds.
- Browser-facing code contains refund read/summary logic, but no safe refund writer that should make the Dashboard refund contract ready.
- Existing booking write rules allow passenger booking creation and authenticated writes in limited paths, but this audit does not approve Browser-side refund approval.
- No idempotent refund operation, refund reference lock, or double-refund protection was found.
- No dedicated non-PII refund audit log contract was found.

## Required Refund Contract

- `refundStatus`: `none | requested | approved | processing | refunded | rejected | failed`
- `refundRequestedAt`
- `refundApprovedAt`
- `refundedAt`
- `refundAmount`
- `refundReasonCode`
- `refundMethod`
- `refundReference`
- `refundUpdatedBy`
- `refundContractVersion`

## Security Requirements

- All timestamps must be server timestamps.
- `refundedAt` is written only after money is actually refunded.
- `refundApprovedAt` is not the same event as `refundedAt`.
- Dashboard "คืนเงินวันนี้" uses `refundedAt`.
- Dashboard "อนุมัติคืนเงินวันนี้" may use `refundApprovedAt` only as a separate metric.
- `refundAmount` must never exceed paid amount.
- Repeated requests must not refund twice.
- Refund writes must run through an authenticated backend with staff authorization.
- Audit logs must avoid unnecessary PII.

