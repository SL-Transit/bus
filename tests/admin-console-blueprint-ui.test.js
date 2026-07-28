const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const dashboardStart = html.indexOf('function dashboard()');
const dashboardEnd = html.indexOf('function flowStatus()', dashboardStart);
assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart, 'Dashboard renderer boundaries must be explicit');
const dashboardSource = html.slice(dashboardStart, dashboardEnd);

assert.strictEqual((html.match(/function dashboard\(\)/g) || []).length, 1, 'admin-erp.html must contain exactly one dashboard renderer');
assert.ok(html.includes('class="side"'), 'sidebar shell missing');
assert.ok(html.includes('id="toggleSidebar"'), 'mobile drawer toggle missing');
assert.ok(html.includes('body.nav-open'), 'mobile drawer style missing');
assert.ok(html.includes('setMobileDrawer'), 'mobile drawer behavior missing');

assert.ok(html.includes('admin-dashboard-read-model.js'), 'Admin Dashboard must load the aggregate HTTPS read model');
assert.ok(!html.includes('site-analytics-read-model.js'), 'Admin Dashboard must not load legacy website analytics read model');
assert.ok(!html.includes('booking-activity-read-model.js'), 'Admin Dashboard must not load direct booking read model');
assert.ok(!html.includes('siteAnalyticsReadModel'), 'Admin Dashboard must not use legacy siteAnalyticsReadModel');
assert.ok(!html.includes('bookingActivityReadModel'), 'Admin Dashboard must not use legacy bookingActivityReadModel');

assert.ok(dashboardSource.includes('keyMetricsCards()'), 'Dashboard must render real-data KPI cards');
assert.ok(dashboardSource.includes('analyticsChart(visits)'), 'Dashboard must render website visitors/actual users chart');
assert.ok(dashboardSource.includes('bookingActivityChart(bookings,refunds,bookingCount)'), 'Dashboard must render booking/cancel/refund chart');
assert.ok(dashboardSource.includes('financeDonuts(revenue,refunds,passengerGross,providerFare,platformFee)'), 'Dashboard must render passenger payment donut');
assert.ok(dashboardSource.includes('vehicleDriverExcelTable(vehicleSettlements)'), 'Dashboard must render vehicle/driver aggregate table');
assert.ok(dashboardSource.includes('settlementTable'), 'Dashboard must render queue aggregate table');

for (const label of [
  'จำนวนผู้เยี่ยมชม (เว็บไซต์)',
  'ผู้ใช้งานจริง',
  'จำนวนการจอง',
  'จำนวนผู้โดยสาร',
  'ยอดรับจากผู้โดยสาร',
  'ค่าโดยสารผู้ให้บริการ',
  'ค่าบริการแพลตฟอร์ม',
  'ยอดคืนเงิน',
  'ยอดสุทธิ',
  'สถานะข้อมูล',
  'จาก Booking Snapshot'
]) {
  assert.ok(html.includes(label), `Dashboard contract label missing: ${label}`);
}

for (const forbidden of [
  'จำนวนครั้งเข้าเยี่ยมชม',
  'ผู้เยี่ยมชมโดยประมาณ',
  "rate:'55 บาท/คน'",
  "rate:'5 บาท/การจอง'",
  'money-overview',
  'Math.random',
  '<img',
  'base64',
  '1000018505'
]) {
  assert.ok(!html.includes(forbidden), `Dashboard must not include legacy/mock content: ${forbidden}`);
}

assert.ok(html.includes('chart-frame'), 'charts must keep a visible plot frame');
assert.ok(html.includes('chart-axis-zero'), 'charts must keep a Y axis zero label');
assert.ok(html.includes('chart-x-labels'), 'charts must render X axis labels');
assert.ok(html.includes('donut-empty'), 'donut empty ring missing');
assert.ok(html.includes('id="vehicle-driver-excel"'), 'vehicle/driver Excel-like table id missing');
assert.ok(html.includes('ต้องมี Admin Authentication ก่อนเปิดรายการต้นทาง'), 'source drilldown must stay PII-gated');
assert.ok(!dashboardSource.includes('analytics/mainWeb'), 'Dashboard UI must not read legacy analytics path');
assert.ok(!dashboardSource.includes('bookings/'), 'Dashboard UI must not read raw bookings');

console.log('admin-erp dashboard real aggregate contract ok');
