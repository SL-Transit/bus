# SL-Transit System Direction

## เป้าหมายเดียว

สร้างระบบ ERP และเครือข่ายการเดินทางชุดเดียว โดยให้ `admin-erp1.html` เป็น Admin ERP / Backoffice หลัก และให้ทุกระบบใช้ข้อมูลกลาง `data/erpDataCenter` ผ่านกระบวนการ:

```text
Import Package -> Staging/Draft -> Validate -> Review -> Owner Approve -> Publish -> Published Read Model
```

## บทบาทของระบบ

- GitHub เก็บโค้ด สัญญาข้อมูล Rules และประวัติการเปลี่ยนแปลง
- `admin-erp1.html` เป็น Control Plane สำหรับ Import, Draft, Validation, Review, Approval, Publish, Version, Rollback และ Audit
- Firebase Authentication ยืนยันตัวตน
- Firebase Realtime Database เก็บข้อมูลกลาง เวอร์ชันที่เผยแพร่ ธุรกรรม และสถานะ runtime ตามเขตข้อมูล
- Cloud Functions เป็น Trusted Write Boundary สำหรับการอนุมัติ Publish การจอง ราคา ที่นั่ง และการเปลี่ยนสถานะสำคัญ
- Cloud Storage เก็บ CSV/Excel ต้นฉบับและหลักฐานไฟล์; CSV/Excel เป็นข้อมูลนำเข้า ไม่ใช่แหล่งที่ Passenger หรือ Booking อ่านโดยตรง
- Booking, Passenger, Map และ Reports อ่าน Published Read Model เวอร์ชันเดียวกัน

## เขตข้อมูล

1. Master Data: บริษัท สถานที่จริง ป้าย/ช่องขึ้นรถ กลุ่มบริการ สาย แบบเส้นทาง ปฏิทิน เที่ยว เวลา ราคา กฎต่อรถ รถ คิว และคนขับ
2. Schedule/Publication: Import Package, Draft, Validation, Review, Approval, immutable versions, current pointer และ rollback history
3. Booking/Payment: รายการจอง snapshot ของ version/ราคา/นโยบาย การชำระเงิน ความจุ และเหตุการณ์ธุรกรรม
4. GPS/Operations: ตำแหน่งรถ งานรถรายวัน assignment สถานะเที่ยว และ alert jobs
5. Audit/Access: ผู้กระทำ เวลา before/after version สิทธิ์ และผลการอนุมัติ

ห้ามนำข้อมูลส่วนบุคคล การชำระเงิน หรือข้อมูล Admin ใส่ Published Read Model สาธารณะ.

## สัญญาข้อมูลขนส่ง

ใช้ Stable ID ที่ไม่ผูกกับชื่อแสดงผล และแยกอย่างน้อย:

- providers
- places / networkNodes
- stops / boardingPoints
- serviceGroups
- routes / routePatterns
- serviceCalendars / calendarExceptions
- trips / stopTimes / frequencies
- fares / fareRules
- pathways / transferRules

สถานที่จริงหรือ Network Node เป็นตัวเชื่อมข้ามบริษัท ป้ายเดียวรองรับหลายสายได้ และสายเดียวผ่านหลายป้ายได้.

Journey Engine ต้องค้นหาเที่ยวตรงก่อน แล้วค้นหาทางต่อเป็นรอบ ตรวจวันให้บริการ ลำดับป้าย เวลาเดินเปลี่ยนจุด เวลาสำรอง การยกเลิก ราคา และความจุ หน้า Passenger/Booking ห้ามคำนวณหรือเดากฎเหล่านี้เอง.

## Fixed และ Frequency Service

กำหนดด้วยข้อมูล `serviceMode` ไม่ผูกกับหมายเลขกลุ่ม:

- `fixed_schedule`: ใช้ trip/stopTimes ที่มีเวลาแน่นอน
- `frequency`: ใช้ start/end/headway และแสดงเวลาเป็นค่าประมาณ
- `hybrid`: ใช้ทั้งสองรูปแบบตามช่วงเวลา

