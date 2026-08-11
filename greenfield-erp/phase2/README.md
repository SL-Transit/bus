# Phase 2 — Emulator-only Import and Draft

โค้ดนี้เป็น Greenfield namespace ที่อยู่นอก `functions/` จึงไม่ถูก Firebase Functions deployment ปัจจุบันรวมไปโดยอัตโนมัติ

## Scope

- Guard บังคับ Firebase demo project และ RTDB Emulator
- แปลงแถวตารางตาม mapping Phase 1
- Validate normalized Network Package
- สร้าง Draft แบบ idempotent
- เขียน Draft entities เป็น chunk ผ่าน injected database adapter
- Rules proposal แบบ deny-by-default

## Hard Stops

- Project ID ต้องขึ้นต้น `demo-`
- ต้องมี `FIREBASE_DATABASE_EMULATOR_HOST` และห้ามมี protocol
- ไม่มี `initializeApp`, credential, deploy หรือ production project ID
- ห้ามแก้ `firebase.json` และ `database.rules.json` ใน Phase 2
- Invalid package และ package เกินขนาดต้องไม่เกิด write
- Formula-only Excel rows ถูกละเว้น
- Browser ไม่มีสิทธิ์เขียน ERP namespace

## Status

เป็น prototype สำหรับ contract/emulator tests เท่านั้น ไม่ใช่ Production importer และยังไม่เชื่อม `admin-erp1.html`