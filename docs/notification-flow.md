# Notification flow safety contract

Booking notifications are event-driven and idempotent.

- Booking creation is handled by `handleBookingCreated` on `onValueCreated("/bookings/{code}")`.
- Payment and assignment handlers watch only their relevant child paths.
- Notification work is stored at `operations/notificationJobs/{jobId}` using a deterministic job ID.
- Dispatch state is stored at `operations/notificationDispatch/{jobId}` and claimed by transaction before LINE delivery.
- Notification handlers never write notification status back into `bookings/{code}`.
- `processNotificationJob` uses one stable retry key and a maximum of three attempts.
- `onValueWritten("/bookings/{code}")` is forbidden for notification or driver-ticket synchronization.
