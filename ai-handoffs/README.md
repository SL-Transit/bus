# SL-Transit AI Coordination Board

ไฟล์นี้เป็นจุดเริ่มต้นเดียวสำหรับ AI และผู้พัฒนาทุกชุดที่ทำงานกับ `SL-Transit/bus`.

## ต้องอ่านตามลำดับ

1. `README.md`
2. `SYSTEM-DIRECTION.md`
3. `WORK-BOARD.md`
4. `DECISION-LOG.md`
5. ตรวจ commit ล่าสุดของ `main` และไฟล์จริงที่จะทำงาน

เอกสารเก่าถูกนำออกจาก working tree เพื่อยุติคำสั่งที่ซ้ำหรือขัดกัน ประวัติเดิมยังตรวจสอบได้จาก Git history.

## กติกาบังคับ

- GitHub `main` เป็นแหล่งอ้างอิงโค้ดและสัญญาระบบล่าสุด
- ห้ามแก้ไฟล์ในคอมพิวเตอร์เพื่อส่งงาน งานเปลี่ยนแปลงต้องทำผ่าน branch/commit/PR บน GitHub
- ก่อนเริ่มงานต้องสร้างหรือล็อกรายการใน `WORK-BOARD.md`; ห้ามทำพื้นที่หรือไฟล์เดียวกับงาน `IN_PROGRESS`
- ห้ามสร้าง Schema, Adapter, Importer, Journey Engine หรือหน้าควบคุมซ้ำ
- ห้ามเขียน Production, Firebase Rules, seed, bookings, passenger data, GPS หรือส่ง LINE จริงโดยไม่มี Owner approval แยกเฉพาะงาน
- ใช้ Firebase Emulator และข้อมูลจำลองที่ไม่มีข้อมูลส่วนบุคคลเป็นค่าเริ่มต้นสำหรับการทดสอบ
- ก่อน merge ต้องรายงานไฟล์ที่เปลี่ยน การทดสอบ ผลกระทบ ความเสี่ยง ค่าใช้จ่าย และงานถัดไปใน `WORK-BOARD.md`
- หลัง merge งานเว็บต้องตรวจ GitHub Actions และ GitHub Pages; งาน Firebase ต้องมีหลักฐาน deploy แยกจากหลักฐาน merge

## รูปแบบรายงานสั้น

```text
STATUS: TODO / IN_PROGRESS / REVIEW / DONE / BLOCKED
OWNER:
SCOPE:
FILES:
RESULTS:
TESTS:
IMPACT:
COST_RISK:
PRODUCTION_WRITES: none / approved
NEXT_ACTION:
```

การอ่านหรือวางแผนไม่อนุญาตให้เขียน Production โดยปริยาย การอนุมัติ merge โค้ดไม่เท่ากับการอนุมัติ deploy Firebase.