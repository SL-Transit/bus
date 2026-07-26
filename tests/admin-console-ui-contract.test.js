const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

const approvedSidebarLabels = [
  'แดชบอร์ด',
  'ปฏิบัติการวันนี้',
  'การจอง',
  'ตั๋วและคืนเงิน',
  'ควบคุมแอปคนขับ',
  'รถที่กำลังวิ่ง',
  'แจ้งเตือน',
  'กล่องดำระบบ',
  'จัดการข้อมูล ERP',
  'ตรวจสอบและเผยแพร่',
  'สิทธิ์ผู้ใช้งาน',
  'ตั้งค่าระบบ',
];

for (const label of approvedSidebarLabels) {
  assert.ok(html.includes(label), `missing approved sidebar label ${label}`);
}

assert.ok(html.includes('data-page="dashboard"'), 'dashboard nav page must exist');
assert.ok(!html.includes('disabled title="ยังไม่เปิดใช้งานใน Screen 01"'), 'approved sidebar routes must be clickable');
assert.ok(html.includes('หน้านี้ยังอยู่ระหว่างพัฒนาในรอบถัดไป'), 'unimplemented routes must render an under-development page');

const downloadIds = Array.from(html.matchAll(/id="(download[A-Za-z0-9]+)"/g)).map((m) => m[1]);
assert.ok(downloadIds.length >= 20, 'expected backoffice export buttons');

for (const id of new Set(downloadIds)) {
  assert.ok(html.includes(`function ${id}(`), `missing function for ${id}`);
  assert.ok(html.includes(`${id};`), `missing bind handler for ${id}`);
}

const forbiddenControls = [
  'saveToFirebase',
  'applyPublish',
  'seedData',
  'deployRules',
  'productionApply',
  'assignDriver',
  'assignVehicle',
  'sendLine',
  'fakeGps',
  'fakeEta',
];

for (const control of forbiddenControls) {
  assert.ok(!html.includes(`id="${control}"`), `forbidden control ${control}`);
}

assert.ok(html.includes('แดชบอร์ดศูนย์ควบคุม'));
assert.ok(html.includes('ADMIN CONSOLE'));
assert.ok(html.includes('Excel -> Draft -> Review -> Publish'));

console.log('admin-erp ui contract ok');
