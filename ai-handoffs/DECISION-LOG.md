# SL-Transit Decision Log

บันทึกนี้เก็บมติที่มีผลต่อทุก workstream มติใหม่ต้องเพิ่มรายการใหม่ ห้ามแก้ประวัติเดิมแบบไม่มีร่องรอย.

## D-001 — Admin ERP หลัก

- Decision: `admin-erp1.html` เป็น Admin ERP / Backoffice หลักเพียงจุดเดียวในอนาคต
- Consequence: หน้า Admin อื่นเป็น legacy, redirect, preview หรือ migration source ตามแผนที่อนุมัติ ห้ามพัฒนาเป็น control plane คู่ขนาน

## D-002 — Stable Identity

- Decision: ใช้ Stable ID ที่ไม่ผูกกับชื่อป้าย ชื่อบริษัท หรือข้อความแสดงผล
- Consequence: การเปลี่ยนชื่อไม่เปลี่ยน identity และทุก import ต้องผ่าน ID mapping/reconciliation

## D-003 — Network Node ข้ามบริษัท

- Decision: สถานที่จริง/ป้ายกลาง/Network Node เป็นตัวเชื่อมสายและผู้ให้บริการหลายบริษัท
- Consequence: แยก place, stop/boarding point, provider, route, pattern, trip และ transfer rule ออกจากกัน

## D-004 — Published-only Consumers

- Decision: Booking, Passenger, Map และ Reports อ่าน Published Read Model เท่านั้น
- Consequence: ห้ามอ่าน CSV/Excel, workbookSource, Draft หรือ Master Data โดยตรง และห้ามคำนวณราคา เวลา หรือทางต่อใน Consumer

## D-005 — Versioned Publish และ Rollback

- Decision: Published Read Model เป็น immutable version และมี current pointer เพียงหนึ่งค่า
- Consequence: ใช้ chunked staging + manifest ก่อน atomic pointer switch; rollback คือการสลับ pointer พร้อม audit

## D-006 — Firebase Approval Boundary

- Decision: Firebase Rules, Functions deploy, Storage Rules, seed/import, Production writes และ pointer switch ต้องได้รับ Owner approval แยก
- Consequence: merge GitHub ไม่เท่ากับ deploy และห้ามรายงาน `DONE` หากไม่มีหลักฐานการนำขึ้นระบบจริงเมื่อ scope ต้อง deploy

## D-007 — Hybrid Schedule Model

- Decision: รูปแบบเวลาอิง `serviceMode = fixed_schedule | frequency | hybrid` ไม่ผูกกับหมายเลขกลุ่ม
- Consequence: fixed ใช้ stopTimes; frequency ใช้ service window/headway; expected wait ต้องระบุว่าเป็นประมาณการ

## D-008 — Hybrid Authorization

- Decision: Custom Claims เก็บ coarse role/authorization version; สิทธิ์ละเอียดอยู่ที่ `data/erpDataCenter/access/accounts/{uid}`
- Consequence: Backend เป็นผู้ตรวจ mutation ทุกครั้ง และ UI ไม่ใช่ security boundary

## D-009 — Cost And Safety Guard

- Decision: ใช้ Emulator ก่อน Production, ห้าม root read, ห้ามโหลด routing graph ทุก request และต้องจำกัด scaling/rate/timeout ตามผลทดสอบ
- Consequence: งานที่เปลี่ยน query, cache, Functions scaling, notification หรือ load test ต้องรายงาน cost impact และได้รับ approval ก่อนใช้ Production

## D-010 — GitHub-only Changes

- Decision: งาน repository ต้องเปลี่ยนผ่าน GitHub branch/commit/PR ไม่แก้ไฟล์ในคอมพิวเตอร์เพื่อส่งงาน
- Consequence: ทุกการเปลี่ยนย้อนตรวจได้จาก commit และต้องรักษา scope ของ PR ให้ชัดเจน
## D-011 — Async Import Boundary

- Decision: HTTP Gateway ตรวจ Auth/สิทธิ์และ metadata เท่านั้น จากนั้นสร้างงานแบบ idempotent และตอบ `202 + jobId`; การอ่านไฟล์ ตรวจ checksum/validation และสร้าง Draft เป็นหน้าที่ของ Task Worker ที่มี lease/claim token.
- Consequence: ห้ามส่งไฟล์ก้อนใหญ่หรือประมวลผล Import ทั้งหมดใน HTTP request; Worker ต้องจำกัด concurrency/retry/timeout และการกดคำสั่งเดิมต้องไม่สร้าง audit, outbox หรือ Draft ซ้ำ.

## D-012 — Explicit Retention And Bounded Cleanup

- Decision: Import Job, staged source และ Draft ชั่วคราวต้องมี Owner-defined retention policy, `expiresAt`, expiry-bucket index และ scheduled cleanup ที่ใช้ lease, cursor, day window และ batch limit.
- Consequence: ห้ามสแกน RTDB root; ต้องปกป้องงาน processing/review/approved/published/rollback/legal hold และ `protectedFromCleanup`; Storage lifecycle และค่า Production ต้องขอ Owner approval แยก.

## D-013 — Integration Order And Shadow Cutover

- Decision: เชื่อม Admin ERP1 กับ Authenticated Backend/Draft/Review/Approve ให้ผ่าน Emulator ก่อน แล้วจึงย้าย Consumer ตามลำดับ Map/Reports shadow -> Passenger shadow/cutover -> Booking shadow/cutover.
- Consequence: Booking เป็น Consumer สุดท้าย; ทุก Consumer ต้อง pin `versionId`, ใช้ feature flag, มี mismatch evidence และ rollback ก่อนเปลี่ยนผลจริง.

## D-014 — Frequency Runtime Is Required Data

- Decision: Journey ของ Frequency/Queue ต้องมีเวลาเดินทางรายช่วงที่อนุมัติแล้ว นอกเหนือจาก `headwaySeconds`; ห้ามเดา runtime จากชื่อกลุ่ม ระยะทาง หรือค่า default.
- Consequence: หาก segment runtime ไม่ครบ Publication ต้อง fail validation และห้ามเปิด Passenger/Booking route result สำหรับสายนั้น.
## D-015 — Owner-approved fare edit exception

- Decision: เมื่อ Owner อนุมัติเป็นงานเฉพาะ อนุญาตให้ `admin-erp.html` แก้เฉพาะ `data/erpDataCenter/workbookSource/routeFareRows/{sourceRowId}/amount` โดยตรง เพื่อให้ใช้งานปรับราคาได้เหมือนเครื่องมือ Quick Edit
- Consequence: ต้องเขียน `data/erpDataCenter/meta/audit` ก่อนเขียนราคา ใช้ Auth/Rules เดิม และห้ามเขียน path อื่นจากข้อยกเว้นนี้; การแก้ Production และการ deploy ยังต้องมี Owner approval แยก
