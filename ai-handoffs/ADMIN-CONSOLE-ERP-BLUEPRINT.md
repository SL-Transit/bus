# Admin Console / ERP Workbook Blueprint

## Status

Owner-approved direction. This file is the shared blueprint for all SL-Transit AIs before changing Admin, ERP Data Center, Logic, Calculator, Alert, Map, Passenger, Booking, Check Ticket, or Driver work.

## Core Principle

SL-Transit must move from separate pages making their own decisions to one controlled Admin ERP / Backoffice platform:

```text
Admin ERP / Backoffice
  -> direct point editing and control
  -> Excel bulk import/export when useful
  -> Draft / Validate / Review / Publish where required
  -> publishedSchedule and approved runtime/config nodes
  -> Passenger / Booking1 / Check Ticket / Driver
```

Excel remains an important source workbook and bulk-edit/import tool during the first phase. However, Excel is not the only edit method and is not a replacement for Admin ERP. Admin ERP must support direct point-level control and must not silently bypass validation or publish directly from an unreviewed edit.

## What the Admin Console / Admin ERP Is

Admin ERP is the SL-Transit backoffice platform / control panel, similar to the internal systems used by large platforms. It is not the old admin page, not a one-off test tool, and not merely a dashboard. Dashboard is only the first summary page inside Admin ERP.

Admin ERP responsibilities include, but are not limited to:

- inspect and edit ERP data in table/workbook-style views;
- directly edit specific values such as time, booking flag, capacity, vehicle, driver, emergency status, and announcements;
- upload Excel workbook files for bulk import/edit;
- export current workbook/data snapshots;
- validate data before publishing;
- show changes/diff before publish;
- publish approved schedule/display/config data where required;
- manage bookings, tickets, cancellations, refunds, revenue, fees, vehicles, drivers, queues, trips, routes, statistics, usage history, Driver App control, testing tools, news/content, permissions, settings, audit, and rollback;
- preserve audit log and rollback history.

## Old Admin Policy

The old admin is not a trusted database source anymore. Correct source data currently lives in the Excel workbook in Downloads, treated as the ERP Data Center source workbook.

Allowed use of old admin:

- audit old behavior;
- migrate useful UI ideas;
- redirect/link to the new Admin Console.

Disallowed use:

- using old paths/project as source of truth;
- writing legacy data as if current;
- keeping confusing duplicate edit surfaces.

## Admin Editing Model

Admin ERP must support both point-level editing and Excel-style bulk editing. The UI may feel spreadsheet-like where that helps, but Excel is not the only edit path.

Point-level editing examples:

- edit one time;
- open/close booking;
- close one trip;
- close advance booking;
- change bookable seat count;
- change vehicle or driver;
- cancel a booking for a passenger;
- control emergency state;
- run approved backoffice tests.

Bulk editing examples:

- rows and columns;
- inline cell editing;
- copy/paste from Excel;
- sort/filter/search;
- validation highlights;
- upload Excel;
- download/export Excel;
- diff before publish.

Admin must use this lifecycle:

```text
Draft -> Review -> Publish
```

Definitions:

- Draft: uploaded/read workbook or staged admin edits.
- Review: validation, diff, QA summary, owner check.
- Publish: owner-approved write to public display/config paths.

## Roles and Permissions

Only Owner is active today, but the system should be designed with platform-style roles:

- Owner: all permissions, publish, rollback, emergency control.
- Admin: edit routine data, schedules, fares, announcements.
- Dispatcher / นายท่า: queue, vehicle, transfer coordination, limited alerts.
- Driver: own assigned work only.
- Support: booking/ticket assistance, limited read/update.
- Viewer: read-only.

Do not hard-code all users as owner. Keep Owner-only as the first active rollout state.

## Required Admin Console Modules

The following modules are examples and starting structure, not the full limit of Admin ERP. Dashboard is only the first summary page.

Phase 1 modules:

1. Dashboard
2. ERP Workbook Editor
3. Upload Excel
4. Validation
5. Preview
6. Publish
7. Audit / Rollback
8. Announcements / News / Content
9. Policy Settings
10. Alert Settings
11. Map Control

ERP Workbook Editor should include these tables:

- ป้ายต้นทาง
- เส้นทาง
- ราคา
- รอบเวลา
- คิวรถ
- รถและคนขับ
- LINE / Notification
- Policy
- Announcements
- Daily Schedule / Overrides

## ERP Workbook Sheets To Support

Existing/expected workbook sheets:

- `01_ข้อมูลป้ายต้นทาง`
- `02_เส้นทาง`
- `03_เส้นทางและราคา`
- `04_รอบเวลา`
- `05_คิวรถและเวลา`
- `06_รถและคิว`
- `07_PaymentContact`
- `08_StaffLineConfig`
- `08_DriverVehicleGroup`

Recommended additional sheets:

- `09_นโยบายระบบ`
- `10_กฎแจ้งเตือน`
- `11_สิทธิ์ผู้ใช้งาน`
- `12_ประกาศข่าวสาร`
- `13_ตารางเวลารายวัน`
- `14_ประวัติการเผยแพร่`
- `15_กฎตรวจสอบข้อมูล`
- `16_ควบคุมฉุกเฉิน`

If sheet numbering conflicts with existing workbook tabs, preserve existing tabs and propose safe names; do not rename destructively without owner approval.

## Origin Stop Order

Owner-approved corridor order:

