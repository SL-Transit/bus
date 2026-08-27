# Admin ERP Duplicate Work Audit

สถานะ: RESOLVED_ACTIVE_SOURCE_ADMIN_ERP1

ตรวจทบทวนจาก `main`, ประวัติ Pull Request และหน้าใช้งานจริงแล้ว

## ผลการตัดสินแหล่งหลัก

- หน้าหลักที่ใช้งานจริงคือ `admin-erp1.html`
- `admin.html` และ `admin-console.html` เป็นเพียงทางเข้าที่ส่งต่อมายัง `admin-erp1.html`
- `admin-erp.html` เป็นหน้ารุ่นเดิมที่คงไว้เพื่อความเข้ากันได้ และไม่ใช่ทางเข้าหลัก
- `admin-erp-preview.html` เป็นหน้าพรีวิวแยก ไม่ใช่แหล่งข้อมูลหรือหน้าจัดการจริง
- การอ่านข้อมูลของหน้าหลักต้องผ่าน `AdminErpDataSource` เท่านั้น

## ผลตรวจงานซ้ำ

- PR #76 ถูกปิด เพราะเนื้อหา Preview เดียวกันอยู่ใน `main` แล้วใน commit `322f813`
- PR #107 ถูกปิด เพราะซ้ำกับ PR #108 ที่รวมเข้า `main` แล้ว
- PR #87 และ PR #90 ถูกปิดไว้ก่อนหน้าและมีงานที่ถูกแทนที่ด้วย PR ที่รวมสำเร็จแล้ว
- ไม่พบเหตุผลให้สร้าง Adapter ใหม่เพิ่มอีก ตัวที่ใช้งานสำหรับหน้าหลักคือ `admin-erp-data-adapter.js`
- `erp-data-adapter.js` เป็น Adapter กลางของส่วนอื่น จึงไม่รวมเข้ากับ Adapter ของ Admin ERP ในรอบนี้
- `admin-erp1-network-integration.js` ถูกถอดออกจากหน้าใช้งานจริงแล้ว เพราะเป็นแผงตารางซ้ำที่อ่าน `/publishedSchedule` และมีปุ่มเผยแพร่แยกจากสัญญา `data/erpDataCenter` ของ Admin ERP

การตรวจนี้ไม่ลบไฟล์รุ่นเก่าหรือไฟล์พรีวิว เพราะอาจมีลิงก์หรือการตรวจย้อนหลังใช้งานอยู่ แต่ได้กำหนดหน้าหลักและขอบเขตการใช้งานให้ชัดเจนแล้ว

## สรุปภาษาคน

มีหน้าจัดการ ERP อยู่ 3 ชุด และมีตัวกลางข้อมูล 2 ชุด หน้าที่บางส่วนทับกัน แต่ไม่ได้เป็นโค้ดเดียวกันทั้งหมด

