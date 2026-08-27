# Admin ERP Firebase Integration Contract

## Legacy page migration

`admin-erp.html` now follows the same read contract as `admin-erp1.html`: Firebase Auth supplies the ID token, `admin-erp-data-adapter.js` calls the approved read endpoint, and the page consumes the read model from `data/erpDataCenter`. The legacy page no longer loads the Firebase Database SDK, calls `.ref()`, reads `publishedSchedule`, or falls back to `preview/publishedSchedule`.

Legacy page edits remain local Draft and validation operations. They do not call the canonical update endpoint and do not write Production Firebase.

ขอบเขตนี้ใช้กับ `admin-erp1.html` เท่านั้น และไม่ให้หน้าเว็บเรียก Firebase โดยตรง

`admin-erp1.html` → `AdminErpDataSource` → backend endpoint → `data/erpDataCenter`

ตัว adapter ต้องได้รับ Firebase ID token จากระบบเข้าสู่ระบบ ห้ามฝัง secret ห้ามเชื่อ role จาก client และห้าม fallback ไป legacy path

## UI path mapping

| หมวดในหน้า Admin ERP | แหล่งข้อมูลกลาง |
| --- | --- |
| ป้ายต้นทาง | `data/erpDataCenter/stops` |
| เส้นทาง | `data/erpDataCenter/serviceGroups` ตามชีต `02_เส้นทาง` |
| เส้นทางและราคา | `data/erpDataCenter/routes`, `data/erpDataCenter/fares`, `data/erpDataCenter/workbookSource/routeFareRows` |
| รอบเวลา | `data/erpDataCenter/trips`, `data/erpDataCenter/stopTimes`, `data/erpDataCenter/workbookSource/scheduleRows` |
| คิวรถและเวลา | `data/erpDataCenter/fleet/queues`, `data/erpDataCenter/stopTimes` |
| รถและคิว | `data/erpDataCenter/fleet/vehicles`, `data/erpDataCenter/fleet/queues`, `data/erpDataCenter/fleet/assignmentRules` |
| การชำระเงินและผู้ติดต่อ | `data/erpDataCenter/paymentOwnership` |
| รถ ผู้ขับ และกลุ่มบริการ | `data/erpDataCenter/fleet/vehicles`, `data/erpDataCenter/serviceGroups`, `data/erpDataCenter/fleet/assignmentRules` ตามชีต `08_DriverVehicleGroup`; ข้อมูลผู้ขับต้องได้รับอนุมัติขอบเขตก่อน |
| ผู้ใช้งานและการแจ้งเตือน | ยังไม่มี client read path ที่อนุมัติ |
| บัญชีและสิทธิ์ | backend ใช้ตรวจสิทธิ์เท่านั้น ไม่ส่งให้ client |
| ศูนย์แจ้งเตือน | ยังไม่มี path ที่อนุมัติ |

## สถานะข้อมูล

ทุกการอ่านต้องแสดง `loading`, `empty`, `partial`, `stale`, `error`, `forbidden`, `disconnected` หรือ `ready` พร้อม path, source, version, lastUpdated, permissions และ error

## Draft phase

`createDraft`, `updateDraft`, `validateDraft`, diff, `submitForReview`, Owner approval, `publish`, `rollback` และ audit preview ทำใน local state หรือตัวจำลองเท่านั้น ทุกผลลัพธ์ต้องระบุ `localOnly: true` และ `productionWrite: false` เสมอ ห้ามเปลี่ยน canonical path จนกว่าจะมี backend workflow ที่ Owner อนุมัติ

ลำดับจำลองที่รองรับ: `Draft → Validate → Review → Owner Approval → Publish Preview → Rollback Preview` โดยฉบับร่างที่ผ่านการตรวจสอบแล้วจะถูกล็อกระหว่างตรวจและเผยแพร่จำลอง เพื่อป้องกันการเปลี่ยนข้อมูลกลางโดยไม่ตั้งใจ

## ห้ามใช้

`routeData`, `publishedCatalog`, `settings/routes`, `data/catalog`, `data/settings`, `bus-booking-1d68c`, `/publishedSchedule` และ private/runtime data เช่น bookings, passengers, tickets, driver logs, live vehicle operations
