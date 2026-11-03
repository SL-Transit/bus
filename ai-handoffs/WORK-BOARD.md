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

### ### ### Active file locks

- Admin Quick Edit UI (ราคา + ลำดับป้ายจอด) — Owner: Primary AI; Status: `IN_PROGRESS`; Branch: `agent/admin-quick-edit`
  - Files/paths: `admin-quick-edit.html`
  - Intended output: หน้า Admin Quick Edit ภาษาไทยสำหรับ login, แก้ราคา fare row รายแถว, สลับลำดับป้าย และบันทึก audit ก่อนเขียนค่าจริงโดยตรง
  - Tests: Static checks, Emulator read/write/audit flow, responsive mobile UI และ browser evidence
  - Dependencies: Firebase Auth/RTDB config เดิม, `data/erpDataCenter/workbookSource/routeFareRows`, `data/erpDataCenter/stops`, `data/erpDataCenter/meta/audit`
  - Cost risk: อ่านเฉพาะสองรายการที่ใช้ในหน้า; ไม่เพิ่ม library; ไม่แตะ Production ระหว่างทดสอบ UI
  - Firebase writes: Emulator only during implementation; Production writes require Owner approval
  - Started/last update: 2026-08-26


- - Firebase RTDB Audit Log Rules — Owner: Primary AI; Status: `REVIEW`; Branch: `agent/rules-audit-log`
  - Files/paths: `database.rules.json`
  - Intended output: เพิ่มสิทธิ์อ่าน/เขียนเฉพาะ `data/erpDataCenter/meta/audit/$auditId` สำหรับบัญชีที่มีค่า `adminAccounts/{uid} === true`
  - Tests: Firebase Emulator admin write succeeds; non-admin write remains `PERMISSION_DENIED`
  - Dependencies: existing Firebase Auth and `data/erpDataCenter/adminAccounts` rule
  - Cost risk: no new library or Production cost; no Firebase Rules deploy in this task
  - Firebase writes: Emulator test only; no Production write/Rules deploy until Owner approval
  -   - Started/last update: 2026-08-26
  - Completion report: STATUS REVIEW; COMMIT 7bd8f894; PR #174; Emulator admin write succeeded; non-admin write was denied (HTTP 401 REST permission-denied equivalent); no Production write or Firebase Rules deploy
  - Next action: Owner review PR #174; do not deploy Firebase Rules until separately approved


- LINE In-App Browser guard silent-bypass fix + unification — Owner: Coordination Agent; Status: `REVIEW`; Branch: `agent/fix-line-inapp-browser-silent-bypass`
  - Files/paths: `ai-handoffs/WORK-BOARD.md`, `site-runtime.js`, `booking1.html`, `booking-pos.js`, `index.html`, `passenger.html`, `check_ticket.html`, `cancel_ticket.html`, `info.html`, `tests/booking1-line-browser-guard.test.js`, `tests/site-runtime-line-browser-guard.test.js`
  - Intended output: ผู้โดยสารรายงานว่าจองตั๋วผ่าน LINE In-App Browser ได้ทั้งที่ตั้งค่าบังคับเปลี่ยนเป็นเบราว์เซอร์หลักไว้แล้ว ("หลุด") สาเหตุคือ (1) `booking1.html` ตรวจจับ UA แบบ `Line/x.x.x` เท่านั้น พลาด LIFF webview ที่ booking1 ใช้จริง (2) ทั้ง `site-runtime.js` และ `booking1.html` มีจุดที่ hand-off ไปเบราว์เซอร์หลักล้มเหลวแบบเงียบ (Android `intent://` ที่ไม่สำเร็จ, หรือ `setTimeout` รีโหลดหน้าเดิมพร้อม `ext=1` ไม่ว่าจะ hand-off สำเร็จหรือไม่) ทำให้ guard ปิดตัวเองถาวรสำหรับ session นั้น แก้โดยตรวจสอบด้วย `visibilitychange`/`pagehide` ว่าออกจาก LINE ได้จริงก่อนถือว่าสำเร็จ และรวม guard ทั้ง 3 ชุด (site-runtime.js, booking1.html inline, booking-pos.js ที่เป็นโค้ดซ้ำแต่ยังไม่ได้ wire เข้าใช้งานจริง) ให้เหลือ implementation เดียวคือ `site-runtime.js` ทุกหน้าโหลดจากไฟล์เดียวกัน
  - Tests: `tests/booking1-line-browser-guard.test.js` (แก้ใหม่ ยืนยันว่า booking1.html ไม่มี guard โค้ดของตัวเองเหลืออยู่เลยและโหลด shared script), `tests/site-runtime-line-browser-guard.test.js` (ใหม่ ยืนยันทุกหน้าโหลด shared script เดียวกัน และ booking-pos.js ไม่มีโค้ดซ้ำ); รันเทสต์ทั้งหมด (`tests/*.test.js`) แล้ว ไม่มี regression ใหม่ — เทสต์ที่ fail 7 ตัวเป็นของเดิมบน `main` (ต้องต่อ Firebase/เน็ตซึ่งไม่มีในสภาพแวดล้อมที่ตรวจ)
  - Dependencies: ไม่มี (client-side UX/browser-detection code เท่านั้น ไม่แตะ business logic/ERP)
  - Cost risk: ไม่มี — ไม่มีการเรียก Firebase เพิ่ม
  - Firebase writes: none; ห้าม deploy/Production/Rules/Publish/pointer switch/consumer cutover
  - Started/last update: 2026-08-22; commits `ab3e0b7` (silent-bypass fix), `4d3996b` (รวม guard เป็นตัวเดียว) push ขึ้น branch แล้ว รอเปิด PR + Owner review

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

