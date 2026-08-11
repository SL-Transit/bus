# Phase 6 — Admin ERP1 and Published Consumer Integration Scope

สถานะ: **Phase 6A DONE — PR #152 merged เป็น `199e2e348abaaa748a6a1f9b8d778291acb66e4f`; Emulator proof complete; Phase 6B ยังเป็น Planning only**

ห้าม Firebase/Rules deploy, Production credential/write, Publish current pointer และ Consumer cutover จนกว่าจะได้รับ Owner approval แยกเป็นรายขั้น

## เป้าหมาย

เชื่อมส่วนที่สร้างเสร็จแล้วให้เป็นสายงานเดียวโดยไม่ข้าม safety gate:

    Admin ERP1
        -> Authenticated Command API
        -> Authorized Storage Quarantine
        -> Async Import / Draft / Validation / Review / Approval
        -> Two-Phase Publication (แยกจาก Phase 6A และยังไม่เปิดใช้)
        -> Published Read Model + Journey Service
        -> Read-only Consumer Adapters

Phase 6 แบ่งเป็นสอง PR series อิสระ Phase 6A merge แล้ว แต่ Known gaps เรื่อง Draft revalidation/editor ต้องเปิด scope แยก และ Phase 6B ต้องล็อกไฟล์ใหม่ก่อนเริ่มแก้ Consumer

## Phase 6A — Admin ERP1 Backend Integration

### สิ่งที่ PR #152 ทำแล้ว

- หน้า `admin-erp1.html` ใช้ client/controller/state ของ Greenfield เท่านั้น ไม่มี Firebase SDK หรือ direct RTDB write
- ส่ง command envelope ที่มี `requestId`, idempotency key และ bearer ID token
- ขอ `upload.authorize` แล้วอัปโหลด Canonical JSON ไป Storage quarantine ด้วย multipart protocol ก่อนสั่ง `import.start`
- poll `import.status` แบบ bounded backoff และใช้ Draft/Validation result จาก Backend
- เปิดคำสั่ง Backend `draft.save`, `review.request`, `approval.decide` พร้อม expected revision, short lock, command receipt, audit และ separation of duties
- ใช้ coarse role ใน Custom Claims และอ่าน fine-grained scope จาก `data/erpDataCenter/access/accounts/{uid}`
- UI หยุดที่ Approved ไม่มี Publish command, pointer switch หรือ Consumer cutover
- จำกัด Gateway ที่ 1 MiB, upload 25 MiB, Draft save 100 operations/512 KiB และกำหนด maxInstances/concurrency/timeout แบบ bounded

### Acceptance evidence

- PR #152 squash merged เข้า `main` เป็น commit `199e2e348abaaa748a6a1f9b8d778291acb66e4f` เมื่อ 2026-08-11
- GitHub Actions run `31493338953` ผ่าน unit/regression/performance และ Phase 2/4/6A/5 Emulator ทั้งหมด
- GitHub Pages runs `31493736824` และ `31493735968` ผ่านหลัง Merge; ไม่มี Firebase deploy
- Phase 6A Emulator ยืนยัน Auth -> upload authorization -> Storage Rules -> async import -> Draft -> Review -> Owner Approval -> Audit
- direct RTDB write ที่จำลอง Firebase ID token ผ่าน `auth=` ถูก Rules ปฏิเสธและไม่มีข้อมูลถูกสร้าง
- คำสั่งซ้ำใช้ idempotency receipt ไม่สร้าง job/workflow transition ซ้ำ
- ไม่มี Firebase deploy, Rules deploy, Production credential/write หรือข้อมูลผู้โดยสาร/การจอง/การชำระเงินจริง

### Known gaps ที่ต้องไม่ตีความว่าเสร็จแล้ว

