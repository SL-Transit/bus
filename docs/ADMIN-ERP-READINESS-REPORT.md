# Admin ERP Firebase Readiness Report

สถานะ: NEED_OWNER_DECISION

ผลลัพธ์นี้พร้อมส่งให้ Owner ตรวจทานในสภาพแวดล้อมทดสอบเท่านั้น ยังไม่ใช่การอนุมัติให้เชื่อม Production และยังไม่ควร Deploy

## รายงานตามแบบที่กำหนด

- Files inspected: เอกสารที่ Owner ระบุทั้ง 12 รายการ, `admin-erp1.html`, adapter เดิม, schema, workbook contract, import plan, `functions/index.js`, Rules และ test ที่เกี่ยวข้อง
- Files changed: adapter กลาง, สะพานเชื่อมหน้า ERP, authorization helper, `functions/index.js` ใน clone จาก GitHub, contract, readiness report และ tests
- Firebase reads: อ่านเฉพาะ Firebase Database Emulator; ไม่มี Production read
- Firebase writes: 0 ใน Production; ทดสอบ PUT ใน Emulator เพื่อยืนยันว่าการเขียนที่ไม่มีสิทธิ์ถูกปฏิเสธ
- Rules changed: 0
- Functions changed: แก้เฉพาะ clone เพื่อบังคับตรวจสิทธิ์และปิด direct canonical update; ยังไม่ Deploy
- Database changed: 0
- Deploy: ไม่ได้ทำ
- Legacy sources used: ไม่ใช้ `routeData`, `publishedCatalog`, `settings/routes` หรือ `bus-booking-1d68c`
- Production paths touched: ไม่มี
- Emulator tests: PASS สำหรับ public-read behavior ตาม Rules ปัจจุบัน, protected-read behavior และ unauthenticated write denial
- Security findings: Rules ปัจจุบันเปิดอ่านโดยไม่ยืนยันตัวตนในบาง path; หน้าเว็บจึงต้องอ่านผ่าน backend endpoint ที่ตรวจ token และสิทธิ์เท่านั้น
- Path mismatches: พบชื่อ `catalog`, `scheduleOffers` และ `workbookSource` ไม่สอดคล้องกัน; adapter ใหม่ยึด canonical paths ใน contract เดียว
- ข้อมูลที่ยังขาด: URL ของ endpoint ที่ Owner อนุมัติ, รูปแบบบัญชีผู้ดูแลที่ยืนยันแล้ว, การกำหนดสิทธิ์รายบทบาท, field-level allowlist และ workflow Draft/Review/Publish/Rollback ฝั่ง backend
- คำถามสำหรับ Owner: อนุมัติ endpoint ใด, อนุมัติบทบาทใดให้ publish/rollback, อนุมัติ field ใดสำหรับข้อมูลรถ/ผู้ขับ, และจะปรับ Rules ปิด public read path เมื่อใด

## ผลการทำงานทั้ง 6 ขั้น

1. ใช้ JDK 21 ใน process ของ Firebase Emulator โดยไม่เปลี่ยนแปลงระบบ Production
2. รัน Emulator permission smoke test สำเร็จ
3. เพิ่มการตรวจบัญชีผู้ดูแลจาก backend และ permission matrix; ไม่เชื่อ role จาก client
4. ผูก `admin-erp1.html` กับ adapter กลาง; หน้าไม่เรียก Firebase โดยตรง
5. ทดสอบหน้าเว็บ: ไม่มี config แสดง “ยังไม่เชื่อมต่อแหล่งข้อมูล”; fixture สำหรับ test-only แสดงสถานะพร้อมอ่านข้อมูลและแถวแบบอ่านอย่างเดียว
6. จัดทำ contract, readiness report, risk report และรายการ Owner decision

## Path mapping ที่ใช้

| หมวดหน้า | Path ที่อนุมัติใน contract | วิธีอ่าน |
|---|---|---|
| ป้ายต้นทาง | `data/erpDataCenter/stops` | adapter catalog |
| เส้นทาง | `data/erpDataCenter/serviceGroups` ตามชีต `02_เส้นทาง` | adapter catalog |
| เส้นทางและราคา | `data/erpDataCenter/workbookSource/routeFareRows` | workbook read model |
| รอบเวลา | `data/erpDataCenter/workbookSource/scheduleRows` | workbook read model |
| คิวรถและเวลา | `data/erpDataCenter/trips`, `stopTimes`, `fleet/queues` | ต้องยืนยัน field contract เพิ่ม |
| รถและคิว | `data/erpDataCenter/fleet/vehicles`, `queues`, `assignmentRules` | adapter catalog |
| การชำระเงินและผู้ติดต่อ | `data/erpDataCenter/paymentOwnership` | ต้องยืนยัน field privacy เพิ่ม |
| รถ ผู้ขับ และกลุ่มบริการ | `fleet/vehicles`, `serviceGroups`, `fleet/assignmentRules` ตามชีต `08_DriverVehicleGroup` | ไม่ดึงข้อมูลส่วนตัวเกินจำเป็น |
| ผู้ใช้งานและการแจ้งเตือน | ยังไม่มี client path ที่อนุมัติ | แสดงสถานะไม่เชื่อมต่อ |
| บัญชีและสิทธิ์ | อ่านผ่าน backend authorization เท่านั้น | ไม่อ่านจากหน้าเว็บโดยตรง |
| ศูนย์แจ้งเตือน | ยังไม่มี client path ที่อนุมัติ | แสดงสถานะไม่เชื่อมต่อ |

