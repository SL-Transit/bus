# SL-Transit Notification Center Contract

Status: preview contract, ready for review. Do not treat this as production apply approval.

This contract is a central ERP Alert / Notification Center boundary. It must survive page rebuilds, Booking1 replacement, and future app rewrites. UI pages may submit booking data, but they must not own staff notification policy.

## Ownership

- ERP Data Center owns source and display data such as stops, routes, timetables, fares, queues, vehicles, and `publishedSchedule`.
- ERP Logic Center decides policy such as whether a booking is eligible, which journey legs exist, and whether a notification is required.
- ERP Calculator Center computes numbers such as fares, ETA, distance, duration, and wait time.
- ERP Alert / Notification Center owns notification intent, target resolution, duplicate prevention, and message payload shape.
- UI pages own display and user input only.

## Stable Files And Bridge Boundary

These files are the stable backend/center boundary. Future website or UX/UI rebuilds should not move notification policy into the page.

- `booking-assignment-center.js`
  - ERP Logic Center bridge for booking assignment contract.
  - Builds `booking_assignment_v1` from resolved driver work or schedule-only state.
  - Output fields such as `assignment.plannedVehicleId`, `queueNo`, `routeId`, and `tripId` are the stable bridge from booking UI to staff notification logic.

- `functions/staff-notification-center.js`
  - ERP Alert / Notification Center policy.
  - Resolves staff recipients from central config, splits admin/driver/queue/terminal roles, builds role-specific staff message content, and prevents trusting public booking payload LINE IDs.
  - This file decides who should receive staff LINE notification after the booking has enough assignment data.

- `functions/index.js`
  - Firebase trigger runtime.
  - `sendStaffLineOnBooking` listens to `/bookings/{code}` writes and calls `staff-notification-center.js`.
  - It sends only missing recipients by checking `/staff_line_sent/{code}` so later assignment updates can notify drivers without resending admin duplicates.

- `/data/notificationCenter/staffLineTargets`
  - Central Firebase config for LINE recipients.
  - Drivers must be mapped by car ID at `driversByVehicleId/{carId}`. Example: `car3 -> LINE userId of car3 driver`.

Website pages are replaceable. A new booking page only needs to write the booking contract to `/bookings/{code}` with the stable fields documented below. It must not decide staff LINE recipients itself.

## Firebase Config

Staff LINE recipients are read from:

`/data/notificationCenter/staffLineTargets`

Current schema:

```json
{
  "schemaVersion": "staff_line_targets_v1",
  "active": true,
  "admins": {
    "main_admin": {
      "staffId": "admin_001",
      "displayName": "Admin",
      "lineUserId": "Uxxxxxxxx",
      "active": true
    }
  },
  "driversByVehicleId": {
    "car1": {
      "car1_driver": {
        "staffId": "driver_001",
        "displayName": "Driver car1",
        "lineUserId": "Uxxxxxxxx",
        "active": true
      }
    }
  },
  "queuesByQueueId": {},
  "terminalsByStopKey": {}
}
```

LINE user IDs, group IDs, or room IDs must come from this central config. Public booking payloads must not be trusted for staff targets.

## Booking Event Input

For a `booking_created` event, Notification Center expects a booking-like object with these stable fields where available:

```json
{
  "code": "BK123456",
  "name": "Passenger name",
  "phone": "0812345678",
  "origin": "Nong Khok",
  "destination": "Pattaya",
  "date": "2026-07-19",
  "time": "09:00",
  "seats": 1,
  "price": 160,
  "slipUrl": "https://...",
  "legSchedule": {
    "leg1": "Nong Khok - Chachoengsao",
    "leg1Time": "09:00",
    "leg2": "Chachoengsao - Pattaya",
    "leg2Time": "11:30"
  },
  "resolvedAssignment": {
    "runtimeVehicleId": "car1",
    "queueId": "queue_001"
  },
  "transfer": {
    "viaStopKey": "chachoengsao"
  }
}
```

The page that creates this payload can be Booking1, a future booking page, an admin app, or another client. The contract is the booking data shape, not the page name.

## Recipient Segmentation

- `admin`: receives the booking overview and passenger contact.
- `driver`: receives the first driving leg for the assigned vehicle.
- `queue`: receives the first queue leg for the assigned queue.
- `transfer_terminal`: receives the transfer or destination terminal leg for the selected transfer stop.

Example for `Nong Khok -> Pattaya` with transfer at `Chachoengsao`:

- Driver receives route segment: `Nong Khok - Chachoengsao`
- Transfer terminal receives route segment: `Chachoengsao - Pattaya`
- Admin receives the booking overview.

## Staff Message Format

```text
รหัส: xxxxx
👤 ชื่อ: xxxx   โทร: xxx-xxxxxxx
🛣️ เส้นทาง: xxxx - xxxx
🗓 วันที่: yyyy-mm-dd เวลา xx:xx น.
🚌 จำนวน: x คน  ราคา: xxx บาท
🖼 สลิป: https://...
```

Role-specific metadata may be appended after the core message:

- Driver: `รถ: car1`
- Queue: `คิว: queue_001`
- Transfer terminal: `จุดต่อรถ: chachoengsao`

## Hard Rules

- Do not calculate fares in Notification Center. Use values already resolved by ERP Calculator Center.
- Do not calculate ETA in Notification Center. ETA must come from real operational evidence through Logic Center and Calculator Center.
- Do not invent GPS, vehicle, driver, queue, or terminal targets.
- Do not trust staff LINE targets inside public booking payloads.
- Do not bind notification policy to `booking1.html`.
- If Firebase notification config is changed, backup first.
