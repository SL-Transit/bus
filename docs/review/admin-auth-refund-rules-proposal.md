# Admin Auth And Refund Rules Proposal

Status: proposal only. Do not deploy from this PR.

## Custom Claim

Admin access must use Firebase Auth custom claims:

- `slTransitRole = "owner"` for the first rollout.
- Later roles may use `slTransitPermissions`.

## Proposed Protected Paths

```json
{
  "bookings": {
    "$bookingId": {
      ".write": "(!data.exists() && newData.child('code').val() === $bookingId && newData.child('source').val() === 'booking1.html')",
      "refundStatus": { ".write": false },
      "refundRequestedAt": { ".write": false },
      "refundApprovedAt": { ".write": false },
      "refundedAt": { ".write": false },
      "refundAmount": { ".write": false },
      "refundReference": { ".write": false },
      "refundUpdatedByUid": { ".write": false },
      "refundUpdatedByRole": { ".write": false },
      "adminCancelledByUid": { ".write": false },
      "adminCancelledByRole": { ".write": false },
      "adminCancellationContractVersion": { ".write": false }
    }
  },
  "operations": {
    "refunds": {
      ".read": "auth != null && auth.token.slTransitRole === 'owner'",
      ".write": false
    },
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

This proposal intentionally removes broad `bookings/$bookingId .write = auth != null`. Passenger booking creation remains constrained to the existing create-only Booking1 contract. Refund and admin cancellation fields are writable only by backend functions through the Admin SDK.