- Admin ERP fare table layout + complete fare rows — Owner: Primary AI; Status: `IN_PROGRESS`; Branch: `agent/fix-admin-erp-table-layout`
  - Files/paths: `admin-erp.html`
  - Intended output: คงข้อมูลค่าโดยสารจาก `routeFareRows` ครบทุกแถว แสดงเป็นตารางจริง และให้คอลัมน์การทำงาน/ปุ่มบันทึกอยู่ด้านขวา พร้อมใช้งานบน desktop และมือถือ
  - Tests: Static checks, full existing Node test suite, browser read-only UI verification; no Production write during implementation
  - Dependencies: existing Firebase Auth/RTDB fare read and Owner-approved fare edit/audit flow
  - Cost risk: ไม่เพิ่ม library; ไม่เพิ่ม path หรือการอ่านข้อมูลนอก fare; ไม่มี Production write ระหว่างพัฒนา
  - Firebase writes: none during implementation; Production writes require separate Owner approval
  - Started/last update: 2026-08-26
- Admin ERP Sheet 4 รอบเวลา — Owner: Primary AI; Status: `IN_PROGRESS`; Branch: `agent/admin-erp-schedule-rounds`
  - Files/paths: `admin-erp.html`, `tests/admin-console-safety.test.js`, `tests/admin-erp-legacy-adapter-migration.test.js`, `ai-handoffs/SYSTEM-DIRECTION.md`, `ai-handoffs/DECISION-LOG.md`
  - Intended output: เพิ่มชีต 4 รอบเวลาใน `admin-erp.html` เดิม แสดงข้อมูล `scheduleRows` ครบทุกคอลัมน์/ทุกแถว แก้เวลาออก วันวิ่ง และสถานะเปิดจองได้ พร้อมปุ่มบันทึกด้านขวาและ Audit Log ก่อนเขียนจริง
  - Tests: Static checks, full existing Node test suite, browser UI verification; Emulator/Production write ใช้เฉพาะเมื่อมีการทดสอบที่ได้รับอนุมัติ
  - Dependencies: existing Firebase Auth/RTDB, `data/erpDataCenter/workbookSource/scheduleRows`, `data/erpDataCenter/meta/audit`, Owner-approved direct fare write pattern
  - Cost risk: ไม่เพิ่ม library; อ่าน/เขียนเฉพาะ schedule row ที่เลือกและ audit; ไม่แก้ Rules และไม่ deploy ระหว่างพัฒนา
  - Firebase writes: none during implementation; Production writes require explicit Owner approval at test time
  - Started/last update: 2026-08-26
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
- Admin ERP fare editor — Owner: Primary AI; Status: `REVIEW`; Branch: `agent/admin-erp-fare-edit`
  - Files/paths: `admin-erp.html`
  - Intended output: เพิ่มการแก้ไขราคา fare รายแถวในหน้า Admin ERP เดิม พร้อมตรวจสิทธิ์แอดมิน บันทึก Audit Log ก่อนเขียนค่าราคาจริง และแสดงสถานะบันทึก
  - Tests: Static checks, Firebase Emulator/admin authorization and audit-before-write flow; existing regression suite
  - Dependencies: Firebase Auth/RTDB config เดิม, `data/erpDataCenter/workbookSource/routeFareRows`, `data/erpDataCenter/meta/audit`
  - Cost risk: ไม่เพิ่ม library ใหม่; อ่าน/เขียนเฉพาะ fare row และ audit ที่กดแก้; Production write ไม่ทำระหว่างพัฒนา
  - Firebase writes: emulator only; Production writes require separate Owner approval
  - Started/last update: 2026-08-26