```text
1  ฉะเชิงเทรา (แปดริ้ว)
2  พนมสารคาม
3  ท่ารถสนามชัยเขต
4  กม.1
5  กม.7
6  ห้วยโสม
7  ท่าตะเกียบ
8  หนองคอก
9  คลองตะเคียน
10 หนองเรือ
11 ไพรจิต
12 ทุ่งกบินทร์
13 สี่แยกโคนม
14 วังน้ำเย็น
15 คลองหาด
```

Important: each stop row is one data unit. Do not change only the numeric order while leaving lat/lng/icon attached to the wrong stop. Move/validate the whole row as:

```text
stop id + label + lat + lng + icon + order + type + booking flag + note
```

## Queue-Based External Terminal Model

For external/other terminals, do not rely on display group names as operational entities. Use queue IDs and terminal/queue staff targets.

Required model:

- queue_id
- queue_name
- queue_type
- terminal_stop_key
- managed_destinations
- lineTargetType
- lineUserId or lineGroupId
- active
- note

LINE targets for นายท่า should be tied to queue/terminal records, similar to driver/vehicle mapping.

## Daily Schedule Requirement

External/other queue timetables are not always permanent.

Support schedule types:

- fixed_schedule
- weekday_fixed
- weekend_schedule
- daily_schedule
- daily_override

Required fields:

- schedule_id
- queue_id
- origin_stop_key
- destination_stop_key
- service_date
- day_of_week
- departure_time
- schedule_type
- booking_enabled
- source
- status/confirmed flag
- note

Do not treat every external queue timetable as permanent. Some routes, such as Pattaya van queues, can have regular Monday-Friday times while Saturday-Sunday changes.

## Notification / ETA Policy

Replace the old duplicated 2.5 km-radius alert concept with one primary rule:

```text
ETA before stop <= X minutes
```

Two owner-approved cases:

1. Passenger alert:
   - passenger has a booking;
   - passenger logged in through LINE;
   - vehicle is approaching the booked pickup stop;
   - ETA before stop is within the configured threshold;
   - send LINE once per booking/trip/stop.

2. Dispatcher / นายท่า alert:
   - passenger is going to another queue/group or has a transfer/coordination point;
   - vehicle is approaching the relevant stop/transfer point;
   - ETA is within the configured threshold;
   - notify the queue/terminal staff target once per trip/booking/stop.

Required policy/config values:

- passenger_eta_notice_minutes, default owner example: 5
- dispatcher_eta_notice_minutes, default owner example: 10
- duplicate_notification_policy = once_per_booking_trip_stop
- notification channel = LINE
- active flag per rule
- target scope: passenger_line, driver_line, queue_line, terminal_line, admin_line

## GPS / ETA Fallback Policy

ERP Calculator Center owns numeric ETA calculation.

Rules:

```text
fresh GPS exists -> use live_gps
GPS missing/stale -> use fallback_average_speed
GPS returns -> switch back to live_gps immediately
```

Default fallback speed:

```text
fallback_speed_kmh = 70
```

Recommended config:

- gps_freshness_seconds
- fallback_speed_kmh
- fallback_max_duration_minutes
- eta_source label

Safety:

- Do not present fallback as live GPS.
- Do not animate fake live vehicle movement from fallback.
- If ETA uses fallback, mark it as estimated.
- Do not send alerts from static schedule alone as if the vehicle is physically near.

## Five ERP Centers

Keep these separate:

1. ERP Data Center: source/master/display data.
2. ERP Logic Center: rule decisions only.
3. ERP Calculator Center: numeric calculations only.
4. ERP Alert / Notification Center: alert intent and delivery routing.
5. Map Display Center: map pins, route display, visual map state.

Do not merge Logic and Calculator.

## Announcements / News / Content

Admin Console should manage platform-style announcements:

- service news;
- route updates;
- timetable changes;
- temporary service suspension;
- promotions;
- homepage/banner/popup notices;
- page-specific notices.

Recommended fields:

- announcement_id
- title
- message
- type
- audience/page
- route/queue/stop scope
- startAt
- endAt
- priority
- active
- createdBy
- updatedBy

## Audit, Version, Rollback

Every publish should record:

- who published;
- source workbook name;
- source workbook hash;
- version;
- publishedAt;
- counts;
- validation result;
- backup path;
- rollback path/strategy.

Every edit should record:

- who edited;
- what changed;
- before value;
- after value;
- time;
- source module/sheet.

## Emergency Control

Admin Console should eventually support:

- close all bookings;
- close route/queue/stop;
- emergency announcement;
- stop alert sending;
- stop fallback ETA;
- maintenance mode.

Emergency actions must be Owner-only and audited.

## Validation Expectations

Validation should block or warn on:

- missing stop ID;
- duplicate stop;
- missing lat/lng;
- invalid icon;
- wrong stop order;
- missing fare;
- invalid time;
- booking open but no capacity;
- queue without staff target;
- notification rule without target;
- daily schedule not confirmed;
- public data using legacy project/path.

## Hard Safety Rules

- Do not write Firebase unless owner explicitly approves the target path.
- Do not seed.
- Do not production apply without separate owner approval.
- Do not touch bookings, passengers, tickets, payment, LINE deliveries, driver runtime, live vehicles, GPS, ETA, or operational/private data unless the task explicitly scopes it.
- Do not use old project `bus-booking-1d68c` as active source.
- Current active project is `sl-transit-9464e`.
- Public display source is `/publishedSchedule`.
