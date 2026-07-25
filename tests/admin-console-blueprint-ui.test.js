const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'admin-erp-ui.css'), 'utf8');

for (const label of [
  'แก้ไขสมุดงาน ERP',
  'อัปโหลด Excel',
  'ดูตัวอย่าง / เทียบข้อมูล',
  'ศูนย์เผยแพร่',
  'ประกาศ / ข่าว',
  'นโยบาย / แจ้งเตือน',
  'ตรวจสอบ / ย้อนกลับ',
]) {
  assert.ok(html.includes(label), `missing blueprint menu label: ${label}`);
}

for (const statusField of [
  'origins',
  'destinations',
  'visiblePairs',
  'scheduleOfferTimes',
  'readyForReview',
  'readyForApply',
  'blockers',
  'warnings',
]) {
  assert.ok(html.includes(statusField), `missing publishedSchedule status field: ${statusField}`);
}

for (const dashboardText of [
  'แดชบอร์ดศูนย์ควบคุม',
  'ภาพรวมข้อมูลหลังบ้าน SL-Transit',
  'เหตุการณ์ล่าสุด',
  'สถานะข้อมูล publishedSchedule',
  'สถานะการเผยแพร่',
  'ภาพรวมแผนที่ปฏิบัติการ',
  'การดำเนินการด่วน',
  'สุขภาพระบบ',
  'รายได้ / การจองวันนี้',
]) {
  assert.ok(html.includes(dashboardText), `missing Thai dashboard text: ${dashboardText}`);
}

assert.ok(html.includes('สถานะข้อมูล publishedSchedule'));
assert.ok(html.includes('id="publishApplyDisabled"'));
assert.ok(html.includes('disabled>Publish disabled - waiting for owner approval</button>'));
assert.ok(html.includes('navgroup'));
assert.ok(html.includes('จัดการไฟล์ Excel'));
assert.ok(html.includes('ข้อมูลหลัก'));
assert.ok(html.includes('ความปลอดภัย'));
assert.ok(html.includes('class="workflow"'));
assert.ok(html.includes('class="step"'));
assert.ok(html.includes('class="kpi-grid"'));
assert.ok(html.includes('class="dash-main"'));
assert.ok(html.includes('class="dash-wide"'));
assert.ok(html.includes('document.addEventListener'));
assert.ok(html.includes('@media(max-width:980px)'));
assert.ok(html.includes('overflow-x:auto'));
assert.ok(html.includes('@media(max-width:760px)'));
assert.ok(html.includes('grid-template-columns:1fr'));
assert.ok(css.includes('@media(max-width:980px)'));
assert.ok(css.includes('.side{position:static;height:auto;display:block}'));
assert.ok(css.includes('.nav{display:flex;gap:6px;overflow-x:auto'));
assert.ok(css.includes('.sheet{min-width:980px}'));
assert.ok(css.includes('@media(max-width:760px)'));
assert.ok(html.includes('DRY-RUN'));
assert.ok(html.includes('NO FIREBASE WRITE'));
assert.ok(html.includes('NOT PRODUCTION APPLY'));

assert.ok(!html.includes('?????'));
assert.ok(!html.includes('เน€'));
assert.ok(!html.includes('เธ'));
assert.ok(html.includes('เลือกไฟล์ Excel'));
assert.ok(html.includes('ข้อมูลป้ายต้นทาง'));

console.log('admin-erp blueprint ui ok');
