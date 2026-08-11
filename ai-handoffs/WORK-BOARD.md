# SL-Transit Work Board

## สถานะ

- `TODO`: ยังไม่เริ่ม
- `IN_PROGRESS`: มีผู้รับผิดชอบและล็อกขอบเขตแล้ว
- `REVIEW`: ทำเสร็จและรอตรวจ
- `DONE`: ผ่านการตรวจและรายงานครบ
- `BLOCKED`: ติดการตัดสินใจหรือ dependency

## กฎล็อกงาน

ก่อนเปลี่ยนไฟล์ต้องเปลี่ยนรายการเป็น `IN_PROGRESS` ระบุ Owner, branch, ไฟล์, output, tests, Production writes และ cost risk. หนึ่งไฟล์มี Owner งานที่ active ได้เพียงชุดเดียว งานใหม่ห้ามขยาย scope โดยไม่แก้บอร์ดก่อน.

## แผนงานหลัก

| Workstream | Owner | Status | Scope เริ่มต้น | ผลลัพธ์ที่ต้องได้ | Production |
| --- | --- | --- | --- | --- | --- |
| 1. Backbone / Schema / Import Package | Primary AI (Greenfield) | IN_PROGRESS | Stable IDs, contracts, CSV/Excel mapping, validators | Versioned schemas, import manifest, validation report | none |
| 2. Admin ERP1 Integration | Primary AI (Greenfield) | IN_PROGRESS | `admin-erp1.html`, backend draft/review APIs | Import -> Draft -> Validate -> Review UI ที่ไม่เขียน Published โดยตรง | none จนอนุมัติ |
| 3. Published Read Model / Network Journey | Primary AI (Greenfield) | DONE | immutable versions, pointer, routing contract/cache | Published contract เดียว, fixed/frequency routing, rollback | emulator only |
| 4. Booking / Passenger Consumer Integration | Unassigned | TODO | read-only adapter, shadow mode และ compatibility migration | Consumers อ่าน Published contract เดียว; server revalidates booking | none จนอนุมัติ |
| 5. QA / Security / Release | Primary AI (Greenfield) | IN_PROGRESS | Emulator, Rules tests, load/cost/release gates | Regression, privacy, concurrency, version-switch และ rollback evidence | read-only/emulator |

## ลำดับดำเนินงาน

1. กำหนด Import Package และ Mapping จาก CSV/Excel
2. ตรวจความสัมพันธ์ บริษัท -> สถานที่/ป้ายกลาง -> เส้นทาง -> เที่ยว -> เวลา -> ราคา -> การต่อรถ
3. สร้าง Draft และ Validation Report
4. เชื่อม Admin ERP1 เป็น Draft/Review control plane
5. สร้าง Published Read Model เวอร์ชันเดียวด้วย Two-Phase Publish
6. สร้าง Network Journey Service และ version-keyed cache
7. ย้าย Map/Reports -> Passenger Search -> Booking ไปใช้ Published contract เดียวแบบมี feature flag
8. ทดสอบ version switch, rollback, authorization, privacy, concurrency, latency และ cost guard
9. ขอ Owner approval แยกก่อน deploy Firebase หรือแตะข้อมูลจริง

## สถานะ Greenfield ล่าสุด — 2026-08-11

| งาน | สถานะ | หลักฐาน | ขอบเขต/งานค้าง |
| --- | --- | --- | --- |
| โครงสร้างระบบใหม่ | DONE | PR #142 merged | เอกสารเท่านั้น; ไม่ deploy Firebase |
| Data Contract v1 | DONE | PR #143 merged | Canonical JSON contract และ fixtures |
| Draft Core | DONE | PR #144 merged | RTDB Emulator เท่านั้น |
| Admin ERP1 contract preview | DONE | PR #147 merged; CI `31454386100` | หน้า Preview บน GitHub Pages; Backend ยังไม่เชื่อม Production |
| Async Import + Retention | DONE | PR #148 merged; CI `31456735953` | Canonical JSON + Emulator; ไม่ deploy Firebase |
| Published Read Model / Journey core | DONE | PR #150 merged; CI `31460002078`; Pages `31460450126` | Emulator proof complete; ยังไม่ deploy Firebase/Production |
| Admin ERP1 backend integration | IN_PROGRESS | `agent/phase6a-admin-backend-integration` | เชื่อม Auth, upload authorization, async job, Draft/Review/Approve จริงใน Emulator |
| Consumer migration | TODO | Phase 6B scope | เริ่ม Read-only shadow mode; Booking เป็นลำดับสุดท้าย |

### Active file locks

- `agent/phase6a-admin-backend-integration`: `ai-handoffs/WORK-BOARD.md`, `admin-erp1.html`, `admin-erp1-greenfield-*.js`, `greenfield-erp/phase2/rtdb-emulator-draft-store.js`, `greenfield-erp/phase4/**`, `greenfield-erp/phase6a/**`, `tests/*greenfield*`, `.github/workflows/booking-security-validation.yml`, `docs/greenfield-erp/PHASE6-INTEGRATION-SCOPE.md`
- Workstream 3 runtime lock ถูกปลดหลัง PR #150 merge
- ยังไม่มีการล็อกไฟล์ Admin ERP1 หรือ Consumer สำหรับ implementation; ต้องเปิด branch และประกาศไฟล์ก่อนเริ่มโค้ด

