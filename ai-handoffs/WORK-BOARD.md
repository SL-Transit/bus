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
| 2. Admin ERP1 Integration | Primary AI (Greenfield) | DONE | `admin-erp1.html`, backend draft/review APIs | Import -> Draft -> Validate -> Review UI ที่ไม่เขียน Published โดยตรง | none จนอนุมัติ |
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
| Admin ERP1 backend integration | DONE | PR #152 merged as `199e2e348abaaa748a6a1f9b8d778291acb66e4f`; CI `31493338953`; Pages `31493736824` | Emulator integration ผ่านและอยู่ใน `main`; Draft revalidation/editor ยังเป็นงานถัดไปแยก scope |
| Admin Draft revalidation/editor | DONE | Owner อนุมัติ Merge PR #154; CI `31501263562` ผ่านครบ | Bounded editor, async revalidation, Reject และ retention; รอ Squash Merge เข้า `main` เท่านั้น |
| Consumer migration | TODO | Phase 6B scope | เริ่ม Read-only shadow mode; Booking เป็นลำดับสุดท้าย |

### Active file locks

- ERP Sandbox Firebase Hosting Preview — Owner: Primary AI (Sandbox); Status: `IN_PROGRESS`; Branch: `codex/erp-experimental-sandbox`
  - Files/paths: `.github/workflows/erp-sandbox-hosting-preview.yml`; `.github/firebase/erp-sandbox-preview.json`; `experimental/erp-sandbox/{README.md,SAFETY-GUARDS.md,tests/**}`; `ai-handoffs/WORK-BOARD.md`
  - Intended output: Deploy เฉพาะ Admin ERP1 static allowlist ไป Firebase Hosting Preview Channel `pr-155` แบบ manual; ไม่แตะ Live Hosting
  - Tests: sandbox unit/isolation; GitHub Actions exact-branch guard; เปิด Preview URL และตรวจ Safe Mode/ไม่มี Backend
  - Dependencies: Owner-approved project `sl-transit-erp-sandbox`; GitHub OIDC แบบไม่มี Service Account key
  - Cost risk: Spark plan; static filesเท่านั้น; channel หมดอายุ 7 วัน; ไม่มี Functions/RTDB/Storage reads หรือ writes
  - Firebase writes: Hosting Preview Channel only; ห้าม Live deploy, RTDB, Rules, Functions, Publish, pointer switch, merge และ consumer cutover
  - Started/last update: 2026-08-13
- ERP Sandbox Excel readiness review UI — Owner: Primary AI (Sandbox); Status: `REVIEW`; Branch: `codex/erp-experimental-sandbox`
  - Files/paths: `experimental/erp-sandbox/**`, `.github/workflows/erp-sandbox-validation.yml`, `ai-handoffs/WORK-BOARD.md`
  - Intended output: แสดงสรุปจำนวนข้อมูลและข้อผิดพลาดตามชีต/แถว/คอลัมน์; แยก blocking/warning; ตรวจ Frequency ของ GRP-001 และ Transfer; ใช้ fixture และ Excel จริงแบบ read-only; หยุดที่ validate-only/Draft
  - Tests: generated fixtures + sandbox unit/CI; อ่านไฟล์จริงใน Downloads แบบ read-only และห้ามแนบไฟล์ Excel/ข้อมูลส่วนตัวเข้า GitHub
  - Dependencies: PR #166, Data Contract v1, Sandbox PR #155
  - Cost risk: แปลงไฟล์ฝั่ง Admin แบบจำกัด 25 MiB; ไม่ส่งไฟล์ Excel เข้า Function; worker/Emulator limits เดิม
  - Firebase writes: none; ห้าม deploy/Production/Rules/Publish/pointer switch/consumer cutover
  - Started/last update: 2026-08-13; CI ผ่าน; ไฟล์จริง 3.3.5 ถูกหยุดที่ validate-only ด้วย safety errors 17 จุด

