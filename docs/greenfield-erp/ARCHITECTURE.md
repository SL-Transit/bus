# Greenfield ERP Architecture

## เป้าหมาย

สร้างศูนย์ข้อมูลขนส่งหลายบริษัทแบบเครือข่ายสนามบิน แต่ละบริษัทมีบริการ เวลา ราคา และทรัพยากรของตนเอง โดยใช้สถานี ป้าย และ Hub กลางเชื่อมการเดินทางข้ามบริษัท

## Data Flow

    Excel / Manual Entry
            |
            v
    Admin ERP1 (browser shell)
            |
            v
    ERP Command API
            |
            +-- Import Package / Draft
            +-- Validation / Difference Report
            +-- Review / Owner Approval
            |
            v
    Publication Builder -- chunked --> Immutable Version
            |
            v
    Atomic Current Pointer Switch
            |
            +-- Passenger / Booking
            +-- Map / Reports
            +-- Network Journey Service

## ส่วนประกอบ

### Admin ERP1

`admin-erp1.html` เป็นชื่อ Backoffice หลักที่เก็บไว้ แต่ implementation ต้องสร้างใหม่ตาม contract นี้ หน้าจอทำ Import, Draft edit, validation, diff, review และ approval ผ่าน Backend API เท่านั้น ห้ามเขียน privileged RTDB path โดยตรง

### ERP Command API

ตรวจ ID token, coarse role, fine-grained scope, idempotency key, payload/rate limit และ audit ก่อนเขียน Draft หรือเรียก publication ข้อมูลผิดต้องถูกปฏิเสธ ห้าม browser เป็นผู้ตัดสินขั้นสุดท้าย

### Import and Validation

แปลง Excel เป็น Import Package ที่มี version แล้วตรวจ type, required fields, Stable ID, foreign keys, operator scope, stop sequence, time, fare, Fixed/Frequency และ transfer ข้อมูลไม่ครบต้องเป็น validation error ห้ามเดาค่าจริง

### Authoring Store

เก็บ Import Package, Draft, validation, review และ approval เป็นพื้นที่ทำงานที่ Passenger/Booking อ่านไม่ได้

### Publication Builder

สร้าง immutable Read Model version ด้วย chunk, manifest, count และ checksum ตรวจครบก่อนเปลี่ยนเป็น ready แล้วสลับ Current Pointer ด้วย atomic update ขนาดเล็ก

### Published Read Model

เป็นข้อมูลเดียวที่ Passenger, Booking, Map, Reports และ Journey Service ใช้ โครงสร้างต้องออกแบบตาม query และมี index ที่ประกาศไว้

### Network Journey Service

- Fixed ใช้ trip/stop time จริง
- Frequency/Queue ใช้ service window และ headway
- ค่าเริ่มต้นเวลารอคาดหมายคือ headwaySeconds / 2
- Transfer ใช้ Network Location/Hub และ policy กลาง
- Cache ผูกกับ versionId และ reload ได้เองเมื่อ miss/stale

Global cache เป็น optimization เท่านั้น เพราะ Function instance ไม่มีการรับประกันว่าจะอยู่ต่อหรือได้รับ invalidate event ทุกตัว

## Firebase มีหน้าที่อะไร

| Product | หน้าที่ |
|---|---|
| Authentication | ยืนยันบุคคลและ coarse role |
| Realtime Database | Draft metadata, authoring state, access, audit, pointer และ published versions |
| Cloud Functions | Command API, validation, authorization, publication และ journey endpoint |
| Cloud Storage | Excel, รูป และเอกสารขนาดใหญ่ |
| Hosting | ส่งหน้าเว็บ static |

Firebase ไม่ใช่ routing engine และ RTDB ไม่ใช่ที่เก็บ binary หรือที่ให้ browser คำนวณราคา/Publish เอง

## Cost Guardrails

- ห้ามอ่าน database root หรือ version root ใน browser
- ทุก list query มีขอบเขต pagination และ index
- Internal publish chunk ไม่เกิน 5 MB และ 5,000 leaf paths
- เริ่ม Function ด้วย minInstances เท่ากับ 0
- กำหนด maxInstances, concurrency, timeout, memory และ rate limit
- งาน retry ต้อง idempotent
- Cache ใช้ version key, TTL และ self-healing reload
- ทดสอบด้วย Firebase demo project ใน Emulator
- Production project ID/credential ห้ามเป็นค่า default ใน local หรือ CI