# Admin ERP1 UI/UX Handoff Contract

เอกสารนี้เป็นสัญญาการทำงานระหว่าง Owner, Primary AI และ AI สาย UI/UX สำหรับ `SL-Transit/bus`.

## 1. สถานะการอนุญาตปัจจุบัน

```text
CURRENT_GATE: A — DESIGN REVIEW
AUTHORIZED: อ่าน main/Git history, วิเคราะห์หน้าเดิม, ศึกษา ERP UI, ทำ IA, wireframe, mapping, migration plan และ test plan
NOT_AUTHORIZED: แก้ implementation, สร้าง branch โค้ด, commit โค้ด, เปิด PR โค้ด, Deploy Preview/Production, Merge, แก้ Firebase/Rules/Functions/ข้อมูลจริง
```

การอนุมัติ Gate หนึ่งไม่ถือเป็นการอนุมัติ Gate ถัดไป.

## 2. เป้าหมายเดียว

ปรับ `admin-erp1.html` เดิมให้เป็น Admin ERP ที่ทันสมัย ใช้งานง่ายสำหรับมนุษย์ และรองรับข้อมูลกลาง โดยคง entry เดียวและไม่สร้างหน้า Admin คู่ขนาน.

```text
admin.html / admin-console.html -> redirect -> admin-erp1.html เพียงหน้าเดียว
```

## 3. คำสั่งสำหรับ AI สาย UI/UX

```text
คุณคือ AI สาย UI/UX ของ SL-Transit Admin ERP1.

อ่านตามลำดับ:
1. ai-handoffs/README.md
2. ai-handoffs/SYSTEM-DIRECTION.md
3. ai-handoffs/WORK-BOARD.md
4. ai-handoffs/DECISION-LOG.md
5. ai-handoffs/ADMIN-ERP1-UI-HANDOFF.md
6. main ล่าสุดและ Git history ของ admin-erp1.html

ภารกิจ:
- ใช้ admin-erp1.html เดิมเป็น HTML entry เพียงหน้าเดียว
- รักษาฟังก์ชันเดิม: Login/Auth, Dashboard, Operations/Timetable, Booking controls, Finance/Payment, ERP Data Center/Excel, News, Users/Roles, Account, Test/Release และ detail drawer
- ปรับ Information Architecture, navigation, list-detail, forms, import wizard, validation/review states, responsive layout และ accessibility
- รักษา Auth/Data Adapter/Read Model/Excel/System-mode hooks และ script loading contract เดิม
- ใช้ข้อมูลและสถานะจริงจาก contract; ห้ามสร้าง sample/fake business data ที่ผู้ใช้สับสนว่าเป็นข้อมูลจริง
- รายงานการตัดสินใจ ไฟล์ที่แตะ การทดสอบ ผลกระทบ และงานถัดไปในช่องทางที่กำหนด

ข้อห้าม:
- ห้ามสร้าง admin HTML entry ใหม่ หน้า Admin คู่ขนาน หรือ control plane ใหม่
- ห้ามสร้าง Schema, Adapter, Importer, Journey Engine, Backend หรือ Firebase client write ซ้ำ
- ห้ามแก้ contracts/greenfield-erp/** หรือ greenfield-erp/**
- ห้ามแก้ Booking/Passenger consumer, Firebase Rules/Functions/credentials หรือ Production data
- ห้ามให้ UI เขียน RTDB โดยตรง ตัดสินราคา เวลา การต่อรถ หรือ Publish เอง
- ห้ามขยายไฟล์/ขอบเขตนอก lock; ถ้าจำเป็นต้องหยุดและเสนอ Primary AI ใน WORK-BOARD ก่อน
- ห้ามเริ่ม Gate B/C/D/E จนมี Owner approval ระบุชัด
```

## 4. การแบ่งเจ้าของงาน

| พื้นที่ | AI สาย UI/UX | Primary AI | Owner |
| --- | --- | --- | --- |
| IA, navigation, responsive, accessibility | ทำและรายงาน | ตรวจความสอดคล้อง | อนุมัติ |
| `admin-erp1.html`, CSS, UI JS, UI tests | ทำหลัง Gate B | ตรวจ diff/tests/contracts | อนุมัติ Gate B/D |
| Data Contract / Excel Mapping / Validator | ห้ามแก้; เป็น consumer | เจ้าของงาน | อนุมัติการเปลี่ยน contract |
| Draft/Review/Publish backend | ห้ามสร้างซ้ำ | เจ้าของงาน | อนุมัติ mutation/deploy |
| Journey / Fixed-Frequency / Transfer | แสดงผลตาม contract | เจ้าของตรรกะ | อนุมัติ business rules |
| Firebase/Rules/Functions/Production | ห้ามแตะ | Emulator/แผนตาม scope | อนุมัติแยกทุกครั้ง |
| Merge/Deploy/Cutover | ห้ามทำเอง | ตรวจและเสนอ | ตัดสินใจ |