- `draft.save` ทำให้ validation เดิมหมดอายุและตั้งสถานะ `required`; ยังไม่มีคำสั่ง revalidate สำหรับ Draft ที่แก้แล้ว จึงต้องเพิ่ม Backend validation step ก่อนส่ง Review
- หน้า Admin รอบนี้ยังไม่มี editor สำหรับเรียก `draft.save` และยังไม่มีปุ่ม Reject; Backend contract มีไว้รองรับงานถัดไป
- upload target builder เป็น Emulator adapter เท่านั้น Production signed/resumable upload adapter ยังไม่ถูกสร้างหรือ deploy
- รองรับ Canonical JSON เท่านั้น Excel/CSV ยังคงเป็นข้อมูลต้นทางและต้องผ่าน Import Package/Mapping อย่างเป็นทางการ
- Storage lifecycle สำหรับ Production ยังเป็น proposal; ห้ามถือว่า cleanup Production เปิดใช้งานแล้ว

## Phase 6B — Published Consumer Integration

### Consumer adapter contract

Consumer ทุกตัวต้องเรียก adapter/API ที่:

1. อ่าน current pointer ขนาดเล็ก
2. pin `versionId` ตลอด request
3. อ่านเฉพาะ node ที่ประกาศไว้ ห้ามอ่าน version root
4. ไม่อ่าน Draft, Excel หรือ authoring path
5. ไม่ผสมข้อมูลต่าง version
6. คืน manifest/version metadata ให้ caller และรองรับ last-known-good ตาม TTL

### ลำดับย้าย

1. **Map/Reports shadow mode** — เปรียบเทียบผลใหม่กับเดิมโดยยังไม่เปลี่ยนหน้าที่ผู้ใช้เห็น
2. **Passenger Search shadow mode** — ตรวจเส้นทาง เวลา Fixed/Frequency และ Transfer mismatch
3. **Passenger cutover** — ต้องผ่าน correctness/latency gate และมี feature flag rollback
4. **Booking shadow validation** — Backend เปรียบเทียบเวลา ราคา ที่นั่ง และ policy
5. **Booking cutover เป็นลำดับสุดท้าย** — บันทึก publishedVersionId และ snapshot เงื่อนไขสำคัญทุก booking

### สิ่งที่ Consumer ห้ามทำ

- คำนวณราคา ตารางเวลา expected wait หรือ transfer policy เอง
- fallback ไป Draft/Excel เมื่อ Published โหลดไม่ได้
- ใช้ version ใหม่กลาง request
- เชื่อข้อมูลราคา/ที่นั่งจาก browser โดยไม่ server revalidation

## Cost and release gates

- วัด p50/p95/p99 latency และ cache hit/miss ด้วย fixture ที่มีขนาดใกล้จริง
- จำกัด response, page size, state expansion, rate, retries และ Function scaling
- Shadow report ต้องเก็บเฉพาะ diff ที่ไม่เปิดเผย PII และมี retention
- ทุก feature flag มี owner, default, rollback target และ expiry date
- Production project ID, paths, versionId, Rules และเวลาปฏิบัติงานต้องระบุในคำขออนุมัติแยก

## Dependencies และ Known gaps ระดับระบบ

- Frequency segment runtime ยังไม่อยู่ใน Canonical Data Contract v1; ต้องเพิ่ม/อนุมัติก่อน Publish ข้อมูลคิวจริง
- Journey core ปัจจุบันยังไม่ใช่ RAPTOR เต็มรูปแบบ; ต้องวัด correctness/scale ก่อนเปิด Passenger
- Excel ใน Downloads ยังเป็นข้อมูลไม่สมบูรณ์ จึงใช้ได้เพื่ออ่านโครงสร้างเท่านั้น
- PR เก่าที่แตะ Admin/Consumer ต้องตรวจ overlap กับบอร์ดใหม่ก่อน merge

## Explicit non-goals

- ไม่ deploy Firebase Functions/Rules/Storage lifecycle
- ไม่ seed/import Production
- ไม่เปิด Published current pointer จริง
- ไม่แก้ Booking/Passenger/Map ใน Phase 6A
- ไม่ใช้ข้อมูลส่วนบุคคลใน fixture หรือ shadow tests