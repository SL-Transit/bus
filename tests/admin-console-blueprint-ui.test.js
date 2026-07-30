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
assert.ok(dashboardSource.includes('refundTable(refunds)'), 'Dashboard must render latest refund passenger table');
assert.ok(!dashboardSource.includes('sourceStatusPanel(d)'), 'Dashboard must not render source status panel');
assert.ok(!dashboardSource.includes('id="source-status"'), 'Dashboard must remove source status panel from Screen 01');
assert.ok(html.includes('function settlementCell(row,h)'), 'Dashboard settlement tables must preserve zero values');
assert.ok(html.includes('value===0||value?value'), 'Dashboard settlement tables must not render 0 as unavailable');
assert.ok(html.includes('settlement-responsive'), 'Dashboard settlement tables must keep the standard responsive table wrapper');
assert.ok(!html.includes('.settlement-table thead{display:none}'), 'Dashboard settlement tables must stay Excel-like on mobile');
assert.ok(!html.includes('.settlement-table,.settlement-table tbody,.settlement-table tr,.settlement-table td{display:block'), 'Dashboard settlement tables must not become mobile cards');
assert.ok(html.includes('ผู้โดยสาร'), 'Refund table must include passenger name column');
assert.ok(html.includes('เบอร์โทร'), 'Refund table must include passenger phone column');
assert.ok(html.includes('จำนวนเงินคืน'), 'Refund table must include refund amount column');

for (const label of [
  'จำนวนผู้เยี่ยมชม (เว็บไซต์)',
  'ผู้ใช้งานจริง',
  'จำนวนการจอง',
  '\u0E23\u0E32\u0E22\u0E44\u0E14\u0E49\u0E27\u0E31\u0E19\u0E19\u0E35\u0E49',
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
