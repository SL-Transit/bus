# Greenfield ERP Phase 4.1 — Async Import and Retention

สถานะ: **Emulator only / Draft review / ห้าม deploy**

Phase 4.1 แยกงาน HTTP ออกจากงานประมวลผลข้อมูลขนาดใหญ่ หน้า Admin ส่งเฉพาะ metadata ของไฟล์ที่อยู่ใน quarantine แล้ว Gateway ตรวจ Token/สิทธิ์และคืน `202 + jobId` โดยไม่ parse หรือสร้าง Draft ใน HTTP request

## Data flow

1. ไฟล์ canonical package ถูกวางที่ `erp-import-quarantine/{uid}/...` ใน Storage Emulator
2. `import.start` ตรวจ metadata, checksum, ขนาด และ operator scope
3. RTDB บันทึก Import Job สถานะ `queued` และ task outbox แบบ idempotent
4. `greenfieldImportWorker` ซึ่งเป็น Task Queue Function claim งานด้วย lease
5. Worker stream ไฟล์, ตรวจ byte count/checksum, parse และเรียก Phase 2 validation
6. ผ่านแล้วจึงสร้าง Draft; ไม่ผ่านบันทึก validation error ใน job
7. `import.status` คืนเฉพาะ progress/result ที่ปลอดภัย ไม่คืน storage path

## Cost and timeout boundaries

- Gateway body ไม่เกิน 1 MB และ timeout 30 วินาที
- ไฟล์ staged ไม่เกิน 25 MB
- Worker concurrency 1, max instances 2, task dispatch พร้อมกันไม่เกิน 2
- Worker retry ไม่เกิน 5 ครั้งและทุกงานต้อง idempotent
- Worker ใช้ stream ตรวจขนาด/checksum ก่อน JSON parse
- Excel parser ยังไม่อยู่ใน Phase นี้; ต้องออกแบบ streaming mapping หลังอ่าน workbook จริง

## Retention

ทุก Import Job และ Draft ที่ Phase 4.1 สร้างมี `lastTouchedAt`, `expiresAt` และ `retentionClass` ค่าอายุทั้งหมดมาจาก `GREENFIELD_RETENTION_POLICY_JSON`; ถ้าขาด Function จะหยุดบูต

Scheduled Cleanup:

- ใช้ lease กันรอบซ้อน
- ใช้ cursor และ expiry bucket รายวัน ไม่ scan RTDB root
- อ่าน candidate แบบ `limitToFirst(batchSize)`
- ลบ Draft แยกตาม entity type ก่อนลบ metadata
- งาน processing ที่ lease ยังไม่หมดและข้อมูล protected จะถูกเลื่อนไปวันถัดไป
- เก็บ audit event แบบสรุป ไม่คัดลอก package เดิม

Storage Lifecycle จริงและระยะเวลาเก็บต้องได้รับ Owner approval แยกก่อน deploy

## Emulator proof

Integration test ครอบคลุม Auth token, bounded access read, async queue state, ไม่มี Draft ก่อน Worker, idempotent start, Task Worker, status response, Draft expiry, cleanup job/draft/source และ browser direct-write denial