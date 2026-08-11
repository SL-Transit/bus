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
| 3. Published Read Model / Network Journey | Primary AI (Greenfield) | REVIEW | immutable versions, pointer, routing contract/cache | Published contract เดียว, fixed/frequency routing, rollback | emulator only |
| 4. Booking / Passenger Consumer Integration | Unassigned | TODO | adapters และ compatibility migration | Consumers อ่าน Published contract เดียว; server revalidates booking | none จนอนุมัติ |
| 5. QA / Security / Release | Primary AI (Greenfield) | IN_PROGRESS | Emulator, Rules tests, load/cost/release gates | Regression, privacy, concurrency, version-switch และ rollback evidence | read-only/emulator |

## ลำดับดำเนินงาน

1. กำหนด Import Package และ Mapping จาก CSV/Excel
2. ตรวจความสัมพันธ์ บริษัท -> สถานที่/ป้ายกลาง -> เส้นทาง -> เที่ยว -> เวลา -> ราคา -> การต่อรถ
3. สร้าง Draft และ Validation Report
4. เชื่อม Admin ERP1 เป็น Draft/Review control plane
5. สร้าง Published Read Model เวอร์ชันเดียวด้วย Two-Phase Publish
6. สร้าง Network Journey Service และ version-keyed cache
7. ย้าย Booking, Passenger และ Map ไปใช้ Published contract เดียว
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
| Published Read Model / Journey | REVIEW | Draft PR #150; CI `31459838901` ผ่าน | Two-Phase Publish, rollback, hybrid routing และ cache; ยังไม่ merge/deploy |
| Booking / Passenger migration | TODO | ยังไม่มี Greenfield consumer PR | ระบบเดิมยังไม่ถูกย้าย |

### Active file locks

- Workstream 3 `agent/greenfield-published-journey`: `greenfield-erp/phase5/**`, `tests/greenfield-erp-phase5*`, `docs/greenfield-erp/PHASE5-*`, `.github/workflows/booking-security-validation.yml` เฉพาะขั้นทดสอบ Phase 5 และ `ai-handoffs/WORK-BOARD.md`
- PR #147 และ #148 Merge แล้วและปลด file lock เดิม
- ห้ามงานใหม่แก้ไฟล์ที่ล็อกข้างต้นจนกว่า PR เจ้าของไฟล์จะ merge, close หรือปลด lockในบอร์ด

### Workstream 3 authorization

- Owner อนุมัติให้เริ่ม Workstream 3 เมื่อ 2026-08-11
- อนุญาตเฉพาะ code, contract, tests และ Firebase Emulator บน GitHub branch/PR
- Publish version/current pointer ใช้ได้เฉพาะ demo project + Emulator ในระยะนี้
- ห้าม Firebase deploy, Rules deploy, seed/import ข้อมูลจริง, Production write และ Consumer cutover
- Merge PR ของ Workstream 3 ต้องขอ Owner approval แยก

### ขอบเขตที่ยังไม่ได้รับอนุมัติ

- Merge/deploy PR ของ `agent/greenfield-published-journey`
- Firebase deploy, Rules deploy, Storage lifecycle, seed/import ข้อมูลจริง หรือ Production write
- Excel parser/mapping ที่ใช้ข้อมูลจริง, Review/Approve commands และ Booking/Passenger/Map cutover

## Completion Report — Workstream 3 / PR #150

```text
STATUS: REVIEW
COMMIT/PR: Draft PR #150 (`agent/greenfield-published-journey`)
FILES_CHANGED: greenfield-erp/phase5/**, tests/greenfield-erp-phase5*, docs/greenfield-erp/PHASE5-PUBLISHED-JOURNEY.md, workflow test step, WORK-BOARD.md
RESULTS: immutable query-shaped Read Model; chunk staging/checksum; ready gate; atomic 3-location pointer switch; rollback; fixed/frequency journey; explicit transfer; version-keyed cache
TESTS: GitHub Actions run 31459838901 passed unit tests, Phase 2/4/5 Emulators, version switch, rollback and existing regression/performance suite
ACTIONS/PAGES: https://github.com/SL-Transit/bus/actions/runs/31459838901 ; no Pages deploy from Draft PR
FIREBASE_DEPLOY_EVIDENCE: none — Emulator only
DATA/PRIVACY_IMPACT: canonical fixture only; no passenger, booking, payment or personal data
COST_IMPACT: no Production cost; operational chunk 4 MB/4,500 leaf paths; atomic switch 3 locations/64 KiB; bounded verification concurrency and journey states
KNOWN_RISKS: not full RAPTOR; Production latency/load not measured; frequency segment runtime is missing from Data Contract v1 and therefore blocks publication unless explicitly supplied; Actions dependency deprecation warnings remain outside this PR
NEXT_ACTION: Owner review; merge requires separate approval. Production Functions/Rules/current pointer and Consumer cutover remain forbidden.
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