## 5. ขอบเขตไฟล์ UI ที่เสนอหลัง Gate B

อนุญาตได้เฉพาะเมื่อ Owner ผ่าน Gate B:

- `admin-erp1.html` — entry เดิม; รักษา ID/hook ที่ backend integration ใช้อยู่
- `admin-erp-ui.css` — design tokens, shell, component states, responsive และ focus/a11y
- `admin-erp1-ui.js` — JS module ใหม่ได้ แต่ไม่ใช่หน้า Admin ใหม่; รวม router/navigation/view interaction ที่ปัจจุบันเป็น inline
- `tests/admin-erp1-ui-contract.test.js` และ UI smoke/visual tests ที่ระบุในบอร์ด
- test เดิมที่ต้องปรับ selector โดยห้ามลด safety assertion

ห้ามแก้โดย AI สาย UI:

- `admin-erp-data-adapter.js`
- `admin-erp-read-model.js`
- `admin-erp-firebase-config.js`
- `contracts/greenfield-erp/**`
- `greenfield-erp/**`
- Firebase Rules/Functions/config/credentials
- Booking/Passenger/Payment consumer implementation
- `admin.html` และ `admin-console.html` เว้นแต่ Primary AI ยืนยันว่าการ redirect ผิดจริงและ Owner อนุมัติ

## 6. ช่องทางคุยและแหล่งความจริง

1. `ai-handoffs/WORK-BOARD.md` — แหล่งความจริงของ scope, file lock, status, blocker และ next action.
2. `ai-handoffs/ADMIN-ERP1-UI-HANDOFF.md` — ข้อกำหนดถาวรของงาน UI; ห้ามเปลี่ยนเองเพื่อขยายสิทธิ์.
3. Draft PR ของสาย UI — ใช้คุยเรื่อง diff, screenshot, CI และ review thread หลัง Gate B เท่านั้น.
4. Primary AI — อ่านบอร์ดและ PR แล้วตรวจเทียบ contract; สรุปให้ Owner ไม่ให้ AI สาย UIประกาศว่าอนุมัติตัวเอง.
5. Owner — ตัดสินใจ Gate A-E ในบทสนทนาหรือ PR comment ที่อ้างอิงได้.

ห้ามใช้ข้อความคุยนอกบอร์ดเป็นการขยาย scope. เมื่อข้อความขัดกัน ให้หยุดและยึด Owner decision ล่าสุด + Decision Log.

## 7. รูปแบบรายงานที่ AI สาย UI ต้องใช้

รายงานที่จุดเริ่ม, ทุก checkpoint, ก่อนขยาย scope, ก่อนส่ง Review และเมื่อ Blocked:

```text
WORKSTREAM: Admin ERP1 existing-page UI modernization
OWNER: AI สาย UI/UX
GATE: A / B / C / D / E
STATUS: TODO / IN_PROGRESS / REVIEW / BLOCKED / DONE
BASE_SHA:
BRANCH_PR:
FILES_LOCKED:
FILES_CHANGED:
DECISIONS_APPLIED: D-001, D-004, D-006, D-010, D-015
RESULTS:
TESTS:
SCREENSHOTS: desktop / tablet / mobile
AUTH_DATA_HOOKS_PRESERVED:
DIRECT_FIREBASE_WRITES: none
PRODUCTION_IMPACT: none
COST_IMPACT:
KNOWN_RISKS:
BLOCKERS_OR_QUESTIONS:
NEXT_ACTION:
OWNER_APPROVAL_REQUIRED:
```

## 8. จุดตรวจที่ Primary AI ใช้รับงาน

Primary AI ต้องตรวจเอง ไม่รับเพียงคำกล่าวว่าเสร็จ:

