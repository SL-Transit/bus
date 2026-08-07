# SL-Transit Admin ERP Enterprise UX Blueprint

สถานะ: Blueprint สำหรับ Owner review เท่านั้น

เอกสารนี้ใช้แนวคิดจาก operations console แบบ Cloudscape/Carbon ได้แก่ layout ที่สแกนง่าย, ตารางข้อมูลที่มีสถานะชัดเจน, list-detail, progressive disclosure และการยืนยันคำสั่งที่มีผลกระทบสูง โดยใช้ SL-Transit branding และภาษาไทยของระบบเอง

## Information Architecture

การนำทางแบ่งเป็น 4 กลุ่ม:

### ภาพรวม

- แดชบอร์ด
- ปฏิบัติการวันนี้

### งานบริการ

- การจอง
- ตั๋วและคืนเงิน
- แจ้งเตือน

### จัดการข้อมูล

- จัดการข้อมูล ERP
- ข่าวสารและประกาศ

### การดูแลระบบ

- สิทธิ์ผู้ใช้งาน
- ตั้งค่าระบบ

บนมือถือใช้ drawer เดียวกัน และปิด drawer หลังเลือกเมนู

## Design Tokens

```text
font: Kanit for UI, Noto Serif Thai only for editorial announcement headings
space: 4, 8, 12, 16, 20, 24, 32
radius: 6px controls, 8px panels, 10px primary page sections
border: #d9e0e8
surface: #ffffff
canvas: #f5f7fa
ink: #1f2933
muted: #667085
brand: #0d58b5
success: #067647
warning: #a15c07
danger: #b42318
focus: 3px #7cc4ff outline
```

สถานะใช้ทั้งสีและข้อความ: ปกติ, รอตรวจสอบ, ต้องดำเนินการ, ปิดใช้งาน, อ่านข้อมูลไม่ได้

## Shared Page Contract

ทุกหน้าต้องมี:

1. Breadcrumb และชื่อหน้า
2. คำอธิบายสั้นหนึ่งบรรทัด
3. Primary action เดียวที่ชัดเจน
4. Toolbar ค้นหา/กรอง/ช่วงเวลา
5. ตารางหรือ mobile cards
6. แผงรายละเอียดด้านขวาบน desktop และ full-screen detail บน mobile
7. Empty, loading, error และ unavailable state
8. Pagination หรือแสดงจำนวนรายการ
9. Contextual actions ต่อแถว

ข้อมูลไม่มี Contract ให้แสดง `—`; ห้ามแปลง Error เป็นศูนย์

## Blueprint 1: Dashboard

### Purpose

สรุปสถานการณ์ที่ Owner ต้องตัดสินใจภายในหนึ่งหน้าจอ

### Desktop

- Header: `แดชบอร์ด` + วันที่ให้บริการ + ปุ่มรีเฟรช
- KPI row: ผู้เยี่ยมชมเว็บไซต์, ผู้ใช้งานจริง, การจองวันนี้, ผู้โดยสารเดินทางวันนี้
- Operations strip: เที่ยวที่กำลังจะออก, เที่ยวปิด, เที่ยวใกล้เต็ม, งานรอตัดสินใจ
- Main grid: กราฟการจอง/ยกเลิก/คืนเงิน และสรุปยอดจากรายการที่สร้างวันนี้
- Lower grid: รถ/คนขับ/คิวที่ต้องติดตาม, ระบบสุขภาพแบบสั้น, รายการจองล่าสุด
- กด KPI เปิดโมดูลที่เกี่ยวข้องพร้อม filter เดิม

### Mobile

เรียงเป็น KPI cards 2 คอลัมน์, urgent tasks, today operations, charts แบบเลื่อนภายในกรอบ, system health และ latest items โดยไม่มี horizontal page scroll

## Blueprint 2: Operations Today

### Purpose

ควบคุมเที่ยววันนี้และดูปัญหาที่ต้องแก้ก่อนรถออก

### Desktop

- Title: `ปฏิบัติการวันนี้` / `เที่ยวและงานที่ต้องติดตามวันนี้`
- Primary action: `สร้างคำสั่งปิด/เปิดจอง`
- Toolbar: วันที่, เส้นทาง, เวลา, คิว, รถ, คนขับ, สถานะจอง, สถานะปฏิบัติการ
- Table columns: เวลา, เส้นทาง, คิว, รถ, คนขับ, ผู้โดยสาร, ที่นั่งเหลือ, สถานะ, ปัญหา
- Right detail: schedule snapshot, active controls, affected passengers count, history
- Row actions: ดูรายละเอียด, ปิด/เปิดจอง, ทำเครื่องหมายล่าช้า, เปลี่ยนรถ/คนขับ, ตั้งความจุชั่วคราว

### Guided action

scope → effective time → reason → impact review → confirm. Internal note ไม่แสดงแก่ผู้โดยสาร

## Blueprint 3: Bookings

### Desktop list-detail