- ERP Sandbox Hybrid Transfer Contract — Owner: Primary AI (Sandbox); Status: `REVIEW`; Branch: `codex/erp-experimental-sandbox`
  - Files: `experimental/erp-sandbox/contracts/greenfield-erp/v1/**`; `experimental/erp-sandbox/admin-erp1-excel-3-3-x.js`; `experimental/erp-sandbox/greenfield-erp/phase5/**`; `experimental/erp-sandbox/tests/**`; root/sandbox `WORK-BOARD.md`
  - Result: รองรับ Fixed → Frequency, Frequency → Fixed และ Frequency → Frequency; Operator/Service Mode เป็นตัวกรองหลัก; Fixed Trip/Frequency Service ID เป็นตัวกรองเสริม
  - Tests: GitHub Actions `sandbox-unit` และ `validate` ผ่านที่ commit `202603a`; ครอบคลุม mapping, semantic validator, exact service selector และ Journey Engine ทั้ง 3 รูปแบบ
  - Real Excel read-only: รุ่น 3.3.5, SHA-256 `1a96bf8fd9e6d5b85bb2f6c7f606a96827b6884438028732794c80559b80ac1f`, ไฟล์ไม่เปลี่ยน; 17 blocking issues เดิม (Frequency 16, Transfer 1), 0 warnings
  - Impact: ไม่มี Production read/write; ไม่มี Firebase Rules/Deploy/Publish/pointer switch/consumer cutover; main ไม่เปลี่ยน
  - Cost risk: ไม่เพิ่มการอ่าน RTDB ต่อคำขอ; matching ใช้ Published Read Model ในหน่วยความจำและกฎต่อรถแบบจำกัด
  - Next: Owner review ใน Draft PR #155; ต้องกรอก Frequency Service ของ GRP-001 และ Transfer Rule ที่ฉะเชิงเทราก่อนสร้าง Draft ที่ผ่าน Validate
  - Updated: 2026-08-13; commits `83bc8e8`, `202603a`

- Admin ERP Excel 3.3.x real-file QA — Owner: Primary AI; Status: `REVIEW`; Branch: `agent/admin-erp-excel-3-3-x-real-file-qa`
  - Files/paths: `ai-handoffs/WORK-BOARD.md`, `contracts/greenfield-erp/v1/excel-mapping-3.3.4.json`, `contracts/greenfield-erp/v1/excel-mapping-3.3.5.json`, `admin-erp1-excel-3-3-x.js`, `tests/greenfield-erp-excel-3-3-x.test.js`
  - Intended output: ทดสอบไฟล์จริงรุ่น 3.3.5 แบบไม่ส่งขึ้นระบบ, ยอมรับป้ายที่ไม่มีพิกัดและข้อมูลรถ/คนขับที่ยังไม่ครบ, เติมข้อมูลป้ายหลักจากชีตสำรวจเมื่อชีตจุดบริการยังไม่มี และคงชื่อป้ายภาษาไทยใน Draft
  - Tests: Unit + regression บนข้อมูลตัวอย่างที่ตัดข้อมูลส่วนตัวออก; ตรวจกรณีไม่มีพิกัด, จุดเชื่อมต่อซ้ำในเส้นทางแยก, รุ่นไม่รองรับ และข้อมูลอ้างอิงไม่ครบ
  - Dependencies: Data Contract v1, Phase 2 Excel mapper, Phase 6A Admin integration
  - Cost risk: อ่านไฟล์ในเบราว์เซอร์แบบจำกัดขนาด; จำกัดจำนวนแถว/ข้อผิดพลาด; ไม่เรียกบริการ Production
  - Firebase writes: none; ห้าม deploy/Production/Rules/Publish/pointer switch/consumer cutover
  - Started/last update: 2026-08-13; ไฟล์จริงรุ่น 3.3.5 ผ่านแบบ validate-only: 89 ป้าย, 6 เส้นทาง, 21 รูปแบบ, 60 เที่ยว, 295 เวลารายป้าย, 210 ค่าโดยสาร, รถ 5 และคนขับ 5; unit/regression 156 รายการผ่าน 150 และข้าม 6 เพราะ Emulator/ข้อมูลภายนอกไม่พร้อม

