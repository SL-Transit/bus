# SL-Transit Admin ERP — Firebase Integration Readiness

สถานะ: ศึกษาและเตรียม contract เท่านั้น  
Firebase reads: ไม่ได้เรียกใช้งาน  
Firebase writes: ไม่มี  
Rules / Functions / Database: ไม่ได้แก้ไข  
Deploy: ไม่มี

## สรุปผล

Repository มีโครงสร้าง Firebase Realtime Database สำหรับ ERP อยู่แล้ว และมี `erp-schema.js`, `erp-data-adapter.js` รวมถึง Cloud Functions สำหรับอ่านและอัปเดตข้อมูล ERP แต่หน้า `admin-erp1.html` ปัจจุบันยังเป็น UI Preview ที่ไม่โหลด Firebase ซึ่งเป็นสถานะที่ถูกต้องสำหรับรอบนี้

โครงสร้างโดยรวม “รองรับได้” แต่ยังไม่ควรเชื่อมจริงทันที เพราะ UI ใหม่ต้องแยกสิทธิ์ read/edit/review/publish และต้องใช้ workflow แบบ Draft → Validate → Review → Publish ขณะที่ endpoint ปัจจุบันยังไม่ครบตาม workflow ดังกล่าว

## 1. Firebase ที่พบใน repository

- Firebase project ที่ระบุในไฟล์เดิม: `sl-transit-9464e`
- Realtime Database region: `asia-southeast1`
- แหล่งข้อมูลกลางที่กำหนดไว้: `data/erpDataCenter`
- แหล่งข้อมูล workbook ที่กำหนดไว้:
  - `data/erpDataCenter/workbookSource/routeFareRows`
  - `data/erpDataCenter/workbookSource/scheduleRows`
  - `data/erpDataCenter/workbookSource/manifest`
  - `data/erpDataCenter/workbookSource/reconciliation`
- ประวัติและเวอร์ชัน:
  - `data/erpDataCenter/meta/versions`
  - `data/erpDataCenter/meta/audit`
- สิทธิ์ Admin เดิมที่ repository ใช้ตรวจ: `data/erpDataCenter/adminAccounts/{uid} === true`
- แหล่งเผยแพร่ที่ระบุใน blueprint: `/publishedSchedule`

## 2. Mapping ระหว่าง UI ใหม่กับ Firebase contract

| UI หมวดข้อมูล | Path ที่ควรใช้เป็น contract | หมายเหตุ |
|---|---|---|
| ป้ายต้นทาง | `data/erpDataCenter/stops` หรือ `catalog/stops` ตาม adapter ที่อนุมัติ | ต้องเลือก canonical path เดียวก่อนเชื่อม |
| เส้นทาง | `data/erpDataCenter/routes` และ/หรือ `catalog/routes` | ห้ามใช้ `routeData` เป็น source ใหม่ |
| เส้นทางและราคา | `data/erpDataCenter/fares` หรือ `workbookSource/routeFareRows` | workbook ใช้เป็น source/bulk-edit ไม่ใช่ publish โดยตรง |
| รอบเวลา | `data/erpDataCenter/trips` และ `catalog/trips` | ต้องกำหนดว่า trip ใดเป็น published |
| คิวรถและเวลา | `data/erpDataCenter/stopTimes` หรือ `workbookSource/scheduleRows` | ต้องผูก `tripId`, `routeId`, `stopKey`, `stopOrder` |
| รถและคิว | `data/erpDataCenter/fleet/vehicles` และ `fleet/queues` | ห้ามแสดงข้อมูลส่วนบุคคลเกินจำเป็น |
| การชำระเงินและผู้ติดต่อ | `data/erpDataCenter/paymentOwnership` และ `finance` | ข้อมูลรับเงินต้องมีสิทธิ์เฉพาะ |
| รถ ผู้ขับ และกลุ่มบริการ | `fleet/assignmentRules`, `fleet/drivers`, `serviceGroups` | ต้องแยก read/edit จาก publish |
| ผู้ใช้งานและการแจ้งเตือน | `adminAccounts`, `meta/audit`, notification contract | ยังไม่มี role matrix ที่บังคับใช้ครบใน backend |
| บัญชีและสิทธิ์ | `adminAccounts` + server-side authorization | ไม่ควรเก็บ role ทั้งหมดใน client หรือ custom claim ที่ใหญ่เกินจำเป็น |
| ศูนย์แจ้งเตือน | `operations/notificationEvents` และ `notificationDeliveries` | ห้ามนำ private runtime event มาใส่ใน ERP master data |

## 3. สิ่งที่ตรงแล้ว

- มี schema กลางใน `erp-schema.js` และมีการระบุ required/optional collections
- มี guard ใน `erp-data-adapter.js` ที่ป้องกันการเขียนไปยัง private/runtime paths บางส่วน
- มี Cloud Function `readAdminErpDataCenter` สำหรับอ่านข้อมูลผ่าน backend
- มี Cloud Function `updateAdminErpDataCenter` ที่ตรวจ path ที่อนุญาตและบันทึก audit event
- Rules หลายส่วนใช้ `data/erpDataCenter/adminAccounts/{uid}` เป็นตัวตรวจสิทธิ์ Admin
- มีโครงสร้าง audit และ release evidence ใน `admin-erp-preview.html` สำหรับ dry-run

## 4. จุดที่ยังไม่ตรงและต้องแก้ก่อนเชื่อมจริง

