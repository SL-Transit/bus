# Greenfield ERP Executable Data Contract v1

Phase 1 เปลี่ยน Architecture Contract ให้เป็นสิ่งที่ตรวจด้วยเครื่องได้ โดยยังไม่เชื่อม Firebase

## Files

- `schemas/network-package.schema.json` — JSON Schema ของ Import Package
- `excel-mapping-3.1.5.json` — mapping จากโครงสร้าง Excel โดยไม่มีข้อมูลที่ผู้ใช้กรอก
- `runtime/validate-network-package.js` — semantic validator แบบ dependency-free
- `fixtures/valid-network-package.json` — Fixed + Frequency ตัวอย่างที่ถูกต้อง
- `fixtures/invalid-network-package.json` — ตัวอย่างข้อผิดพลาดแบบ fail-closed
- `tests/greenfield-erp-contract.test.js` — contract tests

## Contract Rules

- Schema version: `greenfield-erp-v1`
- Mapping version: `excel-3.1.5-to-greenfield-erp-v1`
- Stable ID ห้ามใช้ชื่อ อีเมล หรือทะเบียนรถ
- Fixed trip ใช้ stop times
- Frequency service ใช้ service window และ headway
- Fare rule ต้องอ้าง fare product ที่มีจริง
- Transfer ใช้ location-first policy
- Formula-only Excel rows ไม่ถือเป็นข้อมูล
- Invalid references, duplicate IDs และเวลาไม่ต่อเนื่องต้อง fail
- ไม่มี Firebase SDK, credential, project ID หรือ database write

Validator นี้ตรวจ contract และ referential integrity สำหรับ Phase 1 ไม่ใช่ Production importer การ parse XLSX, authorization, RTDB Rules และ publication อยู่ Phase 2+ และต้องขออนุมัติใหม่