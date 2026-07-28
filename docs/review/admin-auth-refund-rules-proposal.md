# Admin Auth And Refund Rules Proposal

Status: proposal only. Do not deploy from this PR.

## Custom Claim

Admin access must use Firebase Auth custom claims:

- `slTransitRole = "owner"` for the first rollout.
- Later roles may use `slTransitPermissions`.

## Proposed Protected Paths

```json
{
  "operations": {
    "refundAudit": {
      ".read": "auth != null && auth.token.slTransitRole === 'owner'",
      ".write": false
    },
    "refundIdempotency": {
      ".read": false,
      ".write": false
    },
    "refundReferences": {
      ".read": false,
      ".write": false
    },
    "adminBookingAudit": {
      ".read": "auth != null && auth.token.slTransitRole === 'owner'",
      ".write": false
    }
  },
  "admin": {
    ".read": "auth != null && auth.token.slTransitRole === 'owner'",
    ".write": false
  }
}
```

Cloud Functions write protected operational records with Admin SDK. Browser clients must not write refund state, refund audit, or admin cancellation records directly.

