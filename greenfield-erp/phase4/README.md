# Greenfield ERP Phase 4 — Command Gateway

สถานะ: **Emulator only / Draft review / ห้าม deploy**

Phase 4 เพิ่ม HTTPS Command Gateway สำหรับ Cloud Functions v2 และเชื่อมคำสั่ง `import.validate` เข้ากับ Phase 2 Draft Service โดยตรง โค้ด entry point จะหยุดทันทีถ้า project ID ไม่ขึ้นต้นด้วย `demo-` หรือไม่มี Database Emulator host

## Request contract

`POST` พร้อม Bearer ID token และ JSON:

```json
{
  "requestId": "REQ-20260811-0001",
  "command": "import.validate",
  "payload": { "package": {} }
}
```

Custom Claim อ่านเฉพาะ `role` ส่วนรายละเอียดสิทธิ์อ่านแบบ bounded read ที่:

`data/erpDataCenter/access/accounts/{uid}`

ตัวอย่างบัญชี Emulator:

```json
{
  "active": true,
  "allowedCommands": ["import.validate"],
  "resourceScopes": { "operatorIds": ["OPR-BUS01"] }
}
```

## ขอบเขตที่ทำแล้ว

- ตรวจ Bearer token ผ่าน Auth Emulator
- coarse role: `admin` หรือ `operations`
- fine permission และ operator scope จาก RTDB Emulator
- จำกัด request 26 MB และ 20 ครั้งต่อนาทีต่อ instance
- CORS allowlist เฉพาะ origin ที่กำหนด
- `import.validate` ใช้ Phase 2 validation/idempotent Draft write
- Function options ล็อก `minInstances: 0`, `maxInstances: 3`, `concurrency: 10`

คำสั่ง `draft.save`, `review.request`, `approval.decide` สงวนชื่อไว้ใน contract แต่ตอบ `command_not_implemented_phase4` เพื่อไม่สร้าง workflow transition ที่ยังไม่ได้อนุมัติรายละเอียด

## Excel mapping

พบไฟล์ต้นทาง `new erp data.xlsx` แล้ว แต่การอ่าน workbook ยัง pending เพราะ spreadsheet runtime ที่กำหนดไม่มีใน session นี้ จึงยังไม่มีข้อมูลจาก Excel ถูกคัดลอกหรือ commit เข้า repository

## ห้ามทำใน Phase นี้

- ห้าม deploy Function
- ห้ามใช้ Production project/credential
- ห้าม Publish หรือสลับ Published pointer
- ห้าม browser เขียน RTDB โดยตรง
- ห้ามเพิ่มสิทธิ์ละเอียดลง Custom Claims