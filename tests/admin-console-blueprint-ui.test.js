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

assert.ok(dashboardSource.includes('analyticsChart(visits)'), 'Dashboard must render one analytics chart card');
assert.ok(dashboardSource.includes('bookingActivityChart(bookings,refunds,bookingCount)'), 'Dashboard must render booking activity chart card');
assert.ok(dashboardSource.includes('financeDonuts(revenue,refunds,passengerGross,providerFare,platformFee)'), 'Dashboard must render the passenger payment donut');
assert.ok(!dashboardSource.includes('bookingSummaryCard'), 'old booking number card must be removed');
assert.ok(!dashboardSource.includes("businessKpi('฿'"), 'old finance KPI cards must be removed from Dashboard renderer');

assert.ok(html.includes('finance-donut-grid'), 'finance donut grid missing');
assert.ok((html.match(/<section class="finance-donut"/g) || []).length === 1, 'Dashboard must render exactly one finance donut');
assert.ok(html.includes("donutChart('ยอดรับจากผู้โดยสารวันนี้'"), 'passenger payment donut title missing');
assert.ok(html.includes("'ยอดรับรวมวันนี้'"), 'center total label missing');
assert.ok(html.includes("rate:'55 บาท/คน'"), 'provider fare rate label missing');
assert.ok(html.includes("rate:'5 บาท/การจอง'"), 'platform fee rate label missing');
assert.ok(html.includes("label:'เงินคืนผู้โดยสาร'"), 'passenger refund legend missing');
assert.ok(html.includes("rate:'คืนตามรายการที่อนุมัติ'"), 'passenger refund rate label missing');
assert.ok(!html.includes('รายได้ค่าบริการแพลตฟอร์มวันนี้'), 'platform revenue donut title must be removed');
assert.ok(!html.includes('รายได้ค่าบริการสุทธิ'), 'platform net revenue legend must be removed');
assert.ok(!html.includes('ค่าบริการที่คืนแล้ว'), 'refunded service fee donut legend must be removed');
assert.ok(!html.includes('netPlatform'), 'platform revenue donut calculation must be removed');
assert.ok(html.includes('donut-empty'), 'donut empty ring missing');

assert.ok(html.includes('chart-frame'), 'charts must keep a visible plot frame');
assert.ok(html.includes('chart-axis-zero'), 'charts must keep a Y axis zero label');
assert.ok(html.includes('chart-x-labels'), 'charts must render X axis labels');
assert.ok(html.includes('bookingActivityChart'), 'booking activity chart must remain');
assert.ok(html.includes('legend-line orange'), 'refund series legend must remain');

for (const forbidden of [
  'Incident',
  'Blackbox',
  'operationsMap',
  'GPS',
  'https://unpkg.com/leaflet',
  'function initOperationsMap',
  'function dashboardLegacyDisabled',
  'function opsKpiValue',
  'function opsKpiNote',
  'function opsPanelState',
  'function gpsPanelState',
  'function donutStyle',
]) {
  assert.ok(!dashboardSource.includes(forbidden), `Dashboard must not include operations widget: ${forbidden}`);
}

for (const forbiddenValue of ['4,238', '1,285,450', '1,250', '15,000', '+12%', '1000018505']) {
  assert.ok(!html.includes(forbiddenValue), `mock/screenshot value must not be hardcoded: ${forbiddenValue}`);
}

for (const debugWord of ['endpoint', 'adapter', 'privacy-safe', 'canonical', 'mock', 'unavailable source']) {
  assert.ok(!dashboardSource.includes(debugWord), `Dashboard must not show debug wording: ${debugWord}`);
}

assert.ok(!html.includes('Math.random'), 'Dashboard must not generate random values');
assert.ok(!dashboardSource.includes('analytics/mainWeb'), 'Dashboard must not read legacy private analytics path');
assert.ok(!html.includes('<img'), 'reference screenshot must not be embedded as img');
assert.ok(!html.includes('background-image'), 'reference screenshot must not be embedded as CSS background');
assert.ok(!html.includes('base64'), 'reference screenshot must not be embedded as base64');
assert.ok(!html.includes('?????'), 'Thai text must not render as question marks');
assert.ok(html.includes('NO FIREBASE WRITE'));

console.log('admin-erp dashboard single passenger payment donut ok');