### Completion Report — Admin ERP fare editor

```text
STATUS: REVIEW
COMMIT/PR: commit 949f1e90dd93ca8a6785e00f258e66373d2420a1; PR #178
FILES_CHANGED: admin-erp.html, ai-handoffs/WORK-BOARD.md
RESULTS: เพิ่มแท็บราคาใน Admin ERP ให้ใช้ routeFareRows จริง แก้ราคาได้รายแถว และเขียน audit ก่อน amount โดยไม่เปิดแก้หมวดอื่น
TESTS: inline JavaScript syntax ผ่าน; diff ตรวจแล้ว; ยังไม่ได้ทดสอบ Emulator/Production write
ACTIONS/PAGES: ยังไม่มี deploy; รอ Owner review/merge
FIREBASE_DEPLOY_EVIDENCE: none
DATA/PRIVACY_IMPACT: อ่าน/เขียนเฉพาะ fare row ที่เลือกและ audit metadata; ไม่แตะข้อมูลผู้โดยสาร
COST_IMPACT: เพิ่ม Firebase Database compat SDK; ไม่มี library UI ใหม่; ไม่ทำ Production test
KNOWN_RISKS: ต้องยืนยัน Emulator rule/owner authorization ก่อน merge และทดสอบหน้าใช้งานจริงหลังอนุมัติ
NEXT_ACTION: Owner ตรวจ PR #178; ห้าม merge/deploy โดยอัตโนมัติ
```
- Owner-approved direct fare write safety-contract update — Owner: Primary AI; Status: `DONE`; Branch: `agent/admin-erp-fare-edit`
  - Files/paths: `admin-erp.html`, `tests/admin-console-safety.test.js`, `tests/admin-erp-legacy-adapter-migration.test.js`, `ai-handoffs/SYSTEM-DIRECTION.md`, `ai-handoffs/DECISION-LOG.md`
  - Intended output: บันทึกข้อยกเว้นที่ Owner อนุมัติให้ Admin ERP แก้เฉพาะ fare amount โดยตรง พร้อม allowlist test; ทุก write อื่นยังถูกบล็อก
  - Tests: ชุด `node --test tests/*.test.js` ทั้งหมด; ตรวจ allowlist direct fare write และ audit-before-write
  - Dependencies: existing `data/erpDataCenter/workbookSource/routeFareRows`, `data/erpDataCenter/meta/audit`, Firebase Auth/RTDB rules
  - Cost risk: ไม่มี library UI ใหม่; เพิ่มเฉพาะ direct fare/audit write ที่ผู้ดูแลกด; ห้าม Production test/deploy ในงานนี้
  - Firebase writes: emulator only; Production write requires separate Owner approval
  - Started/last update: 2026-08-26
- Admin ERP fare renderer wiring — Owner: Primary AI; Status: `DONE`; Branch: `agent/fix-admin-erp-fare-renderer`
  - Files/paths: `admin-erp.html`
  - Intended output: ให้ renderer ที่ Production ใช้งานจริงแสดงตารางราคาและปุ่มแก้ไข/บันทึกในหน้า Admin ERP โดยใช้ fare path และ audit flow ที่ได้รับอนุมัติแล้ว
  - Tests: Static checks, full existing Node test suite, browser read-only verification of visible fare editor; no save during implementation
  - Dependencies: existing `erpFareTable`/fare audit flow, `data/erpDataCenter/workbookSource/routeFareRows`, `data/erpDataCenter/meta/audit`
  - Cost risk: ไม่เพิ่ม library; ไม่แก้ Rules; ไม่มี Production write ระหว่างพัฒนา
  - Firebase writes: none during implementation; Production write requires explicit Owner approval at test time
  - Started/last update: 2026-08-26