## ความเสี่ยงที่ต้องแก้ก่อน Production

- Public read ใน Rules ปัจจุบันขัดกับแนวทางที่กำหนดให้ข้อมูล Admin ERP ผ่าน backend endpoint
- Endpoint เดิมต้องผูกกับ allowlist ของข้อมูลและสิทธิ์รายบทบาทให้ครบ
- Publish และ rollback ยังต้องมี Owner approval, backup, audit และ rollback plan ฝั่ง backend
- Emulator test ยืนยันกรณีไม่มี token, ผู้ใช้ไม่มีบัญชี Admin ERP, และบัญชีผู้ดูแลด้วย Firebase ID token ของตัวจำลองแล้ว แต่ยังไม่มีบัญชี Production ที่ Owner อนุมัติให้ใช้ทดสอบ

## Test result

- Adapter unit test: PASS
- Authorization and permission matrix test: PASS
- No token, non-admin, viewer, edit-without-publish, publish-without-approval, rollback-without-permission: PASS ใน policy tests
- Empty, partial, stale, endpoint error, timeout: PASS
- Duplicate ID, missing required field, invalid type and invalid foreign key draft checks: PASS ตามชุด adapter test ที่มี
- Local Draft → Validate → Review → Owner Approval → Publish Preview → Rollback Preview: PASS และไม่เขียน Production
- UI integration contract: PASS
- UI preview with test-only fixture: PASS
- Firebase Database Emulator permission smoke test: PASS
- Syntax checks and existing admin checks: PASS

## Current read connection

- `admin-erp1.html` and the migrated legacy `admin-erp.html` now load Firebase Auth only to obtain the current user's ID token.
- ERP data is requested through `readAdminErpDataCenter` in `asia-southeast1`.
- Both Admin ERP pages use `admin-erp-data-adapter.js`; neither page loads the Firebase Database SDK or calls `.ref()` for ERP reads.
- The legacy page's schedule projection reads `data/erpDataCenter/workbookSource/scheduleRows` through the Adapter and no longer reads `publishedSchedule` or `preview/publishedSchedule`.
- Legacy ERP edits create and validate a local Draft only; they do not call `updateAdminErpDataCenter` or write a canonical Production path.
- The browser Firebase configuration contains only public web-app configuration; no service-account key or private secret is included.
- If there is no authenticated admin session, the page intentionally shows `ยังไม่เชื่อมต่อแหล่งข้อมูล`.

## Final emulator verification

- `tests/admin-erp-function-emulator.test.js`: PASS.
- No token: rejected with HTTP 401.
- Authenticated user without an Admin ERP account: rejected with HTTP 403.
- Emulator Admin account: read endpoint returned HTTP 200.
- Direct canonical update: blocked with `draft_workflow_required` and `productionWrite: false`.
- The targeted Adapter, Read Model, UI integration, authorization, Database Emulator, and existing Admin Console checks: PASS.
- `admin-live-release-isolation.test.js`: not a product failure; it currently compares this clean-slate branch against `origin/main` and reports pre-existing branch differences including `admin-erp1.html`, `ADMIN-ERP-UI-SPEC.md`, and `FIREBASE-ERP-INTEGRATION-READINESS.md`.
- Emulator-only configuration was added to `firebase.json` for Auth `9099`, Database `9000`, and Functions `5001`. It does not change Production configuration or deploy anything.

## Production connection check

- `https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readAdminErpDataCenter` responded with HTTP 401 when called without an ID token. This confirms the approved backend endpoint is reachable and refuses unauthenticated reads.
- `https://sl-transit.com/admin-erp1.html` responded with HTTP 404. The deployed page currently available is `https://sl-transit.com/admin-erp.html`.
- No Production ERP data was read because there was no authenticated Admin ERP session and the assigned clean-slate page is not deployed.
- No deployment was performed because deployment is outside the approved scope.