`headway / 2` ใช้ได้เฉพาะ expected wait ภายใต้สมมติฐานที่ระบุ ห้ามแสดงเป็นเวลาออกจริง และการต่อแบบรับประกันต้องใช้กฎอนุรักษนิยม หรือข้อมูล dispatch/live ที่ได้รับอนุมัติ.

## Publish และ Rollback

ใช้ Two-Phase Publish:

1. เขียน immutable version เป็นราย entity/chunk ตรวจ count/hash/manifest แล้วตั้งสถานะ `complete`
2. ทำ atomic update ขนาดเล็กเพื่อสลับ current version พร้อม publication history และ audit

ห้ามสลับ pointer ไปยัง version ที่ไม่สมบูรณ์ ห้ามรวมข้อมูล Master ทั้งหมดกับ pointer switch ใน write ก้อนเดียว และ rollback ให้สลับ pointer ไปยัง version เดิมพร้อม audit แทนการเขียนทับประวัติ.

## Routing Cache และค่าใช้จ่าย

- Compile graph และ cache ใน memory แยกตาม `publicationVersion`
- Global cache เป็นเพียง per-instance optimization ไม่ใช่แหล่งความถูกต้อง
- ทุก request ต้องตรวจ version ด้วย pointer/TTL ที่สั้นและ reload เมื่อ version เปลี่ยน
- Event ใช้ pre-warm ได้ แต่ห้ามถือว่าสามารถ invalidate ทุก Functions instance
- จำกัด `minInstances`, `maxInstances`, memory, CPU, concurrency, timeout และ rate limit ตามผล load test
- ห้ามรับรอง latency หรือ capacity โดยไม่มีผลทดสอบ
- ห้ามอ่าน RTDB root หรือโหลด graph ใหม่ทุก request

## Authorization

- Custom Claims เก็บเฉพาะ coarse role และ authorization version
- สิทธิ์ละเอียดเก็บที่ `data/erpDataCenter/access/accounts/{uid}`
- Cloud Functions ตรวจสิทธิ์ละเอียดก่อน mutation ทุกครั้ง
- UI permission ใช้เพื่อการแสดงผลเท่านั้น ไม่ใช่ security boundary
- Firebase Rules และ Production write ต้องได้รับ Owner approval และ deploy แยก

## Published Contract สำหรับหน้าอื่น

ทุก response ต้องระบุอย่างน้อย `schemaVersion`, `publicationVersion`, `generatedAt`, `serviceDate` และ `timezone`.

- Passenger: catalog, journey result, map view, announcements และสถานะข้อมูล
- Booking: itinerary legs, fare quote, availability, expiry และ policy versions; Backend ต้องตรวจซ้ำตอนยืนยัน
- Map: approved geometry, stops, vehicle display state และ source/freshness
- Reports: read model ที่ตัดข้อมูลส่วนบุคคลตามสิทธิ์

ห้าม Consumer อ่าน `workbookSource`, CSV/Excel, Draft หรือ Master Data โดยตรง.

## ขอบเขต Production

การแก้โค้ด เอกสาร หรือ merge PR ไม่ใช่การอนุมัติ deploy. Firebase Rules, Functions, Storage Rules, seed/import, Published pointer switch และข้อมูลจริงต้องมี Owner approval แยกเป็นรายการ พร้อมแผน rollback และหลักฐานตรวจสอบ.
## Owner-approved narrow fare-edit exception

เมื่อ Owner อนุมัติแยกเป็นรายการเฉพาะ `admin-erp.html` อาจเขียนค่า `amount` ของ `data/erpDataCenter/workbookSource/routeFareRows/{sourceRowId}` โดยตรงได้ โดยต้องเขียน Audit Log ที่ `data/erpDataCenter/meta/audit` ก่อนทุกครั้งและใช้ Firebase Auth/Rules เดิม. ข้อยกเว้นนี้ไม่เปิดการเขียน Master Data, Published Read Model, schedule, booking, payment, GPS, account หรือ path อื่นใด และไม่เปลี่ยนหลักการที่ Consumer ต้องอ่าน Published Read Model.