- Admin ERP Sheet 4 schedule read-path fix — Owner: Primary AI; Status: `REVIEW`; Branch: `agent/fix-admin-erp-schedule-read`
  - FILES: `admin-erp.html`
  - Intended output: ให้ชีต 4 รอบเวลาอ่าน `scheduleRows` จาก RTDB โดยตรงเหมือนตารางราคา เมื่อ Adapter รวมข้อมูลล้มเหลว โดยไม่เปลี่ยน logic บันทึก/Audit/Rules
  - Tests: ตรวจ diff จำกัดจุด, full existing Node test suite ผ่าน GitHub CI, browser read-only verification; ไม่มี Production write
  - Dependencies: `data/erpDataCenter/workbookSource/scheduleRows` และ Firebase Auth/RTDB เดิม
  - Cost risk: ไม่เพิ่ม library ไม่เพิ่ม Firebase path และไม่แก้ข้อมูลจริง
  - Firebase writes: none during implementation; ห้าม Production write/deploy
  - Started/last update: 2026-08-26

  - Completion report: STATUS REVIEW; PR #182; direct scheduleRows loader and Sheet 4 wiring added; static JavaScript syntax PASS; direct RTDB path/state/status/load-call checks PASS; GitHub CI pending because automatic run was not created; no Firebase write or deploy
- Admin ERP Sheet 5 — คิวรถและเวลา — Owner: Primary AI; Status: `IN_PROGRESS`; Branch: `agent/admin-erp-sheet5-queue-time`
  - FILES/PATHS: `admin-erp.html`
  - Intended output: เชื่อมข้อมูลจริง 84 รายการจาก `publishedSchedule/queueScheduleRows` เข้า Sheet 5 ในหน้า Admin ERP เป็นตารางแบบ Sheet ที่มีหัวคอลัมน์ชัดเจนและเลื่อนแนวนอนได้
  - Tests: static checks, ตรวจจำนวน/ฟิลด์ข้อมูล 84 รายการ, full existing Node test suite; ไม่มี Firebase write/deploy
  - Dependencies: Published Read Model `publishedSchedule/queueScheduleRows`, Firebase RTDB read-only และโครงสร้าง ERP UI เดิม
  - Cost risk: ไม่เพิ่ม UI library; อ่านข้อมูลเฉพาะชุดคิวรถและเวลา; ไม่มี Production write
  - FIREBASE_WRITES: none
  - STARTED_AT: 2026-08-27
  - LAST_UPDATE: 2026-08-27


## LINE Chat Booking Foundation — 2026-11-02

STATUS: REVIEW
OWNER: Codex (current LINE migration chat)
BRANCH: codex/line-chat-booking-foundation-20261102
FILES: functions/line-passenger-webhook.js; tests/line-passenger-webhook.test.js; docs/LINE-CHAT-BOOKING-MIGRATION.md; ai-handoffs/WORK-BOARD.md (append-only entry)
SCOPE: Passenger webhook validation boundary and offline tests; migration contract for full in-chat booking. No production endpoint export. No duplicate journey/schema/booking engine.
TESTS: Synthetic signed requests; destination/user isolation; malformed requests; disabled configuration; bounded payload; deterministic command preview. Existing GitHub checks after draft PR.
DEPENDENCIES: Existing server booking/capacity and published journey contracts in sl-transit-9464e; production source differs from current main and needs reconciliation before integration.
PRODUCTION_WRITES: none; no deploy, secrets, LINE sends, bookings, Rules or menu changes.
COST_RISK: No production traffic or added dependencies; CI only.
NEXT_ACTION: Review foundation; integrate existing trusted booking boundary and emulator proof before separate deployment approval.