### 4.1 สิทธิ์ยังหยาบเกินไป

`updateAdminErpDataCenter` ปัจจุบันตรวจว่าเป็น Admin หรือไม่ แต่ยังไม่แยก `read`, `edit`, `review`, `publish`, `rollback` ตามที่ UI ออกแบบไว้

ข้อเสนอที่ต้องเตรียม:

- ใช้ Firebase Authentication เป็นตัวระบุตัวตน
- ตรวจ authorization ที่ backend ทุกครั้ง ไม่เชื่อค่าที่ส่งจาก client
- ใช้ role/permission contract ขนาดเล็ก เช่น `owner`, `admin`, `operations`, `finance`, `content_manager`, `viewer`
- ให้ custom claims ใช้เฉพาะ access control และเก็บรายละเอียดทีม/โปรไฟล์ในฐานข้อมูลแยก
- การตั้ง custom claims ต้องทำจาก privileged server เท่านั้น

### 4.2 Read endpoint ยังตรวจเพียงการมี token

`readAdminErpDataCenter` ตรวจ ID token แต่จากโค้ดที่ตรวจพบยังไม่ได้ตรวจ `adminAccounts/{uid}` ก่อนคืนข้อมูลทั้งหมดของ `data/erpDataCenter` จึงต้องแก้ authorization และ field-level exposure ก่อนเปิดใช้งานจริง

### 4.3 Update endpoint ยังเป็นการเขียนทันที

ปัจจุบัน endpoint รับ `updates` แล้วเขียนลง `data/erpDataCenter` พร้อม audit ทันที จึงยังไม่เท่ากับ workflow ของ UI ที่ต้องการ:

`Draft → Validate → Review → Publish → Rollback`

ก่อนเชื่อมจริงควรแยกอย่างน้อย:

- `drafts/{draftId}`
- `validationRuns/{runId}`
- `reviewRequests/{reviewId}`
- `versions/{versionId}`
- `audit/{auditId}`
- publish function ที่ตรวจ approval และ backup ก่อนเปลี่ยน canonical data

### 4.4 Path บางชุดยังมีชื่อไม่สอดคล้องกัน

พบการใช้ชื่อที่ต้องตัดสินให้ชัดเจนก่อน adapter จะเชื่อม:

- `scheduleOffers` ปรากฏใน Cloud Function แต่ไม่ได้อยู่ใน `erp-schema.js` PATHS หลัก
- `catalog/*` และ master path ใต้ `data/erpDataCenter/*` มี fallback ซ้อนกัน
- `workbookSource/*` เป็นแหล่ง bulk-edit/reconciliation แต่ UI บางส่วนเรียกเป็น master data โดยตรง
- มี legacy paths เช่น `routeData`, `publishedCatalog`, `settings/routes` ซึ่งต้องห้ามใช้เป็น source ใหม่

## 5. Adapter contract ที่ควรเตรียม

หน้า UI ไม่ควรเรียก Firebase หรือ Cloud Function โดยตรง แต่ควรใช้ adapter เดียว เช่น:

```text
AdminErpDataSource
  getCatalog(entity, query)
  getWorkbookSource(sheet, query)
  getDraft(draftId)
  validateDraft(draftId)
  submitForReview(draftId)
  compareVersions(leftVersion, rightVersion)
  publish(reviewId)
  rollback(versionId)
  getAuditHistory(entity, recordId)
```

ทุก method ต้องคืน state ที่ UI ใช้ได้ เช่น `loading`, `empty`, `partial`, `stale`, `error`, `ready`, `forbidden` และต้องมี `source`, `version`, `lastUpdated`, `permissions` ประกอบ

## 6. Excel และข่าวสาร

- Excel upload ควรเข้า staging/draft เท่านั้น
- ต้องตรวจ column mapping, duplicate, required fields, type, foreign key และจำนวนแถวก่อนบันทึก draft
- รูปข่าวสารควรใช้ Cloud Storage path แยกจากข้อมูล ERP เช่น `content-drafts/{contentId}/...`
- Storage Rules ต้องจำกัดผู้ upload ตาม permission และตรวจ `contentType`/ขนาดไฟล์
- หลัง publish จึงค่อยสร้าง public asset reference สำหรับ Index/Passenger

## 7. ลำดับการเชื่อมต่อที่ปลอดภัยในอนาคต

1. Owner อนุมัติ canonical paths และ role matrix
2. เตรียม Firebase Emulator Suite สำหรับ Rules และ Functions
3. เพิ่ม read-only adapter และทดสอบด้วยข้อมูลที่ไม่ใช่ production
4. เพิ่ม validation/draft storage โดยยังปิด publish
5. เพิ่ม review/audit/version comparison
6. ทดสอบ permission matrix ทุก role
7. ทำ backup และ rollback drill
8. Owner อนุมัติ publish path จึงค่อยเปิด write เฉพาะ endpoint ที่กำหนด

## ผลสรุปรอบนี้

- ความพร้อมด้านโครงสร้าง: มีฐานรองรับ
- ความพร้อมด้าน UI contract: พร้อมเตรียม adapter
- ความพร้อมด้าน Firebase read: ยังไม่ควรเปิดจากหน้า `admin-erp1.html`
- ความพร้อมด้าน Firebase write: ยังไม่พร้อมและยังไม่เปิด
- ความเสี่ยงหลัก: permission granularity, canonical path ซ้ำ, direct write ก่อน review, และการเปิดข้อมูลเกินสิทธิ์