- Phase 6A.1 Draft revalidation/editor — Owner: Primary AI (Greenfield); Status: `DONE`; Branch: `codex/phase6a1-draft-revalidation-editor`; PR #154 อนุมัติให้ Squash Merge และปลดล็อกเมื่อ Merge สำเร็จ
  - Files/paths: `ai-handoffs/WORK-BOARD.md`, `admin-erp1.html`, `admin-erp1-greenfield-{api-client,controller,state}.js`, `assets/admin-erp1-greenfield.css`, `greenfield-erp/phase4/{command-gateway,emulator-contract,retention-service,rtdb-retention-store,retention-contract}.js|json`, `greenfield-erp/phase4/functions/index.js`, `greenfield-erp/phase6a/**`, `tests/greenfield-erp-phase6a*`, `tests/admin-erp1-{integration,network-publish}.test.js`, `docs/greenfield-erp/PHASE6A-DRAFT-REVALIDATION.md`
  - Intended output: อ่าน Draft แบบแบ่งหน้า, บันทึกการแก้ไขแบบ bounded operations, ตรวจ Draft ใหม่ด้วย async worker, แสดงผล Validation และ Reject จาก Admin ERP1 โดยไม่มี Publish
  - Tests: Unit + demo RTDB/Storage Emulator + existing regression; ตรวจ revision conflict, stale validation, scope, separation of duties, payload/result bounds และ direct browser write denial
  - Dependencies: Data Contract v1, Phase 4 async import/retention, Phase 6A backend integration
  - Cost risk: Gateway ห้ามโหลด Draft ทั้งก้อน; page size/response จำกัด; validation worker `maxInstances=2`, `concurrency=1`; error report จำกัด; retention ครอบคลุม validation jobs
  - Firebase writes: demo Emulator only; ห้าม deploy/Production/Rules/Publish/pointer switch/consumer cutover
  - Started/last update: 2026-08-11

