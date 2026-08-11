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
| 2. Admin ERP1 Integration | Primary AI (Greenfield) | REVIEW | `admin-erp1.html`, backend draft/review APIs | Import -> Draft -> Validate -> Review UI ที่ไม่เขียน Published โดยตรง | none จนอนุมัติ |
| 3. Published Read Model / Network Journey | Unassigned | TODO | immutable versions, pointer, routing contract/cache | Published contract เดียว, fixed/frequency routing, rollback | none จนอนุมัติ |
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
| โครงสร้างระบบใหม่ | DONE | PR #142 merged | เอกสารเท่านั้น; ไม่ deploy |
| Data Contract v1 | DONE | PR #143 merged | Canonical JSON contract และ fixtures |
| Draft Core | DONE | PR #144 merged | RTDB Emulator เท่านั้น |
| Admin ERP1 contract preview | REVIEW | Draft PR #147 | ยังไม่ใช่ Review/Approve/Publish UI สมบูรณ์ |
| Async Import + Retention | REVIEW | Draft PR #148, CI run `31448617071` ผ่าน | Canonical JSON เท่านั้น; Excel mapping ยังไม่ทำ; ไม่ deploy |
| Published Read Model / Journey | TODO | ยังไม่มี PR | ห้ามเริ่มซ้ำก่อนล็อก Workstream 3 |
| Booking / Passenger migration | TODO | ยังไม่มี Greenfield consumer PR | ระบบเดิมยังไม่ถูกย้าย |

### Active file locks

- PR #140 `agent/reset-central-board`: `ai-handoffs/**` เท่านั้น
- PR #141 `agent/decouple-notification-test-v2`: `tests/staff-notification-center.test.js`
- PR #147 `codex/greenfield-erp-phase3-admin-ui`: Greenfield Admin ERP1 preview/client/controller/tests
- PR #148 `codex/greenfield-erp-phase4-command-gateway`: Greenfield Phase 4.1 Gateway, Worker, retention, emulator config และ tests
- ห้ามเปิดงานใหม่ที่แก้ไฟล์ข้างต้นจนกว่า PR เจ้าของไฟล์จะ merge, close หรือปลด lock ในบอร์ด

### ขอบเขตที่ยังไม่ได้รับอนุมัติ

- Merge PR #140, #141, #147 หรือ #148
- Firebase deploy, Rules deploy, Storage lifecycle, seed/import ข้อมูลจริง หรือ Production write
- Excel parser/mapping, Review/Approve commands, Published version/current pointer, Journey Engine และ Consumer cutover
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