### Foundation review report — PR #187
RESULTS: Pure passenger webhook validation and command preview added. Disabled by default; no production export or sender. Full booking flow remains unfinished.
TESTS: 20/20 synthetic assertion cases passed in memory from code read back from GitHub; GitHub security/performance run 41475464532 started for implementation commit 2f62cd3. No Emulator/end-to-end proof.
IMPACT: Four changed files only (boundary, tests, migration plan, board). Existing board nonblank content preserved; web editor normalized line endings. No dependencies or production cost.
PRODUCTION_WRITES: none. No main merge, Firebase deployment, secret change, LINE message, booking, Rules or Rich Menu mutation.
NEXT_ACTION: Review draft #187, reconcile deployed source with main, implement durable inbox/session and reuse the existing booking/capacity boundary with Emulator tests. Payment runtime must be confirmed before handling slips. Deployment and passenger cutover remain separate.


### LINE conversation step — 2026-11-02
STATUS: REVIEW
OWNER: Codex (current LINE migration chat)
BRANCH: codex/line-chat-booking-foundation-20261102
FILES: functions/line-booking-conversation.js; tests/line-booking-conversation.test.js; functions/line-passenger-webhook.js; tests/line-passenger-webhook.test.js; docs/LINE-CHAT-BOOKING-MIGRATION.md; ai-handoffs/WORK-BOARD.md (append-only)
SCOPE: Pure conversation state transitions and private choice/revision handling, with injected trusted published options/quotes/receipt; no duplicate journey/price/capacity engine. Extend verified command parsing for conversation input.
TESTS: Synthetic full journey, stale/cross-user input, quote/version/expiry gates, duplicate confirmation, privacy and failed booking.
PRODUCTION_WRITES: none; no export/deploy, live data/session writes, LINE sends, payment handling or main merge.
COST_RISK: No new dependencies or production traffic.
NEXT_ACTION: Implement and test pure state flow; durable integration remains a separate gate.


### LINE conversation review report — PR #187
STATUS: REVIEW (pure flow only; no live integration)
RESULTS: origin/destination/date/trip/pax/name/phone/approved-terms/quote/review/confirmation/receipt transitions; revision-bound opaque choices; private owner check; quote version/expiry gates; paginated LINE Quick Reply rendering with test banner. Existing server remains authoritative; no duplicate journey/price/capacity engine.
TESTS: 50/50 assertions passed in memory from GitHub source (25 webhook + 25 conversation/renderer); real Node/GitHub regression validation pending for final commit. No local filesystem used. No new Emulator/end-to-end or Production proof.
IMPACT: functions/line-booking-conversation.js and tests/line-booking-conversation.test.js added; boundary/tests and migration docs updated. No index.js, runtime settings, Rules, credentials, public menu or dependency changes.
PRODUCTION_WRITES: none; no main merge or deployment.
COST_RISK: CI only, zero new production traffic.
NEXT_ACTION: durable inbox/session/CAS/outbox and trusted published/quote/booking adapters, back/restart/handoff orchestration, source/deployment reconciliation and payment-runtime validation, then Emulator concurrency and full-flow proof. No live booking or customer cutover without separate review/approval.


### LINE durable store step — 2026-11-03
STATUS: REVIEW
OWNER: Codex (current LINE migration chat)
BRANCH: codex/line-chat-booking-foundation-20261102
FILES: functions/line-booking-store.js; tests/line-booking-store.test.js; tests/line-booking-store.emulator.cjs; tests/fixtures/line-chat/firebase.json; tests/fixtures/line-chat/database.rules.json; .github/workflows/line-chat-draft-validation.yml; docs/LINE-CHAT-BOOKING-MIGRATION.md; ai-handoffs/WORK-BOARD.md
SCOPE: Private injected RTDB transaction store; atomic inbox/session/outbox, revision CAS and conservative lease reconciliation. No duplicate transport engine.
TESTS: Duplicates, ownership, revision races, retention, backpressure, fencing and demo-only Emulator with anonymous access denied.
PRODUCTION_WRITES: none; no export/deploy, credentials, LINE sends, booking/payment/Rules/menu changes or main merge.
COST_RISK: GitHub CI/Emulator only; no production resources.
NEXT_ACTION: Implement and verify on demo Emulator before trusted adapter integration.


