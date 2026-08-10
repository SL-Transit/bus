# SL-Transit Greenfield ERP

เอกสารชุดนี้กำหนดระบบ Transport ERP ใหม่ทั้งหมด โดยไม่ใช้ Schema, Adapter, Firebase path, workflow หรือกฎธุรกิจจากระบบเดิม

สิ่งที่เก็บไว้มีเพียง repository SL-Transit/bus, ชื่อจุดเข้า `admin-erp1.html` และการเลือก Firebase เป็นโครงสร้างพื้นฐานหลังบ้าน ชื่อไฟล์ที่เก็บไว้ไม่ได้อนุญาตให้นำโมดูลเดิมกลับมาใช้โดยปริยาย

## สถานะอนุมัติ

Owner อนุมัติให้สร้างเอกสารโครงสร้างเท่านั้น ยังไม่อนุมัติให้แก้ runtime, หน้าเว็บ, Firebase Rules, Deploy, Seed, เขียนฐานข้อมูล หรือ Publish ข้อมูลจริง ทุกขั้นต้องขออนุมัติใหม่ผ่าน PR แยก

## เอกสาร

1. [ARCHITECTURE.md](ARCHITECTURE.md) — ส่วนประกอบและหน้าที่ Firebase
2. [DATA-CONTRACT.md](DATA-CONTRACT.md) — Entity และ Fixed/Frequency model
3. [FIREBASE-BOUNDARIES.md](FIREBASE-BOUNDARIES.md) — ตำแหน่งข้อมูลและสิทธิ์
4. [PUBLISHING-FLOW.md](PUBLISHING-FLOW.md) — Draft, Publish และ Rollback
5. [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) — ลำดับพัฒนาและ Approval Gate

## หลักบังคับ

- Excel เป็นข้อมูลต้นทาง ไม่ใช่ฐานข้อมูลหน้า Passenger
- Admin แก้ Draft เท่านั้น ห้ามแก้ Published Version
- Consumer ทุกหน้าอ่าน Published Version เดียวกัน
- Published Version เป็น immutable และย้อนกลับได้
- Publish ใช้ Two-Phase Write และสลับ Pointer ขนาดเล็ก
- Fixed Schedule และ Frequency/Queue ใช้ Network เดียวกันแต่คนละ data model
- Authentication ยืนยันตัวบุคคล; สิทธิ์ละเอียดอยู่ในฐานข้อมูล
- Browser ไม่มีสิทธิ์เขียน authoring, publication, access หรือ audit โดยตรง
- Emulator-first และ Production deny-by-default

## เอกสาร Firebase ทางการ

- [RTDB limits](https://firebase.google.com/docs/database/usage/limits)
- [Atomic multi-location update](https://firebase.google.com/docs/database/web/read-and-write#update_specific_fields)
- [RTDB Security Rules](https://firebase.google.com/docs/database/security/core-syntax)
- [Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Cloud Functions tips](https://firebase.google.com/docs/functions/tips)
- [Cloud Functions cost controls](https://firebase.google.com/docs/functions/manage-functions)
- [RTDB Emulator](https://firebase.google.com/docs/emulator-suite/connect_rtdb)