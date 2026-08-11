# Greenfield Phase 5 — Published Read Model and Network Journey

สถานะ: **Emulator-only review slice**

ชุดนี้สร้าง Published Read Model แบบ immutable, เขียนข้อมูลเป็น chunk ก่อนสลับ current pointer แบบ atomic ขนาดเล็ก และสร้าง Journey Engine ที่รองรับ Fixed Schedule กับ Frequency/Queue โดยใช้เวลารอคาดหมาย `headwaySeconds / 2`.

## ขอบเขตสำคัญ

- Stage version, ตรวจ checksum ทุก chunk และเปลี่ยน manifest เป็น `ready` ก่อน Publish
- Atomic switch มีเพียง current pointer, publication history และ audit event
- Rollback คือสลับ pointer กลับ version ที่ `ready`; ไม่แก้เนื้อหา version เก่า
- Journey ข้ามบริษัทได้เมื่อมี transfer rule ที่ป้ายกลาง/Hub
- Cache อยู่ใน module scope, ผูก `versionId`, โหลดซ้ำเมื่อ pointer เปลี่ยน และมี last-known-good TTL
- Frequency ต้องมีเวลาเดินทางรายช่วงใน `routingSupplements.segmentTravelSecondsByPatternId`; ถ้าไม่มีจะหยุด Publication และไม่เดาค่า

## ข้อจำกัด

- ยังไม่ใช่ RAPTOR เต็มรูปแบบ; เป็น time-dependent earliest-arrival core สำหรับพิสูจน์ contract
- ยังไม่เชื่อม HTTP endpoint, Cloud Function trigger หรือ Admin ERP1
- ยังไม่เปิด Browser read และไม่ย้าย Booking/Passenger/Map
- ไม่มี Firebase deploy, Production credentials, Rules publication หรือข้อมูลจริง

## การตรวจ

- Unit tests: `node --test tests/greenfield-erp-phase5.test.js`
- RTDB Emulator: ใช้ `firebase.demo.json` กับ `tests/greenfield-erp-phase5-emulator.integration.js`
- CI เป็นผู้รันทดสอบบน GitHub; การ Merge/Deploy ต้องขอ Owner approval แยก