- Phase 6A file lock ถูกปลดหลัง PR #152 merge; งานต่อยอดต้องเปิด branch/file lock ใหม่ตาม scope ของตน
- Workstream 3 runtime lock ถูกปลดหลัง PR #150 merge
- Consumer Phase 6B ยังไม่ล็อก; ต้องประกาศ Owner/branch/files และห้ามรวม Draft revalidation/editor โดยไม่เปิด scope แยก

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
NEXT_ACTION: Phase 6A merged in PR #152. Draft revalidation/editor gaps need a separate scoped work item before Consumer shadow mode; Production and cutover remain forbidden.
```

## Completion Report — Workstream 2 / PR #152

```text
STATUS: DONE
COMMIT/PR: PR #152 squash merged as 199e2e348abaaa748a6a1f9b8d778291acb66e4f on 2026-08-11
FILES_CHANGED: admin-erp1.html; admin-erp1-greenfield-*.js; assets/admin-erp1-greenfield.css; greenfield-erp/phase2, phase4, phase6a; Emulator Rules/config; tests; workflow; Phase 6 docs/board
RESULTS: Admin Auth command client; authorized multipart Storage quarantine upload; async import polling; Draft/Review/Approve backend with revision lock, idempotency, scope checks, separation of duties and audit; no Publish
TESTS: GitHub Actions run 31493338953 passed existing unit/regression/performance plus Phase 2/4/6A/5 Emulator; direct browser RTDB write denied
ACTIONS/PAGES: final validation passed; GitHub Pages runs 31493736824 and 31493735968 passed after merge
FIREBASE_DEPLOY_EVIDENCE: none — demo project/Emulator only; Pages deployment is not Firebase deployment
DATA/PRIVACY_IMPACT: canonical fixture only; no passenger, booking, payment or personal Production data
COST_IMPACT: no Firebase Production cost; Gateway 1 MiB/maxInstances 3/concurrency 10; upload 25 MiB/15-minute authorization; worker maxInstances 2/concurrency 1; Draft save 100 operations/512 KiB
KNOWN_RISKS: edited Draft requires a future revalidation command; Admin editor/Reject control not exposed; Production upload signer and Storage lifecycle not implemented; Actions dependency deprecation warnings remain
NEXT_ACTION: open a separate lock/PR for Draft revalidation and Admin editor/Reject design. Phase 6B Consumer shadow mode, Firebase deploy and Production cutover remain unapproved.
```
## Completion Report — Phase 6A.1 / PR #154

```text
STATUS: DONE
OWNER_APPROVAL: Owner อนุมัติ Squash Merge PR #154 ใน Codex task เมื่อ 2026-08-11
COMMIT/PR: PR #154 อนุมัติให้ Squash Merge; final merge SHA ตรวจสอบได้จาก GitHub history
FILES_CHANGED: Admin ERP1 UI/client/state; Phase 4 gateway/auth/function/retention; Phase 6A.1 workflow/validation job store; contracts/docs/tests/board
RESULTS: Draft read แบบแบ่งหน้า; save เฉพาะ bounded operations; validation job/worker ที่กัน stale revision และ superseded job; Review gate; Owner Reject/Approve; validation job retention
TESTS: GitHub Actions run 31501263562 ผ่าน Unit/Regression, Phase 2/4/6A/5 Emulators และ Performance; Phase 6A.1 ทดสอบ edit -> revalidate -> review -> reject -> edit -> revalidate -> approve
ACTIONS/PAGES: ไม่มี Pages/Firebase deploy ในขอบเขตนี้
FIREBASE_DEPLOY_EVIDENCE: none — demo project/Emulator only
DATA/PRIVACY_IMPACT: ใช้ canonical fixture เท่านั้น; ไม่มี Booking, Passenger, Payment หรือข้อมูลส่วนตัว Production
COST_IMPACT: ไม่มีค่า Firebase Production; Gateway ไม่อ่าน Draft ทั้งก้อน; read 50 records/256 KiB; worker maxInstances 2/concurrency 1; report 100 errors; validation job retention 24 ชั่วโมงใน Emulator
KNOWN_RISKS: Production task dispatcher/upload signer/Storage lifecycle และ Production load/cost evidence ยังไม่มี; Actions มี dependency deprecation warnings เดิม
NEXT_ACTION: Squash Merge PR #154 เข้า main เท่านั้น; Firebase/Rules deploy, Production write, Publish และ Consumer cutover ยังต้องขอ Owner approval แยก
```

## Completion Report — Admin ERP Excel 3.3.x

```text
STATUS: REVIEW
COMMIT/PR: commit 037db78; Draft PR #165
FILES_CHANGED: Admin ERP1 UI/controller; Excel 3.3.x converter; mapping profiles 3.3.4/3.3.5; Phase 2 mapper/Draft storage; SheetJS 0.20.3 + Apache-2.0 license; tests; board
RESULTS: เลือก .xlsx ได้; อ่านรุ่นจาก 91_ควบคุมการนำเข้า!C5; ตรวจชีต/หัวตาราง/ช่องบังคับ/รหัส/ความสัมพันธ์; ยอมให้ไม่มีพิกัดและระยะทาง; ยอมให้จุดเดิมซ้ำคนละลำดับ; แปลงเป็น Canonical JSON ก่อน upload; เก็บข้อมูลปฏิบัติการที่มีรหัสลง Draft แยกหมวด; แสดงชื่อไทยคู่ Stable ID
TESTS: Node syntax checks และ 47 unit/regression tests ผ่านทั้งหมด; GitHub Actions run 31655624321 ผ่านชุดเดิม, Phase 2/4/5/6A Emulator และ performance ครบ
ACTIONS/PAGES: none
FIREBASE_DEPLOY_EVIDENCE: none — ไม่มี deploy, Rules change, Production write หรือ Publish
DATA/PRIVACY_IMPACT: ชุดทดสอบเป็นข้อมูลจำลอง; ไม่อ่านหรือฝังไฟล์จริง/บัญชี/เบอร์โทร/UID; ข้อมูลปฏิบัติการจริงจะอยู่ใน Draft ที่ต้องผ่านสิทธิ์ Admin
COST_IMPACT: ไม่มีค่า Production; เพิ่มตัวอ่าน Excel ฝั่งเบราว์เซอร์ประมาณ 952 KB; จำกัดไฟล์ 25 MB และแปลงเป็น JSON ก่อนส่ง
KNOWN_RISKS: ยังไม่ได้ทดสอบกับไฟล์จริงของ Owner; การ deploy และการทดสอบ Emulator เต็มรูปแบบยังอยู่นอกขอบเขต; ข้อมูล Frequency/Fare Product ที่ไม่มีชีตต้นทางยังใช้กติกา Data Contract v1 เดิม
NEXT_ACTION: Owner ตรวจ Draft PR #165; หลังอนุมัติ merge จึงทดสอบไฟล์จริงในสภาพแวดล้อมที่อนุมัติแยก โดยยังห้าม Production/Publish
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

