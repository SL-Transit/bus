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

const navSource = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>', html.indexOf('<nav class="nav"')));
const navPages = Array.from(navSource.matchAll(/<button[^>]+data-page="([^"]+)"/g)).map((match) => match[1]);
assert.deepStrictEqual(navPages, [
  'dashboard',
  'today',
  'bookings',
  'tickets-refunds',
  'alerts',
  'workbook',
  'announcements',
  'roles',
  'settings',
], 'Sidebar must contain exactly the approved 9 primary menu items');

for (const forbiddenPage of ['driver-control', 'running-vehicles', 'blackbox', 'publish']) {
  assert.ok(!navPages.includes(forbiddenPage), `old primary menu must be removed: ${forbiddenPage}`);
}

for (const requiredShell of [
  'class="side"',
  'id="adminSidebar"',
  'class="drawer-overlay"',
  'id="toggleSidebar"',
  'class="brand-lockup"',
  'class="nav-ico"',
  'body.nav-collapsed',
  'body.nav-open',
  'setMobileDrawer',
  'toggleNavigation',
  "ev.key==='Escape'",
]) {
  assert.ok(html.includes(requiredShell), `missing navigation shell behavior: ${requiredShell}`);
}

assert.ok(!html.includes('focusSearch'), 'hamburger must not be wired as search focus');
assert.ok(!html.includes('nav{display:flex;gap:6px;overflow-x:auto'), 'mobile must not use horizontal main menu');

for (const label of [
  'สถิติการเข้าใช้งานเว็บไซต์',
  'จำนวนครั้งเข้าเยี่ยมชม',
  'ผู้เยี่ยมชมโดยประมาณ',
  'จำนวนการจอง',
  'ดูการจอง',
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

assert.ok(!dashboardSource.includes('จำนวนครั้งเข้าเว็บไซต์'), 'old visit KPI card must be removed from Dashboard renderer');
assert.ok(!dashboardSource.includes("businessKpi('↗'"), 'old visit count KPI renderer must be removed');
assert.ok(!dashboardSource.includes("businessKpi('👥'"), 'old visitor KPI renderer must be removed');
assert.ok(dashboardSource.includes('analyticsChart(visits)'), 'Dashboard must render one analytics chart card');
assert.ok(dashboardSource.includes('bookingSummaryCard(bookings,bookingCount)'), 'Dashboard must render booking summary card');

for (const range of ['รายชั่วโมง', 'รายวัน', 'รายสัปดาห์', 'รายเดือน', 'รายปี']) {
  assert.ok(html.includes(range), `missing analytics time range: ${range}`);
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

for (const debugWord of ['endpoint', 'adapter', 'privacy-safe', 'canonical', 'mock', 'unavailable source']) {
  assert.ok(!dashboardSource.includes(debugWord), `Dashboard must not show debug wording: ${debugWord}`);
}

assert.ok(!html.includes('Math.random'), 'Dashboard analytics shell must not generate random analytics values');
assert.ok(!dashboardSource.includes('analytics/mainWeb'), 'Dashboard analytics shell must not read legacy private analytics path');

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
