# Phase 6A.1 — Draft Revalidation, Editor และ Reject

สถานะ: **Draft PR #154 / Emulator only**  
ขอบเขตนี้ต่อยอด Phase 6A โดยไม่เปิด Publish, ไม่เปลี่ยน Published Read Model และไม่ให้หน้าเว็บอ่านหรือเขียน Firebase โดยตรง

## เป้าหมาย

1. ให้ Admin ERP1 ดู Draft และแก้ข้อมูลรายรายการได้
2. หลังแก้ไข ต้องตรวจ Draft revision นั้นใหม่ก่อนส่ง Review
3. ให้งานตรวจข้อมูลก้อนใหญ่ทำใน Worker ไม่ใช่ HTTP Gateway
4. ให้ Owner ส่ง Draft กลับพร้อมเหตุผลได้
5. จำกัดจำนวนการอ่าน, จำนวน Worker, ขนาดผลตรวจ และอายุข้อมูลชั่วคราวเพื่อควบคุมค่าใช้จ่าย

## ลำดับการทำงาน

    Admin ERP1
      -> draft.read (อ่านหนึ่ง entity type แบบแบ่งหน้า)
      -> draft.save (ส่งเฉพาะรายการที่เปลี่ยน)
      -> validationStatus = required
      -> draft.validate (สร้างงานเบื้องหลัง)
      -> greenfieldDraftValidationWorker
      -> draft.validation.status
      -> review.request
      -> approval.decide = approve หรือ reject

เมื่อ Reject:

    review_requested
      -> approval.decide = reject
      -> rejected
      -> draft.save
      -> draft
      -> draft.validate
      -> review.request รอบใหม่

ไม่มีขั้นใดเปลี่ยน `publishedReadModels/current`

## บทบาทของ Firebase ในขอบเขตนี้

Firebase RTDB เป็นคลังสถานะหลังบ้านและ Audit ใน Emulator:

- `data/erpDataCenter/authoring/drafts/{draftId}` — metadata และ entity ของ Draft
- `data/erpDataCenter/draftValidationJobs/{jobId}` — สถานะงานตรวจและผลตรวจแบบจำกัด
- `data/erpDataCenter/taskOutbox/draftValidation/{jobId}` — จุดส่งต่องานให้ Task dispatcher
- `data/erpDataCenter/maintenance/expiryBuckets/{date}/validationJobs/{jobId}` — ดัชนีลบงานหมดอายุ
- `data/erpDataCenter/audit/events/{eventId}` — หลักฐาน queued, valid/invalid, save, review และ approval/reject

Firebase Authentication เก็บ Custom Claim เฉพาะ role ระดับกว้าง ส่วนคำสั่งที่อนุญาตและขอบเขตบริษัทอ่านจาก `data/erpDataCenter/access/accounts/{uid}`

หน้า Admin เรียก Command Gateway ด้วย ID token เท่านั้น ไม่มี Firebase Database SDK และไม่มีสิทธิ์อ่าน Draft root โดยตรง

## การควบคุมต้นทุนและความเสี่ยง

| จุด | ข้อจำกัด |
| --- | --- |
| HTTP Gateway | request ไม่เกิน 1 MiB; timeout 30 วินาที; ไม่โหลด Draft ทั้งก้อน |
| Draft read | หนึ่ง entity type; สูงสุด 50 รายการ; response entities ไม่เกิน 256 KiB |
| Draft save | สูงสุด 100 operations และ 512 KiB ต่อคำสั่ง |
| Draft package | Worker รับสูงสุด 25 MiB และ 50,000 entities |
| Validation Worker | `maxInstances=2`, `concurrency=1`, timeout 540 วินาที, memory 512 MiB |
| Validation report | ส่งกลับ errors สูงสุด 100 รายการ พร้อมจำนวนจริงและ flag ว่าถูกตัด |
| Retention | Validation job ใช้อายุเดียวกับ Import job; Emulator กำหนด 24 ชั่วโมง |
| Revision race | Worker ใช้ผลตรวจได้เฉพาะเมื่อ Draft ยังอยู่ revision เดิม |
| Browser access | ห้าม direct RTDB read/write; อ่านและแก้ผ่าน API แบบ bounded เท่านั้น |

หากมีการแก้ Draft ระหว่าง Worker กำลังตรวจ ผลเก่าจะเป็น `stale_draft_revision` และไม่สามารถเปิด Review ได้

## Command contract

- `draft.read` — ต้องมี `draftId`, `expectedRevision`, `operatorScope`, `entityType`, `limit` และ optional `cursor`
- `draft.save` — ต้องมี revision, change summary และ operations ที่มี Stable ID ตรงกับข้อมูล
- `draft.validate` — สร้าง job จาก revision ปัจจุบันและตอบสถานะ queued
- `draft.validation.status` — คืนเฉพาะ metadata และรายงานแบบจำกัด
- `review.request` — ผ่านได้เมื่อ `validationStatus=valid` และ `validatedRevision=revision`
- `approval.decide` — Admin เลือก approve/reject; creator หรือ last editor อนุมัติตัวเองไม่ได้

## สิ่งที่ยังไม่เปิดใช้

- Firebase Functions/Rules/Storage lifecycle ใน Production
- Production Cloud Tasks dispatcher สำหรับ `taskOutbox`
- Production upload signer หรือ credential
- Import/seed ข้อมูลจริงจาก Excel/CSV
- Publish command, pointer switch และ Consumer cutover
- Booking, Passenger, Map และรายงาน

Production deployment และการตั้ง Task dispatcher ต้องมี Owner approval แยก พร้อมประมาณค่าใช้จ่ายและ rollback plan