### LINE durable store review report — 2026-11-03 / PR #187
STATUS: REVIEW (isolated durable draft; no live integration)
CODE_COMMIT: 982f95882a5b6c921f0d9090a6cf9baf3a392508
RESULTS: Injected private passenger RTDB store atomically stages inbox/session/outbox; owner/revision/event-time checks; bounded retention/backpressure; lease/token fencing; expired ambiguous work requires reconciliation; acknowledgement removes private payload. Scoped cache listener retained only through transaction and cleaned up on failure; transaction clock refreshed on retry. No duplicated transport engine.
TESTS: GitHub LINE chat draft validation 41554181929 SUCCESS: 67 unit tests (50 webhook/conversation + 16 store + 1 existing LINE test), guarded demo Emulator duplicate delivery x20 / revision race x20 / worker race x10, persistence, isolated actors, expired claim/stale acknowledgement, private payload cleanup and anonymous read/write denial. Non-demo project startup was refused before Admin initialization. Earlier emulator failures were fixed before this passing run. Existing regression run 41554181722 passed Node tests and is still running remaining Emulator/performance steps at report time.
PRODUCTION_WRITES: none; no main merge, Firebase/Rules deploy, credentials, LINE sends, bookings/payment changes, Rich Menu or webhook changes. All new database writes were synthetic demo-sl-transit-line Emulator on GitHub. No local filesystem used.
COST_RISK: CI only; no new production resources/dependencies/traffic. Workflow contents:read, timeout 15 minutes.
KNOWN_LIMITS: No HTTP processor wiring, trusted identity/published/quote/booking adapter, sender or reconciliation service; session/PII retention cleanup still required. External exactly-once and web/LINE last-seat competition are not proven. Needs deployed/main source reconciliation before shared booking service changes.
NEXT_ACTION: Integrate a disabled processor using injected trusted adapters, prove replay/crash and full conversation in demo Emulator, then reconcile/reuse existing capacity/booking authority. Production pilot and passenger cutover require separate concrete review/approval.


### LINE processor simulation step — 2026-11-03
STATUS: REVIEW
OWNER: Codex (current LINE migration chat)
BRANCH: codex/line-chat-booking-foundation-20261102
FILES: functions/line-booking-processor.js; tests/line-booking-processor.test.js; tests/line-booking-store.emulator.cjs; functions/line-passenger-webhook.js; tests/line-passenger-webhook.test.js; docs/LINE-CHAT-BOOKING-MIGRATION.md; ai-handoffs/WORK-BOARD.md
SCOPE: Disabled-by-default simulation processor joins signed webhook, pure conversation and private RTDB envelope; injected synthetic published/terms/quote/booking services only. Stage confirmation before mock service, persist verified receipt before completion preview, no sender. Separate store/conversation revisions, no automatic rebase of conflicting text, restart-safe button revisions.
TESTS: Signed full conversation through synthetic receipt, duplicate/worker races, stale text/buttons, restart/expiry, adapter failure, crash after synthetic booking and privacy. Existing guarded demo Emulator and GitHub regression.
PRODUCTION_WRITES: none; no HTTP export/deploy, real adapter/credential/LINE send/booking/payment/Rules/menu/webhook changes or main merge.
COST_RISK: CI and synthetic demo Emulator only; no new dependencies.
NEXT_ACTION: Prove simulated orchestration, then reconcile deployed/main booking source before a separately scoped trusted production adapter.


