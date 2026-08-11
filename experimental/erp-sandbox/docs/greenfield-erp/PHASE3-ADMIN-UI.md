# Phase 3 — Greenfield Admin ERP1 Contract Preview

สถานะ: **Draft review only — ห้าม merge/deploy โดยไม่มี Owner approval**

## เป้าหมาย

แทนที่ `admin-erp1.html` เดิมด้วยหน้าควบคุมที่สร้างใหม่ทั้งหมด โดยไม่อ้างอิง Schema, Adapter, SDK, path ฐานข้อมูล หรือ business rule จากระบบเดิม หน้า Phase 3 ใช้ทบทวนรูปแบบงานเท่านั้น และหยุดที่สถานะ Approved

ลำดับงานที่หน้าแสดงคือ:

1. Import Package
2. Draft
3. Validation
4. Review
5. Owner Approval

ไม่มี Publish ใน UI หรือ API command allowlist ของ Phase นี้

## ขอบเขตไฟล์

- `admin-erp1.html` — Greenfield shell และ semantic workflow
- `assets/admin-erp1-greenfield.css` — responsive visual system แยกชุดใหม่
- `admin-erp1-greenfield-state.js` — state machine แบบ pure function
- `admin-erp1-greenfield-api-client.js` — command boundary แบบ injected transport
- `admin-erp1-greenfield-controller.js` — DOM controller และ fail-closed behavior
- `admin-erp1-greenfield-system-mode.js` — ป้าย Contract Preview เฉพาะหน้าใหม่

## ขอบเขตความปลอดภัย

- ไม่มีการโหลด SDK ฐานข้อมูลหรือระบบยืนยันตัวตนในเบราว์เซอร์
- ไม่มีการอ่าน/เขียน production path
- ไม่มี storage ในเบราว์เซอร์สำหรับ Draft
- เลือกไฟล์แล้วเก็บเฉพาะ metadata ใน memory
- จำกัดไฟล์ 25 MB ที่ state machine
- API client ไม่มี transport เริ่มต้นและต้อง fail closed
- คำสั่งที่อนุญาตมีเฉพาะ `import.validate`, `draft.save`, `review.request`, `approval.decide`
- ไม่แก้ rules, functions, Booking หรือ Passenger

## วิธีรีวิว

1. เปิด Files changed ใน Draft PR และยืนยันว่า `admin-erp1.html` โหลดเฉพาะไฟล์ชื่อ `admin-erp1-greenfield-*`
2. ตรวจหน้า Preview จาก artifact/screenshot ของ PR เมื่อมี workflow preview เฉพาะ branch
3. เลือกไฟล์เล็กกว่า 25 MB แล้วกดตรวจสอบ: หน้าต้องรายงานว่า Backend ยังไม่เชื่อม และต้องไม่เกิด network write
4. เลือกไฟล์เกิน 25 MB: ต้องเห็น `file_too_large`
5. ยืนยันว่า Review/Approval ยัง disabled และไม่มี Publish
6. ตรวจ GitHub Actions ให้ผ่านก่อนพิจารณาขั้นต่อไป

## หมายเหตุเรื่อง deployment

workflow เดิมของ repository deploy GitHub Pages อัตโนมัติเมื่อมี push เข้า `main` ดังนั้นการ merge PR นี้ถือเป็นการ deploy หน้าใหม่ด้วย ต้องได้รับการอนุมัติ deployment จาก Owner ก่อนเสมอ