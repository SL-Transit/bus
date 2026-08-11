# Sandbox Safety Guards

Sandbox นี้ใช้สำหรับพัฒนาและทดสอบเท่านั้น

1. Project alias ต้องเป็น demo-sl-transit-erp-sandbox
2. Firebase config เปิดเฉพาะ Auth, RTDB, Functions และ Storage Emulator
3. ไม่มี Hosting configuration และไม่มี deploy script
4. Admin ERP1 ไม่มี commandEndpoint โดยค่าเริ่มต้น
5. Content Security Policy อนุญาตการเชื่อมต่อเฉพาะ same-origin, localhost และ 127.0.0.1
6. Runtime source ต้องไม่มี sl-transit-9464e, cloudfunctions.net หรือ publishedSchedule
7. Excel, secrets, service-account files และข้อมูลจริงต้องอยู่นอก repository
8. การสร้าง Firebase Project จริงหรือ Deploy ต้องได้รับ Owner approval ใหม่