| ส่วน | หน้าที่ปัจจุบัน | ปัญหาที่พบ | ขอบเขตที่ควรรับผิดชอบ |
|---|---|---|---|
| `admin-erp.html` | หน้าหลักที่ `admin.html` และ `admin-console.html` ส่งต่อไป | อ่าน Firebase ตรงบางส่วน, เรียก endpoint เอง, มี mapping และ workflow ของตัวเอง | เป็นหน้าหลักเดิม; ห้ามเพิ่มระบบใหม่จน Owner เลือกว่าจะใช้ต่อหรือย้ายไป `admin-erp1.html` |
| `admin-erp1.html` | หน้าชุดใหม่สำหรับศูนย์ข้อมูล ERP | ยังไม่ใช่หน้าที่ redirect จากระบบหลัก | รับเฉพาะ integration layer, read model และ draft adapter |
| `admin-erp-preview.html` | พรีวิวและรายงานความพร้อม | มีโค้ดอ่านข้อมูลและ endpoint ซ้ำเพื่อการจำลอง | ใช้ตรวจสอบเท่านั้น; ห้ามใช้เป็น production source |
| `erp-data-adapter.js` | ตัวกลางข้อมูลหลักที่ใช้ร่วมกับส่วนอื่นของระบบ | ใช้ Firebase Database โดยตรงและมีหน้าที่กว้างกว่าหน้า Admin | เป็น backbone กลาง; ไม่ควรแก้จากงาน Admin ERP นี้ |
| `admin-erp-data-adapter.js` | ตัวกลางเฉพาะหน้า `admin-erp1.html` | เป็นตัวใหม่ที่ทำหน้าที่ใกล้กับ adapter เดิมบางส่วน | ใช้เป็น Admin read adapter หาก Owner เลือก `admin-erp1.html` เป็นหน้าหลัก |
| `functions/index.js` | จุดรับข้อมูลหลังบ้าน | มี read endpoint เดียว แต่ update endpoint เดิมยังเป็นร่องรอย workflow เก่า | เป็น backend gate กลาง; ต้องผ่าน Draft/Review/Publish ก่อนเปิดเขียน |
| `database.rules.json` | กฎฐานข้อมูล | บาง path เปิดอ่านสาธารณะ | เจ้าของ Rules ต้องตัดสินใจแยกต่างหาก; งานนี้ไม่แก้เอง |

## จุดที่ซ้ำหรือขัดกันชัดเจน

1. **หน้าหลักซ้ำกัน**

   `admin.html` และ `admin-console.html` redirect ไป `admin-erp.html` แต่ `admin-erp1.html` ไม่ได้อยู่ในเส้นทางหลัก จึงมีความเสี่ยงว่าคนพัฒนาจะเชื่อมหน้าหนึ่ง แต่ผู้ใช้งานจริงเปิดอีกหน้า

2. **การอ่าน ERP ซ้ำกัน**

   `admin-erp.html` และ `admin-erp-preview.html` ต่างก็มีการอ่านข้อมูล ERP และเรียก `readAdminErpDataCenter` ของตัวเอง ส่วน `admin-erp1.html` ใช้ `AdminErpDataSource` แยกอีกชุดหนึ่ง

3. **การอ่าน Firebase โดยตรงกับผ่านหลังบ้านอยู่พร้อมกัน**

   `admin-erp.html` และ `admin-erp-preview.html` ยังมี `firebase.database()` และ `.ref()` ขณะที่ `admin-erp1.html` ใช้ endpoint กลาง จุดนี้ทำให้แนวทางความปลอดภัยไม่เหมือนกัน

4. **ตัวกลางข้อมูลชื่อและขอบเขตซ้ำกัน**

   `erp-data-adapter.js` เป็นตัวกลางร่วมของระบบ ส่วน `admin-erp-data-adapter.js` เป็นตัวกลางเฉพาะ Admin แต่ชื่อและหน้าที่ใกล้กัน หากไม่ประกาศเจ้าของให้ชัด อาจถูกแก้ซ้ำหรือเรียกผิดตัว

5. **ชื่อ path ไม่ตรงกัน**

   `admin-erp.html` ใช้ `data/erpDataCenter/scheduleOffers` ใน mapping เดิม ขณะที่ contract ใหม่ยึด `workbookSource/scheduleRows` และ canonical `trips`/`stopTimes`

6. **การเขียนข้อมูลมี workflow สองแบบ**

   `admin-erp.html` ยังมีโค้ดเรียก `updateAdminErpDataCenter` ขณะที่ `admin-erp-data-adapter.js` ปิดการเขียน Production และบังคับ local draft การมีสองแนวทางพร้อมกันเสี่ยงให้ผู้ใช้เข้าใจว่ากดบันทึกแล้วข้อมูลจริงเปลี่ยนทันที

7. **ข้อมูลส่วนตัวใน mapping เดิม**

   `admin-erp.html` มีช่องเบอร์โทร ชื่อผู้ขับ และเบอร์ผู้ขับในตารางรถ รวมถึงข้อมูลบัญชี/ผู้ติดต่อชำระเงิน แต่ adapter ใหม่ตัดข้อมูลส่วนตัวออกจนกว่าจะมี field allowlist ที่ Owner อนุมัติ

