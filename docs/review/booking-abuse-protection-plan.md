# Booking Abuse Protection Plan

This PR does not deploy production controls. It records the required rollout
contract for the trusted booking endpoint.

## Current Branch Controls

- `createPassengerBooking` uses server-side Realtime Database rate limit
  counters, not an in-memory-only limiter.
- Limits are keyed separately by global endpoint use, privacy-safe network
  hash, trip selection velocity, and ticket token hash.
- The idempotency key is not used as the only abuse key, so changing it does
  not reset all limits.
- Raw IP addresses are not stored. Network values are hashed before use as
  Firebase keys.

## Required Production Rollout Before Enabling Public Booking Creation

- Enable Firebase App Check or an equivalent verified-client control for
  `createPassengerBooking`, `readPassengerTicket`, and cancellation endpoints.
- Keep origin allowlist and CORS as defense in depth only.
- Configure per-trip booking velocity alerts for staff review.
- Configure global emergency throttling so staff can temporarily block public
  booking creation without changing source code.
- Expire temporary reservations for unpaid or unfinished booking operations
  through the booking recovery worker.
- Audit suspected abuse without storing passenger PII, raw IP addresses, raw
  ticket tokens, or raw idempotency keys.

## Not Yet Deployed

- App Check enforcement is not enabled in production by this PR.
- Database rules changes are proposal-only until Owner approval.
- No production data is read or written by this document.