## Completion Report — ERP Sandbox Excel 3.3.5 safety adapter / PR #155

```text
STATUS: REVIEW
COMMIT/PR: Draft PR #155; implementation/CI-fix head 4f46687cf3b0b47742633b1fe80f277c8df73403
FILES_CHANGED: experimental/erp-sandbox/**; .github/workflows/erp-sandbox-validation.yml; ai-handoffs/WORK-BOARD.md
RESULTS: ซิงก์ Adapter 3.3.5 จาก main; เพิ่ม mapping ชีต 05A และ 23; เพิ่มสัญญา Frequency sheet 24; บล็อก GRP-001 แบบ Fixed และบล็อกเครือข่ายหลายกลุ่มที่ไม่มี transfer rule
REAL_WORKBOOK_CHECK: อ่าน new erp data.xlsx 3.3.5 แบบ local read-only; พบ 2 route mode conflicts, 1 schedule conflict, 12 fixed-trip conflicts, 1 missing frequency data และ 1 missing transfer rule รวม 17 จุด
TESTS: Sandbox Actions run 31661996038 ผ่าน 72/72; full unit/regression + Phase 2/4/6A/5 Emulator + performance run 31661996028 ผ่าน
FIREBASE_DEPLOY_EVIDENCE: none — ไม่มี Deploy, Production write, Rules change, Publish หรือ pointer switch
DATA/PRIVACY_IMPACT: ไม่แนบหรืออัปโหลด Excel; ไม่มี Booking/Passenger/Payment/ข้อมูลส่วนตัวใน GitHub
COST_IMPACT: ไม่มีค่า Firebase Production; จำกัด Excel 25 MiB; ไม่ส่งไฟล์ xlsx เข้า Cloud Function; ใช้ worker/Emulator limits เดิม
KNOWN_RISKS: ไฟล์จริงยังสร้าง Draft ที่ผ่าน validation ไม่ได้จนกว่า Owner จะแก้ GRP-001 ให้เป็น Frequency พร้อม headway/open-close และกรอกจุดต่อเที่ยว
NEXT_ACTION: ให้เจ้าของข้อมูลแก้ Excel ต้นทางแล้วตรวจซ้ำใน Sandbox; ห้าม Merge PR #155 หรือ Deploy จนได้รับอนุมัติแยก
```

## Completion Report — ERP Sandbox Excel readiness review UI / PR #155