8. **เอกสารบางชุดยังพูดถึงสถานะเดิม**

   `FIREBASE-ERP-INTEGRATION-READINESS.md` ระบุว่า `admin-erp1.html` ยังไม่โหลด Firebase แต่ตอนนี้มี Firebase Auth สำหรับขอ ID token แล้ว เอกสารนี้ต้องอัปเดตหลัง Owner เลือกหน้าหลัก

## การแบ่งงานที่เสนอ

### งานของชุด `admin-erp1.html`

- อ่านข้อมูลผ่าน `AdminErpDataSource` เท่านั้น
- ใช้ Firebase Auth เพื่อขอ ID token เท่านั้น
- แสดงข้อมูลแบบอ่านอย่างเดียวในระยะแรก
- ใช้ canonical paths จาก contract
- สร้างและตรวจ local draft
- ห้ามเรียก Firebase Database โดยตรง

### งานของชุด `admin-erp.html`

- ถือเป็นหน้าหลักเดิมจนกว่า Owner จะเปลี่ยนคำสั่ง
- ห้ามเพิ่ม mapping หรือ endpoint ใหม่ในระหว่างการตัดสินใจ
- หากเลือกให้เป็นหน้าหลัก ต้องย้ายมาใช้ adapter กลางเดียวกับ `admin-erp1.html`
- ต้องเลิกอ่าน Firebase ตรงและเลิกใช้ `scheduleOffers`

### งานของ `admin-erp-preview.html`

- ใช้ทำพรีวิว รายงาน และตรวจ workflow เท่านั้น
- ห้ามเป็นแหล่งข้อมูลหลัก
- ห้ามใช้เป็นหน้าจัดการจริง

### งานของ `erp-data-adapter.js`

- เป็นตัวกลางหลักของส่วนอื่นของระบบ
- ไม่แก้จากงาน Admin ERP รอบนี้
- ไม่ควรนำมาให้หน้า Admin ใช้แทน endpoint จนกว่าจะมีการอนุมัติขอบเขตใหม่

### งานของ `admin-erp-data-adapter.js`

- เป็น adapter กลางของหน้า Admin รุ่นใหม่
- รับผิดชอบการอ่านข้อมูล, สถานะ loading/empty/partial/stale/error/forbidden และ local draft
- ห้ามเขียน Production จนกว่าจะมี workflow หลังบ้านที่อนุมัติ

### งานของ `functions/index.js`

- ตรวจ Firebase ID token
- ตรวจ `adminAccounts/{uid}` จากฝั่ง backend
- แยกสิทธิ์ read/edit/review/publish/rollback
- ส่งเฉพาะข้อมูลตามขอบเขตบทบาท
- ปิด direct canonical update จนกว่าจะมี Draft → Review → Owner approval → Publish

## การตัดสินใจที่ต้องการจาก Owner

เลือกเพียงหนึ่งข้อ:

- **ทางเลือก A:** ใช้ `admin-erp.html` เป็นหน้าหลัก แล้วนำ adapter กลางไปเชื่อมหน้านี้
- **ทางเลือก B:** ใช้ `admin-erp1.html` เป็นหน้าหลัก แล้วค่อยเปลี่ยน redirect และ workflow ให้ชี้มาที่หน้านี้

จนกว่าจะเลือกได้ ห้ามทำ integration ซ้ำในทั้งสองหน้า เพราะจะทำให้เกิดข้อมูลและ workflow สองชุด

## งานที่ทำต่อในขอบเขตของเรา

งานชุดนี้เดินหน้าต่อเฉพาะ `admin-erp1.html` โดยแยก `admin-erp-read-model.js` ออกมาเป็นแหล่ง mapping กลางของหน้าใหม่ แล้วให้ `admin-erp1-integration.js` ทำหน้าที่แสดงผลเท่านั้น ไม่เข้าไปแก้หน้าหลักเดิมหรือ adapter backbone ของส่วนอื่น
