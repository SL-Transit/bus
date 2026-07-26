const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const dashboardMatches = html.match(/function dashboard\(\)/g) || [];
assert.strictEqual(dashboardMatches.length, 1, 'admin-erp.html must contain exactly one function dashboard()');

const dashboardStart = html.indexOf('function dashboard()');
const dashboardEnd = html.indexOf('function flowStatus()', dashboardStart);
assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart, 'Dashboard renderer boundaries must be explicit');
const dashboardSource = html.slice(dashboardStart, dashboardEnd);

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
  assert.ok(html.includes(label), `missing preserved sidebar label: ${label}`);
}

for (const label of [
  'จำนวนครั้งเข้าเว็บไซต์',
  'ผู้เยี่ยมชมโดยประมาณ',
  'จำนวนการจองวันนี้',
  'ยอดรับจากผู้โดยสารวันนี้',
  'รายได้ค่าบริการแพลตฟอร์มวันนี้',
  'คืนเงินรอดำเนินการ',
  'ภาพรวมการรับเงินและรายได้',
  'ยอดของรถและคนขับ',
  'ยอดของคิวรถและผู้ให้บริการช่วงต่อ',
  'รายการคืนเงินล่าสุด',
  'สถานะแหล่งข้อมูลและเวลาอัปเดต',
]) {
  assert.ok(html.includes(label), `missing Screen 01 business UI label: ${label}`);
}

for (const range of ['วันนี้', 'รายวัน', 'รายเดือน', '6 เดือน', '1 ปี']) {
  assert.ok(html.includes(range), `missing time range: ${range}`);
}

for (const forbidden of [
  'Incident',
  'Blackbox',
  'เหตุผิดปกติ',
  'เปิดศูนย์เหตุขัดข้อง',
  'operationsMap',
  'คุณภาพ GPS',
  'ดูแผนที่รถ',
  'แผนที่ OpenStreetMap',
]) {
  assert.ok(!dashboardSource.includes(forbidden), `Dashboard must not include operations widget: ${forbidden}`);
}

assert.ok(!html.includes('function initOperationsMap'), 'Screen 01 branch must not keep initOperationsMap dead code');
assert.ok(!html.includes('id="operationsMap"'), 'Dashboard must not render operationsMap');
assert.ok(!html.includes('https://unpkg.com/leaflet'), 'Leaflet import must not exist in business Dashboard UX');
assert.ok(!html.includes('function dashboardLegacyDisabled'), 'legacy dashboard helper must be removed');
assert.ok(!html.includes('function opsKpiValue'), 'old running-vehicle KPI helper must be removed');
assert.ok(!html.includes('function opsKpiNote'), 'old running-vehicle note helper must be removed');
assert.ok(!html.includes('function opsPanelState'), 'old operations panel helper must be removed');
assert.ok(!html.includes('function gpsPanelState'), 'old GPS panel helper must be removed');
assert.ok(!html.includes('function donutStyle'), 'old decorative chart helper must be removed');

for (const forbiddenValue of ['4,238', '1,285,450', '1,250', '15,000', '+12%', '1000018505']) {
  assert.ok(!html.includes(forbiddenValue), `mock/screenshot value must not be hardcoded: ${forbiddenValue}`);
}

assert.ok(!html.includes('<img'), 'reference screenshot must not be embedded as img');
assert.ok(!html.includes('background-image'), 'reference screenshot must not be embedded as CSS background');
assert.ok(!html.includes('base64'), 'reference screenshot must not be embedded as base64');
assert.ok(!html.includes('?????'), 'Thai text must not render as question marks');

assert.ok(html.includes('ยังไม่เชื่อมแหล่งข้อมูล'), 'unavailable state must be visible');
assert.ok(html.includes('ยังไม่มีรายการในช่วงเวลานี้'), 'empty state must be distinct');
assert.ok(html.includes('ไม่สามารถอ่านข้อมูลได้'), 'error state must be distinct');
assert.ok(html.includes('ช่วงเวลานี้ยังไม่เชื่อมข้อมูล'), 'unsupported range state must be visible');
assert.ok(dashboardSource.includes('Dashboard รอบนี้ไม่วาดกราฟรายได้'), 'no fake revenue chart guard missing');
assert.ok(html.includes('NO FIREBASE WRITE'));
assert.ok(html.includes('NOT PRODUCTION APPLY'));

console.log('admin-erp dashboard Screen 01 UX refresh ok');