### LINE processor simulation review report — 2026-11-03 / PR #187
STATUS: REVIEW (simulation orchestration; no production adapters)
CODE_COMMIT: 4ddd28e56aef135ea154b2071306a6a3aecbd5fe; documentation update 314ae247d33717cb3a539bdd69c4060c940ede8f
RESULTS: Signed/cohort-filtered webhook joins pure flow and private durable envelope; signed event timestamp retained; separate CAS/button revisions; restart-safe button IDs; RTDB empty-field hydration. Read services run before a single CAS, no rebase of competing text. Confirmation stages submitting/outbox before synthetic service call; validated receipt atomically stages complete/preview before original job acknowledgement. Private preview only; no sender/reply token persisted.
TESTS: GitHub LINE run 41557186779 SUCCESS: 78 unit tests (26 boundary + 25 conversation + 16 store + 10 processor + 1 existing LINE). Guarded demo RTDB passed full signed flow across persisted read/write and recreated processor/store; duplicate confirmation plus 10 workers called synthetic booking once; crash after synthetic commit stayed submitting and did not retry or falsely complete. Existing durability races, actor isolation, stale lease, payload cleanup and anonymous read/write denial also passed. In-memory readback 36/36 boundary/processor tests passed without local filesystem. Existing full regression 41557330259 still running at report time; check latest PR checks before merge.
IMPACT: New processor and tests; boundary now requires safe signed timestamp; demo Emulator flow extended; docs/board updated. No production API/index.js exports, no existing booking/capacity engine, schema or dependency changes.
PRODUCTION_WRITES: none; no merge/deploy/Rules, credentials, LINE sends, actual booking/payment, Rich Menu, webhook or staff notification mutation. All writes synthetic demo-sl-transit-line Emulator on GitHub.
COST_RISK: CI only, no added production reads/resources/dependencies. Bounded payloads/markers/outbox unchanged.
KNOWN_LIMITS: Synthetic service uses an in-memory idempotency fixture; this is not proof of real booking/capacity/payment semantics or durable service recovery. No real identity mapping/published/booking adapter, sender/dispatcher/reconciliation/PII cleanup. Back navigation, real staff handoff and ticket lookup remain unfinished. Conflicting input is rejected, not silently reordered.
NEXT_ACTION: Reconcile deployed/main trusted booking sources, define one reusable identity/capacity/booking boundary and test real contracts against Emulator before wiring any production adapter. User review/approval remains separate for production pilot, LINE sends and cutover.


### Shared booking authority extraction — 2026-11-03
STATUS: IN_PROGRESS
OWNER: Codex (current LINE migration chat)
BRANCH: codex/line-chat-booking-foundation-20261102
FILES: functions/booking-authority-service.js; functions/index.js; tests/booking-authority-service.test.js; tests/line-booking-store.emulator.cjs; docs/LINE-CHAT-BOOKING-MIGRATION.md; ai-handoffs/WORK-BOARD.md
SCOPE: Read-only deployed-source reconciliation completed for createBooking/reserveBookingCapacity/cancelBooking. Extract existing reserve/create business logic into one injected trusted service; existing HTTP endpoints retain authentication/CORS/method/response behavior and call it. No duplicate price/journey/capacity engine; no live LINE adapter.
TESTS: Existing Node/HTTP Emulator/performance regression; focused service contract/auth/policy/price/idempotency tests; guarded demo RTDB shared last-seat/owner/release proof.
SOURCE_EVIDENCE: createbooking-00009-yol 100 percent latest; index.js and booking-time-authority.js exact main after CRLF normalization. reservebookingcapacity-00009-nih 100 percent latest; reserve endpoint and actual auth/path/source-reader/capacity resolver match main, unrelated create helpers differ. cancelbooking-00003-soj 100 percent latest; cancel endpoint/rate-phone-departure/release helpers match main. Whole source bundles differ per function; do not redeploy all functions to reconcile them.
KNOWN_GATES: Existing reserve and create remain separate transactions; create does not prove reservation ownership/binding and client releases on any create error. Live LINE integration requires durable recovery/reservation binding, trusted identity and published source contract before pilot. Extraction alone is not hardening/deploy approval.
PRODUCTION_WRITES: none; no endpoint calls/test requests, deploy, Rules/credentials, booking/payment, notification, menu/webhook changes or main merge. Browser source read/clipboard only; no local filesystem.
COST_RISK: GitHub CI/demo Emulator only; no new dependencies/resources/production traffic.
NEXT_ACTION: Extract and verify shared service, then separately harden trusted confirmation/recovery and connect published/identity contracts before live adapter.

SCOPE_ADDENDUM (same shared authority lock, before edits): tests/booking-capacity-backend.test.js and tests/booking-time-authority.test.js are included to follow extracted business logic while retaining endpoint/auth and authoritative price/time/owner/counter invariants. Add behavioral service tests rather than relying only on source layout assertions. No production changes.