- Scope: Emulator only; no Firebase/Rules deploy, Production credential/write, Publish command, pointer switch, or Consumer cutover

### Workstream 3 closeout

- Owner อนุมัติ Merge PR #150 เมื่อ 2026-08-11
- Merge commit `72275a56dc3b0039041af12e01a485607a20206b`
- Two-Phase Publish, rollback, hybrid journey และ version cache อยู่ใน `main`
- หลักฐานทั้งหมดเป็น Unit/Emulator; ไม่มี Firebase deploy หรือ Production write
- Runtime ที่ขาดของ Frequency ต้องเป็น validation error ห้ามเดาค่า

## Phase 6 integration order

### Phase 6A — Admin ERP1 to Backend

1. ทำ command envelope ให้ตรงกัน: `requestId`, ID token, role/scope, idempotency และ bounded payload
2. ขอ upload authorization แล้วส่งไฟล์เข้า Storage quarantine; HTTP Gateway รับเฉพาะ metadata และตอบ `202 + jobId`
3. ให้หน้า Admin ติดตาม `import.status` และแสดง Draft/Validation report จาก Backend
4. Implement `draft.save`, `review.request`, `approval.decide` ฝั่ง Backend พร้อม revision conflict และ separation of duties
5. UI หยุดที่ Approved; Publish ยังคงเป็นคำสั่งแยกและไม่เปิดใช้

### Phase 6B — Published Consumer Integration

1. สร้าง server-side read adapter ที่ pin `versionId` ตลอด request และไม่อ่าน version root
2. เริ่ม Map/Reports แบบ shadow comparison โดยไม่เปลี่ยนผลที่ผู้ใช้เห็น
3. ย้าย Passenger Search หลังตรวจ route/time/transfer correctness
4. ย้าย Booking เป็นลำดับสุดท้าย โดย server ต้อง revalidate เวลา ราคา ที่นั่ง และบันทึก publishedVersionId/snapshot
5. ทุก consumer มี feature flag, metrics, mismatch report และ rollback ไป last-known-good

### Gate ก่อนเริ่ม implementation

- Lock branch/file แยก Phase 6A ก่อน; Phase 6B ห้ามแก้ไฟล์เดียวกันพร้อมกัน
- ทดสอบด้วย demo project/Emulator เท่านั้น
- ต้องกำหนด routing segment runtime ใน Data Contract ก่อน Publish ข้อมูล Frequency จริง
- Merge implementation, Firebase deploy, Rules deploy, Production credentials/write และ Consumer cutover ต้องขอ Owner approval แยก

### ขอบเขตที่ยังไม่ได้รับอนุมัติ

- Firebase deploy, Rules deploy, Storage lifecycle, seed/import ข้อมูลจริง หรือ Production write
- เปิด Publish command จาก Admin ERP1
- เปลี่ยน Map/Reports/Passenger/Booking ให้ใช้ Greenfield เป็นผลจริง
- ใช้ข้อมูล Excel ที่ยังไม่ผ่าน validation/approval

## Completion Report — Workstream 3 / PR #150

```text
STATUS: DONE
COMMIT/PR: PR #150 merged as 72275a56dc3b0039041af12e01a485607a20206b
FILES_CHANGED: greenfield-erp/phase5/**, tests/greenfield-erp-phase5*, docs/greenfield-erp/PHASE5-PUBLISHED-JOURNEY.md, workflow test step, WORK-BOARD.md
RESULTS: immutable query-shaped Read Model; chunk staging/checksum; ready gate; atomic 3-location pointer switch; rollback; fixed/frequency journey; explicit transfer; version-keyed cache
TESTS: GitHub Actions run 31460002078 passed unit tests, Phase 2/4/5 Emulators, version switch, rollback and existing regression/performance suite
ACTIONS/PAGES: GitHub Pages run 31460450126 passed
FIREBASE_DEPLOY_EVIDENCE: none — Emulator only
DATA/PRIVACY_IMPACT: canonical fixture only; no passenger, booking, payment or personal data
COST_IMPACT: no Production cost; operational chunk 4 MB/4,500 leaf paths; atomic switch 3 locations/64 KiB; bounded verification concurrency and journey states
KNOWN_RISKS: not full RAPTOR; Production latency/load not measured; frequency segment runtime remains a required input; Actions dependency deprecation warnings remain
NEXT_ACTION: Phase 6A Admin ERP1 backend integration plan, then Consumer shadow mode. Production and cutover remain forbidden.
```

## Work Lock Template

```text
WORKSTREAM:
OWNER:
STATUS: IN_PROGRESS
BRANCH:
FILES/PATHS:
INTENDED_OUTPUT:
TESTS:
DEPENDENCIES:
COST_RISK:
FIREBASE_WRITES: none / emulator / owner-approved
STARTED_AT:
LAST_UPDATE:
```

## Completion Report Template

```text
STATUS: REVIEW / DONE / BLOCKED
COMMIT/PR:
FILES_CHANGED:
RESULTS:
TESTS:
ACTIONS/PAGES:
FIREBASE_DEPLOY_EVIDENCE:
DATA/PRIVACY_IMPACT:
COST_IMPACT:
KNOWN_RISKS:
NEXT_ACTION:
```