- Title: `การจอง` / `รายการจองและผลกระทบต่อเที่ยว`
- Primary action: `ส่งออกข้อมูลที่อนุญาต`
- Toolbar: ค้นหารหัสจอง, ช่วงวันที่สร้าง, วันเดินทาง, เส้นทาง, เที่ยว, สถานะ
- List table: รหัสจองแบบปกปิด, วันที่สร้าง, วันเดินทาง, เส้นทาง, เที่ยว, pax, สถานะ, ผลกระทบ
- Detail panel: สถานะ Booking, trip/vehicle/queue, seat impact, cancellation/refund status, history
- ชื่อ/เบอร์โทรค้นหาได้เฉพาะ Owner และแสดงใน detail ที่ได้รับสิทธิ์
- คำสั่งยกเลิก/คืนเงินที่ยังไม่พร้อมแสดงเป็น disabled พร้อมเหตุผลภาษาไทย

### Mobile

ใช้ cards แสดงรหัส, วันเดินทาง, เส้นทาง, pax และสถานะ; แตะเปิด full-screen detail; export และ action อยู่ bottom action bar

## Blueprint 4: Booking Detail

### Sections

- Summary: รหัสจอง, สถานะ, เวลาสร้าง, วันเดินทาง
- Journey: ต้นทาง, ปลายทาง, เที่ยว, เวลา, รถ, คนขับ, คิว
- Passenger impact: จำนวนที่นั่งและผลกระทบต่อเที่ยว โดยไม่เปิด PII เกินสิทธิ์
- Financial status: ยอดที่มี Contract, `—` เมื่อไม่มีข้อมูล
- Timeline: สร้าง, เปลี่ยนสถานะ, ยกเลิก, คืนเงิน, audit reference

### Actions

มีเฉพาะคำสั่งที่ผ่านสิทธิ์และ Backend contract; คำสั่งที่ยังไม่พร้อมอยู่ในตำแหน่งจริงแต่ disabled และมีข้อความ dependency

## Blueprint 5: Close-Booking Workflow

### Step 1: Scope

เลือกทั้งระบบ, กลุ่มบริการ, เส้นทาง, ทิศทาง, เที่ยว, เวลาออก, ป้ายขึ้น, ป้ายปลายทาง, วันบริการ, ช่วงวัน, วันประจำสัปดาห์ หรือช่วงเวลา

### Step 2: Effective time

เลือกเริ่มทันที, เริ่มภายหลัง, สิ้นสุด, หมดอายุ และการเปิดกลับตามกำหนด

### Step 3: Reason

เลือกเหตุผลมาตรฐาน + customer-facing Thai message + internal note แยกกัน

### Step 4: Impact review

แสดงจำนวนเที่ยวและผู้โดยสารเดิมที่ได้รับผลกระทบ; ยืนยันว่าไม่มีการยกเลิกหรือคืนเงินอัตโนมัติ

### Step 5: Confirmation

แสดง before/after, actor, effective time, version และ audit reference; ปุ่มยืนยันใช้คำกริยาชัดเจน เช่น `ยืนยันปิดรับจอง`

## Blueprint 6: ERP Timetable Management

### Desktop

- Title: `ตารางเวลา` / `จัดการเที่ยวและเวลาบริการ`
- Primary action: `นำเข้าไฟล์เพื่อสร้างฉบับร่าง`
- Toolbar: กลุ่มบริการ, เส้นทาง, วันในสัปดาห์, สถานะเผยแพร่, ค้นหาเที่ยว
- Table: route, direction, trip, departure, stops, vehicle/queue, booking state, version
- List-detail: แก้ไข draft ทางขวา, เปรียบเทียบกับ published, validation issues, impact summary
- Flow indicator: Draft → Validate → Review → Publish
- Publish disabled จนกว่า validation, review, Owner permission และ backup gate ผ่าน

### Mobile

Cards ต่อเที่ยว, filter เป็น bottom sheet, detail เต็มจอ, fixed bottom `ตรวจสอบฉบับร่าง`; ห้ามวาง spreadsheet กว้างจนต้องเลื่อนทั้งหน้า

## States and Copy

- Loading: `กำลังโหลดข้อมูล`
- Empty: `ยังไม่มีข้อมูลในช่วงเวลานี้`
- Unavailable: `—` และ `ยังไม่มีแหล่งข้อมูลที่ยืนยันแล้ว`
- Error: `ไม่สามารถโหลดข้อมูลได้` พร้อม `ลองใหม่`
- Disabled action: `กำลังเชื่อมต่อระบบหลังบ้าน ยังไม่สามารถใช้คำสั่งนี้ได้`
- Existing bookings impact: `รายการจองเดิมยังคงอยู่ ไม่มีการยกเลิกหรือคืนเงินอัตโนมัติ`

## Review Checklist

- [ ] Owner ยืนยันกลุ่มเมนูและลำดับความสำคัญ
- [ ] Owner ยืนยัน Dashboard density และ KPI ที่ต้องเห็นใน first viewport
- [ ] Owner ยืนยันรูปแบบ list-detail ของ Bookings
- [ ] Owner ยืนยันคำใน guided close-booking flow
- [ ] Owner ยืนยันตาราง timetable และขั้น Draft/Validate/Review/Publish
- [ ] Owner ยืนยัน mobile cards และ bottom action behavior

ยังไม่มีการแก้ Backend หรือ Deploy จาก Blueprint นี้
