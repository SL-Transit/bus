# Architecture — โครงสร้างระบบ

## ภาพรวม

```text
หน้าจอผู้ใช้
  → ตัวเชื่อมข้อมูลกลาง
  → ศูนย์ตรรกะ/คำนวณ/ข้อมูล
  → Cloud Functions และ Firebase
  → การแจ้งเตือนและระบบปฏิบัติการ
```

## ชั้นระบบ

### หน้าจอ

- `booking1.html` และ `booking1-preview-adapter.js`: รับข้อมูลผู้โดยสารและแสดงเที่ยวที่มาจากข้อมูลกลาง
- `booking-bridge.js`, `booking-pos.js`: เชื่อมการจอง การสำรองที่นั่ง และการส่งข้อมูลไปเซิร์ฟเวอร์
- `passenger.html`, `check_ticket.html`, `cancel_ticket.html`: อ่านข้อมูลการเดินทาง ตั๋ว และดำเนินการที่ได้รับอนุญาต
- `admin-erp.html`, `admin-erp1.html`: ศูนย์หลังบ้านและงานแบบร่าง/ตรวจสอบ/เผยแพร่
- แอปคนขับใน `driver-android/`: ยืนยันตัวตนตามรถ งานประจำวัน ตำแหน่ง และคำสั่งรถ

### ศูนย์กลางฝั่งหน้าเว็บ

- `erp-data-adapter.js`, `erp-schema.js`: อ่านและตรวจรูปแบบข้อมูล ERP
- `erp-calculator-center.js`, `fare-decision-center.js`: คำนวณตามข้อมูลที่ยืนยันแล้ว
- `booking-assignment-center.js`, `vehicle-assignment-center.js`: สัญญาการมอบหมายเที่ยวให้รถ
- `booking-capacity.js`: สัญญาการสำรองและคืนจำนวนที่นั่ง
- `ticket-data-center.js`, `ticket-action-center.js`: ขอบเขตอ่านและแก้ไขตั๋ว

### ฝั่งเซิร์ฟเวอร์

- `functions/index.js`: จุดรับคำขอ Cloud Functions, ตรวจสิทธิ์, คำนวณฝั่งเซิร์ฟเวอร์, งานแจ้งเตือน และงานรถ
- `functions/staff-notification-center.js`: เลือกผู้รับแจ้งเตือนจากรายการกลาง
- `functions/notification-center.js`: ป้องกันงานซ้ำและควบคุมการส่งซ้ำ
- `functions/driver-ticket-center.js` และ `functions/driver-work-auto-center.js`: งานคนขับและการเติมข้อมูลมอบหมายจากข้อมูลกลาง

## แหล่งข้อมูลหลัก

- `data/erpDataCenter`: แคตตาล็อก จุดจอด เส้นทาง ราคา ตารางเวลา รถ คิว สิทธิ์ และการตั้งค่า
- `publishedSchedule`: ตารางที่เผยแพร่สำหรับการอ่านของผู้ใช้
- `bookings`: รายการจองที่สร้างผ่านเซิร์ฟเวอร์
- `operations`: จำนวนที่นั่ง งานคนขับ ตำแหน่ง งานแจ้งเตือน และเหตุการณ์ปฏิบัติการ
- `data/notificationCenter/staffLineTargets`: ผู้รับแจ้งเตือนส่วนกลาง โดยคนขับอยู่ใต้ `driversByVehicleId/{vehicleId}`

## หลักแยกส่วน

- ตารางเวลา บอกว่าเที่ยวไหนออกเมื่อไร ไม่ใช่เจ้าของรหัสไลน์คนขับ
- รถเป็นตัวเชื่อมระหว่างเที่ยวที่ได้รับมอบหมายกับโทรศัพท์ของคนขับ
- ผู้ดูแลและคนขับอาจใช้รหัสไลน์เดียวกันได้ แต่ต้องสร้างงานแยกตามบทบาท
- หน้าจอแสดงผลต้องไม่กลายเป็นแหล่งตัดสินใจทางธุรกิจ
