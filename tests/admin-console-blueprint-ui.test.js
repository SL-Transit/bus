const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'admin-erp-ui.css'), 'utf8');

for (const label of [
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
]) {
  assert.ok(html.includes(label), `missing approved sidebar label: ${label}`);
}

assert.ok(!html.includes('กล้องวงจรปิด'), 'CCTV Thai menu must not exist');
assert.ok(!/CCTV/i.test(html), 'CCTV menu must not exist');
assert.ok(!html.includes('กล่องข้อความ'), 'must not replace blackbox with inbox wording');

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

for (const token of [
  'แดชบอร์ดศูนย์ควบคุม',
  'การจองวันนี้',
  'รถที่กำลังวิ่ง',
  'คืนเงินรอดำเนินการ',
  'เหตุผิดปกติ',
  'รายได้วันนี้',
  'สถานะระบบ',
  'dashboard-grid',
  'kpi-grid',
  'kpi-card',
  'donut-box',
  'line-chart empty-chart',
  'operationsMap',
  'map-osm',
  'quick-grid',
  'top-left',
  'searchbox',
  'top-meta',
  'adminSearch',
  'serviceDate',
  'notificationButton',
  'userProfileButton',
  'refreshDashboard',
  'function initOperationsMap',
  'L.map',
  'tileLayer',
  'OpenStreetMap',
  'function goPage',
  'recordAudit(\'service-date-changed\'',
  'recordAudit(\'dashboard-refresh\'',
]) {
  assert.ok(html.includes(token), `missing dashboard screen 01 token: ${token}`);
}

assert.ok(html.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'));
assert.ok(html.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
assert.ok(html.includes('publishedSchedule.mapView'));
assert.ok(html.includes('operations/liveVehicles ไม่ถูกใช้ในหน้านี้'));
assert.ok(html.includes('ไม่มีแหล่งข้อมูลที่ปลอดภัยใน Admin read adapter'));
assert.ok(html.includes('disabled title="ยังไม่เปิดใช้งานใน Screen 01"'));

for (const forbiddenValue of ['4,238', '1,285,450', '25 พ.ค. 2567', '1000018505']) {
  assert.ok(!html.includes(forbiddenValue), `screenshot/mock value must not be hardcoded: ${forbiddenValue}`);
}

assert.ok(!html.includes('<img'), 'reference screenshot must not be embedded as img');
assert.ok(!html.includes('background-image'), 'reference screenshot must not be embedded as CSS background');
assert.ok(!html.includes('base64'), 'reference screenshot must not be embedded as base64');

assert.ok(/[\u0E00-\u0E7F]/.test(html), 'admin console must contain real Thai Unicode text');
assert.ok(html.includes('id="publishApplyDisabled"'));
assert.ok(html.includes('disabled>Publish disabled - waiting for owner approval</button>'));
assert.ok(html.includes('navgroup'));
assert.ok(html.includes('class="workflow"'));
assert.ok(html.includes('class="step"'));
assert.ok(html.includes('document.addEventListener'));
assert.ok(html.includes('@media(max-width:980px)'));
assert.ok(html.includes('@media(max-width:760px)'));
assert.ok(css.includes('@media(max-width:980px)'));
assert.ok(css.includes('.side{position:static;height:auto;display:block}'));
assert.ok(css.includes('.nav{display:flex;gap:6px;overflow-x:auto'));
assert.ok(css.includes('.sheet{min-width:980px}'));
assert.ok(css.includes('@media(max-width:760px)'));
assert.ok(html.includes('DRY-RUN'));
assert.ok(html.includes('NO FIREBASE WRITE'));
assert.ok(html.includes('NOT PRODUCTION APPLY'));

assert.ok(!html.includes('?????'));
assert.equal((html.match(/\u0E40\u0E18/g) || []).length, 0, 'mojibake Thai marker found');
assert.equal((html.match(/\u0E40\u0E19\u20AC/g) || []).length, 0, 'mojibake Thai marker found');

console.log('admin-erp dashboard screen 01 ui ok');
