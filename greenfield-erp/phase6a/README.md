# Greenfield ERP Phase 6A — Admin Backend Integration

สถานะ: **DONE / Emulator proof complete** — PR #152 squash merged เป็น `199e2e348abaaa748a6a1f9b8d778291acb66e4f`; ยังไม่มี Firebase Production deploy

โมดูลนี้เพิ่ม workflow หลังบ้านของ Admin ERP1 โดยไม่เปิด Publish และไม่ให้ browser เขียน RTDB โดยตรง

## Flow ที่ทดสอบแล้ว

    admin-erp1.html
      -> Authenticated Command Gateway
      -> upload.authorize
      -> Storage quarantine (canonical JSON, multipart)
      -> import.start / async worker / import.status
      -> Draft + Validation result
      -> review.request
      -> approval.decide
      -> Audit

ผลลัพธ์สุดท้ายของ Phase 6A คือ `approved` เท่านั้น ไม่มี `publication.activate` และไม่มีการเปลี่ยน `publishedReadModels/current`

## โมดูล

- `upload-authorization-service.js` — ตรวจชื่อ/type/ขนาด/checksum, สร้าง upload ID และ authorization อายุ 15 นาที
- `rtdb-upload-authorization-store.js` — เก็บ/consume authorization แบบ idempotent ใน RTDB Emulator
- `draft-workflow-service.js` — ตรวจ Draft operation, scope, revision และเงื่อนไข Review/Approve
- `rtdb-draft-workflow-store.js` — short lock, revision update, command receipt และ audit event

## Safety / cost bounds

- Canonical JSON สูงสุด 25 MiB
- Gateway body สูงสุด 1 MiB
- Draft save สูงสุด 100 operations และ 512 KiB ต่อ command
- Custom Claims เก็บ coarse role; fine-grained scope อยู่ที่ `data/erpDataCenter/access/accounts/{uid}`
- Gateway: maxInstances 3, concurrency 10, timeout 30s, memory 256 MiB
- Worker: maxInstances 2, concurrency 1, timeout 540s, memory 512 MiB
- Browser upload เขียนได้เฉพาะ `erp-import-quarantine/{uid}/UPL-{id}.json`; read/update/delete ถูกปิด
- Browser ไม่มี direct RTDB write และไม่มี Firebase database SDK

## หลักฐาน

GitHub Actions run `31493338953` ผ่าน unit/regression/performance และ Phase 2/4/6A/5 Emulator ทั้งหมด โดย Phase 6A ทดสอบ upload, import, Draft, Review, Owner Approval, Audit และ Rules denial ครบใน demo project; GitHub Pages run `31493736824` ผ่านหลัง Merge

## Known gaps

- เมื่อ `draft.save` แก้ข้อมูล ระบบจะตั้ง `validationStatus=required`; ต้องเพิ่ม async revalidation ก่อน Draft ที่แก้แล้วจะส่ง Review ได้
- หน้า Admin ยังไม่มี Draft editor และ Reject control แม้ Backend contract รองรับ save/reject
- Production signed/resumable upload adapter และ Storage lifecycle ยังไม่ถูกสร้างหรือ deploy
- Excel/CSV ยังต้องผ่าน Mapping/Import Package; browser รับเฉพาะ Canonical JSON

## ข้อห้าม

ห้ามใช้โมดูลนี้เพื่อ Firebase/Rules deploy, Production write, seed ข้อมูลจริง, Publish pointer หรือ Consumer cutover โดยไม่มี Owner approval แยก