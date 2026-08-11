# Phase 6 — Admin ERP1 and Published Consumer Integration Scope

สถานะ: **Planning only — ยังไม่อนุญาต implementation merge, Firebase deploy หรือ Consumer cutover**

## เป้าหมาย

เชื่อมส่วนที่สร้างเสร็จแล้วให้เป็นสายงานเดียวโดยไม่ข้าม safety gate:

    Admin ERP1
        -> Authenticated Command API
        -> Async Import / Draft / Validation / Review / Approval
        -> Two-Phase Publication
        -> Published Read Model + Journey Service
        -> Read-only Consumer Adapters

Phase 6 แบ่งเป็นสอง PR series อิสระ Phase 6A ต้องผ่านก่อนเริ่มแก้ Consumer ใน Phase 6B.

## Phase 6A — Admin ERP1 Backend Integration

### ปัญหาปัจจุบันที่ต้องแก้

- หน้า Admin เป็น Contract Preview และยังไม่มี transport/Auth จริง
- Client ส่ง command envelope ไม่ครบ `requestId` ที่ Gateway ต้องใช้
- UI เลือกไฟล์แต่ถือเฉพาะ metadata; ยังไม่มีขั้นขอสิทธิ์ upload และ staged source descriptor
- `import.start`/`import.status` มี backend core แล้ว แต่ UI ยังไม่ poll job state
- `draft.save`, `review.request`, `approval.decide` ยังเป็น reserved command
- ปุ่ม Review/Approve ใน Preview เปลี่ยน local state เท่านั้น จึงห้ามถือว่าเป็นการอนุมัติจริง

### งานที่อนุญาตให้วางแบบ

1. สร้าง command envelope contract เดียว: requestId, command, payload, bearer token และ idempotency key
2. สร้าง upload authorization endpoint; Browser upload เฉพาะ signed/staged target ที่ Backend อนุมัติ
3. ส่ง metadata/checksum เข้า `import.start` และ poll `import.status` แบบ bounded backoff
4. แสดง validation errors/warnings และ Draft revision จาก Backend โดยไม่ cache ข้อมูลสำคัญใน browser
5. Implement Draft/Review/Approve commands พร้อม scope check, expected revision, audit และ separation of duties
6. UI หยุดที่ Approved; ไม่มี Publish button หรือ current-pointer write

### Acceptance gate

- Browser ไม่มี direct RTDB privileged write
- HTTP Gateway ไม่อ่าน/parse workbook ก้อนใหญ่
- Request ซ้ำไม่สร้าง job, Draft, audit หรือ outbox ซ้ำ
- Token มี coarse role เท่านั้น; fine-grained scope อ่านจาก `data/erpDataCenter/access/accounts/{uid}`
- Emulator tests ครอบคลุม unauthenticated, wrong role/scope, conflict, retry, oversized payload และ stale revision
- กำหนด Function maxInstances/concurrency/timeout แต่ไม่ deploy

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

## Dependencies และ Known gaps

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