```text
STATUS: REVIEW
COMMIT/PR: Draft PR #155; implementation/UTF-8 fix head 534bad8ce7b96a17d954f011de5cb961421c969c
FILES_CHANGED: experimental/erp-sandbox/admin-erp1.html; admin-erp1-greenfield-controller.js; admin-erp1-excel-3-3-x.js; assets/admin-erp1-greenfield.css; tests/greenfield-erp-excel-3-3-x.test.js; root/sandbox WORK-BOARD.md
RESULTS: หน้า Admin แสดงยอดข้อมูล 9 หมวด; แยก blocking/warning; จัดข้อผิดพลาดตามชีต/แถว/คอลัมน์; มีด่าน GRP-001 Frequency/Queue และ Network Transfer; จำกัดการแสดงหน้าเว็บ 200 รายการเพื่อคุมหน่วยความจำ
REAL_WORKBOOK_CHECK: new erp data.xlsx รุ่น 3.3.5 แบบ read-only; 2 บริษัท, 89 จุด, 6 เส้นทาง, 21 รูปแบบ, 60 fixed trips, 295 stop times, 0 frequency services, 210 fare rules, 0 transfer rules; blocked 17 รายการ (Frequency 16, Transfer 1)
TESTS: Sandbox Actions run 31671263832 ผ่าน; full unit/regression + Emulator/performance run 31671263817 ผ่าน; syntax และ UTF-8 remote checks ผ่าน ไม่มี replacement character
ACTIONS/PAGES: ไม่มี deploy; PR ยังเป็น Draft
FIREBASE_DEPLOY_EVIDENCE: none — ไม่มี Firebase/Rules deploy, Production write, Publish หรือ pointer switch
DATA/PRIVACY_IMPACT: อ่าน Excel ต้นทางเฉพาะในเครื่องแบบ read-only; ไม่อัปโหลด Excel; ไม่แตะ Booking/Passenger/Payment/ข้อมูลส่วนตัว
COST_IMPACT: ไม่มีค่าใช้จ่าย Firebase Production; ตรวจ Excel ใน browser ก่อน Backend; จำกัดไฟล์ 25 MiB และจำกัด UI 200 issues
KNOWN_RISKS: Excel จริงยังไม่มี frequency service/headway สำหรับ GRP-001 และยังไม่มีกฎต่อรถ จึงถูกหยุดก่อนสร้าง Draft ตามที่ออกแบบ
NEXT_ACTION: เจ้าของข้อมูลแก้ GRP-001 เป็น Frequency พร้อม start_time/end_time/headway_secs และกรอกกฎต่อรถ แล้วตรวจซ้ำใน Sandbox; ห้าม Merge/Deploy จนได้รับ Owner approval แยก
```
- ERP Sandbox Canonical Draft Review Flow — Owner: Primary AI (Sandbox); Status: `REVIEW`; Branch: `codex/erp-experimental-sandbox`
  - Files: `experimental/erp-sandbox/admin-erp1.html`; `experimental/erp-sandbox/admin-erp1-greenfield-controller.js`; `experimental/erp-sandbox/admin-erp1-greenfield-draft-preview.js`; Canonical validator; Phase 2 Draft service/store; tests; root/sandbox `WORK-BOARD.md`
  - Result: Excel/Canonical JSON ที่ผ่าน Validation สร้าง Draft ทดลองในหน่วยความจำและแสดง Draft ID, status, schema/template, mapping version, checksum, จำนวนข้อมูล และรายการเครือข่ายแบบแบ่งหน้า
  - Privacy: Memory-only Review ไม่ใช้ localStorage/IndexedDB/Fetch, ซ่อน `operationalRecords` และไม่แสดงบัญชีผู้ใช้ สิทธิ์ คนขับ หรือข้อมูลส่วนตัว; Owner Approval ถูกปิดในโหมดนี้
  - Data retention fix: Phase 2 Draft เก็บ `scheduleRules` และ `dailyQueueRules` ครบแล้วเมื่อใช้ RTDB Emulator backend
  - Tests: GitHub Actions `sandbox-unit` และ `validate` ผ่านที่ commit `995523e`; ทดสอบ valid Excel → Canonical → Draft → Review, invalid Canonical ไม่สร้าง Draft, redaction และ Review gate
  - Real Excel read-only: รุ่น 3.3.5, SHA-256 `1a96bf8fd9e6d5b85bb2f6c7f606a96827b6884438028732794c80559b80ac1f`, ไฟล์ไม่เปลี่ยน; 17 blocking issues เดิม, Draft ไม่ถูกสร้าง
  - Firebase writes: none ใน Memory-only Review; ไม่มี Production, Rules, Deploy, Publish, pointer switch, merge หรือ consumer cutover
  - Cost risk: ไฟล์และ Canonical Package อยู่ใน browser memory; จำกัด 25 MiB; เมื่อเชื่อม Backend จริงยังใช้ quarantine/chunk limits และ command flow เดิม
  - Next: Owner review หน้า Admin ERP1 ใน Draft PR #155; หลัง Excel แก้ครบ 17 จุดจึงทดสอบ Draft จากข้อมูลจริงได้
  - Updated: 2026-08-13; commits `d2fd5cb`, `b8b9902`, `995523e`
