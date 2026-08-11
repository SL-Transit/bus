# SL-Transit ERP Experimental Sandbox

โครงการย่อยนี้เป็นสำเนาสำหรับทบทวนและทดสอบ Greenfield ERP โดยแยกจากระบบจริง

## ขอบเขตที่รวม

- Admin ERP1 safe-mode ซึ่งไม่มี Runtime backend configuration โดยค่าเริ่มต้น
- Greenfield Phase 2, 4, 5 และ 6A
- Data Contract และ canonical fixtures
- เอกสารสถาปัตยกรรม
- Unit tests และ Emulator integration tests
- Firebase Emulator configuration ที่ใช้ demo project ID เท่านั้น

## สิ่งที่ไม่รวม

- ไฟล์ Excel new erp data.xlsx
- ข้อมูลผู้โดยสาร Booking Payment หรือข้อมูล Production
- Legacy Admin integration ที่เรียก Production Cloud Function
- Root Firebase configuration ของเว็บไซต์จริง
- Deployment workflow หรือคำสั่ง deploy; อนุญาตเฉพาะ workflow ตรวจสอบแบบ read-only
- Production credentials, service accounts และ secrets

## วิธีตรวจแบบไม่เชื่อม Firebase จริง

1. ติดตั้ง dependency ของ Functions

   npm ci --prefix greenfield-erp/phase4/functions --ignore-scripts --no-audit --no-fund

2. รัน Unit tests

   npm test

3. เปิด Emulator เมื่อต้องการทดสอบ Backend

   firebase emulators:start --project demo-sl-transit-erp-sandbox --config firebase.json

Admin ERP1 จะอยู่ในสถานะ Not configured จนกว่าจะกำหนด Emulator transport อย่างชัดเจน จึงไม่มีการเขียนข้อมูลโดยอัตโนมัติ

## กติกา

- ห้ามเพิ่ม Firebase project ID ที่ไม่ขึ้นต้นด้วย demo-
- ห้ามเพิ่ม firebase deploy หรือ workflow สำหรับ deploy
- ห้ามคัดลอก Production credentials
- ห้ามคัดลอก Excel เข้ามาใน Git
- ห้าม Merge เข้าสู่ main จนกว่า Owner จะตรวจและอนุมัติแยก