1. ตรวจ base SHA, changed filenames และ file lock ว่าไม่มีไฟล์นอก scope.
2. ตรวจว่า `admin-erp1.html` เป็น Admin entry เดียวและไม่มี HTML control plane ใหม่.
3. เปรียบเทียบ Auth/Data/Excel/System-mode hooks ก่อน–หลัง.
4. ตรวจว่า UI ไม่มี `firebase.database()`, `.ref()` หรือ Production mutation path ใหม่.
5. ตรวจ single-entry, baseline regression, import mapping, blocker gates, Thai UTF-8 และ no replacement characters.
6. ตรวจ keyboard/focus/landmark/label และหน้าจอ 360, 768, 1440 px; ห้าม page horizontal scroll.
7. ตรวจ loading, empty, error, unavailable, read-only, unsaved และ dangerous-action states.
8. ตรวจ Preview ด้วยข้อมูลจำลอง/ไฟล์ที่ Owner อนุมัติ; ห้าม Draft/Publish/Production โดยปริยาย.
9. สรุป pass/fail, residual risk และ approval ที่ต้องขอ Owner ก่อนเลื่อน Gate.

หากข้อใดไม่ผ่าน Primary AI ต้องส่งกลับ AI สาย UI พร้อมหลักฐานไฟล์/บรรทัด/test ไม่แก้เงียบแทนกัน.

## 9. Approval Gates

| Gate | ผลลัพธ์ | สิทธิ์หลังผ่าน |
| --- | --- | --- |
| A — Design | IA, wireframe, function mapping, migration/test plan | ขอเปิด branch implementation ได้ แต่ยังไม่ Deploy |
| B — Implementation | Refactor แบบรักษาพฤติกรรม + Shell/Dashboard/Data Center ตาม scope | ขอ Preview ได้ |
| C — Preview | CI ผ่าน + desktop/tablet/mobile screenshots + Owner review | ขอ Merge ได้ |
| D — Merge | Owner อนุมัติ PR/commit ที่ระบุ | Merge เท่านั้น ไม่เท่ากับ Firebase deploy |
| E — Deploy/Cutover | แผน rollback/cost/security และ Owner approval แยก | ทำเฉพาะ deploy/cutover ที่ระบุ |

## 10. แผนส่งงานแบบลดความเสี่ยง

1. Gate A: ออกแบบและตอบคำถาม Owner — ไม่มีโค้ด.
2. Gate B1: Refactor `admin-erp1.html` โดยไม่เปลี่ยนพฤติกรรม; ย้าย CSS/JS อย่างรักษา hook และ baseline tests.
3. Gate B2: ปรับ Shell + Dashboard + ERP Data Center/Import ก่อน.
4. Gate B3: ย้าย Operations/Booking/Finance/News/Users/Test ทีละ work area; ห้ามรวมทุกอย่างเป็น diff ที่ตรวจไม่ได้.
5. Gate C: Deploy เฉพาะ expiring Preview ที่ Owner อนุมัติ; ไม่มี RTDB/Rules/Functions/Live Hosting.
6. Gate D/E: Owner อนุมัติแยก.

## 11. Stop Conditions

AI สาย UI ต้องหยุดและรายงาน `BLOCKED` เมื่อ:

- main หรือไฟล์ lock เปลี่ยนหลังเริ่มงาน
- ต้องแก้ไฟล์ Backend/Data Contract/Firebase เพื่อให้ UI เดินต่อ
- test safety/auth/import/publish isolation ล้ม
- พบข้อมูลส่วนบุคคล/credential/Production path
- ต้องเปลี่ยน business rule ราคา เวลา Frequency/Transfer หรือสิทธิ์
- Owner direction ไม่ชัดหรือขัดกับ Decision Log
- มี AI อื่นถือ lock ไฟล์เดียวกัน

## 12. คำถาม Gate A ที่รอ Owner

1. อนุมัติเมนู 4 กลุ่ม: ภาพรวม / งานบริการ / ข้อมูลกลาง / ดูแลระบบ และย้ายบัญชี/ออกจากระบบไปเมนูโปรไฟล์หรือไม่?
2. รอบแรกทำ Shell + Dashboard + ERP Data Center/Import ก่อน หรือทำทุกโมดูลพร้อมกัน? คำแนะนำคือทำแกนหลักก่อน.
3. อนุมัติแยก “ศูนย์ทดสอบ” ออกจาก “เวอร์ชันเผยแพร่” เพื่อลดโอกาสกดผิดหรือไม่?