const assert = require('assert');
const fs = require('fs');
const path = require('path');
const summary = require('../functions/admin-dashboard-summary.js');

const anchor = '2026-07-28';
const day28 = Date.parse('2026-07-27T17:30:00.000Z'); // 2026-07-28 00:30 Asia/Bangkok
const day27 = Date.parse('2026-07-26T18:00:00.000Z');

const records = {
  BK_TODAY_FUTURE: {
    code: 'BK_TODAY_FUTURE',
    ts: day28,
    date: '2026-07-29',
    origin: 'BKK',
    destination: 'CNX',
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'awaiting_payment',
    paymentStatus: 'pay_on_site',
    pax: 2,
    price: 120,
    fare: 110,
    serviceFee: 10,
    plannedVehicleId: 'van-1',
    driverId: 'driver-1',
    queueNo: 'Q1',
    routeId: 'R1',
    tripId: 'T1',
    pickupTime: '09:00',
    passengerIdentity: { provider: 'line', lineUserId: 'U123' },
    phone: '081-234-5678'
  },
  BK_YESTERDAY_TRAVEL_TODAY: {
    code: 'BK_YESTERDAY_TRAVEL_TODAY',
    ts: day27,
    date: '2026-07-28',
    origin: 'BKK',
    destination: 'CNX',
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'awaiting_payment',
    paymentStatus: 'pay_on_site',
    pax: 1,
    price: 60,
    fareAmount: 55,
    serviceFeeAmount: 5,
    vehicleId: 'van-2',
    queueNo: 'Q2',
    passengerIdentity: { provider: 'line', lineUserId: 'U999' }
  },
  BK_CANCEL: {
    code: 'BK_CANCEL',
    ts: day28 + 1000,
    date: '2026-07-28',
    origin: 'BKK',
    destination: 'RYG',
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'cancelled',
    cancelledAt: day28 + 3000,
    paymentStatus: 'awaiting_payment',
    pax: 1,
    price: 60,
    fare: 55,
    serviceFee: 5
  },
  BK_REFUND: {
    code: 'BK_REFUND',
    ts: day28 + 2000,
    date: '2026-07-28',
    origin: 'BKK',
    destination: 'RYG',
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'refunded',
    paymentStatus: 'refunded',
    refundStatus: 'completed',
    refundedAt: day28 + 4000,
    refundAmount: 60,
    pax: 1,
    price: 60,
    fare: 55,
    serviceFee: 5
  },
  BK_TEST: {
    code: 'BK_TEST',
    ts: day28,
    date: '2026-07-28',
    origin: 'BKK',
    destination: 'CNX',
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'awaiting_payment',
    testMode: true,
    pax: 1,
    price: 60
  },
  BK_INCOMPLETE: {
    code: 'BK_INCOMPLETE',
    date: '2026-07-28',
    origin: 'BKK',
    destination: 'CNX',
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'awaiting_payment',
    pax: 1
  }
};

const result = summary.aggregateDashboard(records, {
  range: 'daily',
  anchor,
  nowMs: day28,
  travelRecords: records,
  cancelledRecords: records,
  refundedRecords: records,
  fleetMaster: {
    vehicles: {
      'van-1': { vehicleAlias: 'car1' }
    },
    drivers: {
      'driver-1': { driverDisplayName: 'นาย ก', firstName: 'ห้ามส่งออก', phone: '0800000000' }
    }
  },
  websiteRollups: { '2026-07-28': { visitors: 3, actualUsers: 2 } },
  identitySecret: 'test-secret',
  generatedAt: 1
});

assert.strictEqual(result.timezone, 'Asia/Bangkok');
assert.strictEqual(result.bookings.createdCount, 3, 'today booking count uses created ts for the anchor day');
assert.strictEqual(result.bookings.travelPassengerCount, 1, 'travel passenger count uses service date, not created ts');
assert.strictEqual(result.bookings.cancelledCount, 1);
assert.strictEqual(result.bookings.refundedCount, 1);
assert.strictEqual(result.finance.grossAmount, 180, 'finance summary uses records created on the anchor day');
assert.strictEqual(result.finance.fareAmount, 220);
assert.strictEqual(result.finance.serviceFeeAmount, 20);
assert.strictEqual(result.finance.refundAmount, 60);
assert.strictEqual(result.finance.netAmount, 120);

const todayPoint = result.bookings.points.find((point) => point.key === '2026-07-28');
assert.strictEqual(todayPoint.bookings, 3, 'booking today/travel future counts by ts date');
assert.strictEqual(todayPoint.cancellations, 1);
assert.strictEqual(todayPoint.refunds, 1);
const yesterdayPoint = result.bookings.points.find((point) => point.key === '2026-07-27');
assert.strictEqual(yesterdayPoint.bookings, 1, 'booking yesterday/travel today stays yesterday');

assert(result.vehicles.some((row) => row.vehicleId === 'van-1' && row.bookingCount === 1));
const car1Row = result.vehicles.find((row) => row.vehicleId === 'van-1');
assert.strictEqual(car1Row.vehicleAlias, 'car1');
assert.strictEqual(car1Row.driverDisplayName, 'นาย ก');
assert.strictEqual(car1Row.driverMasterStatus, 'ready');
assert(result.vehicles.some((row) => row.vehicleId === 'ยังไม่ระบุรถ' && row.bookingCount === 2), 'unassigned vehicle records are kept');
assert(result.queues.some((row) => row.queueId === 'Q1' && row.passengerCount === 2));
assert(result.routes.some((row) => row.routeId === 'R1' && row.bookingCount === 1));
assert.strictEqual(result.website.visitors, 3);
assert.strictEqual(result.website.actualUsers, 2, 'actual users come from website analytics rollups');
assert.strictEqual(result.website.status, 'ready');
assert.strictEqual(result.bookings.createdDateSource, 'ts');
assert.strictEqual(result.bookings.travelDateSource, 'date/serviceDate');
assert.strictEqual(result.bookings.cancellationContractStatus, 'ready');
assert.strictEqual(result.bookings.refundContractStatus, 'ready');
assert.strictEqual(result.diagnostic.tsQueryCount, Object.keys(records).length);
assert.strictEqual(result.diagnostic.acceptedCount, 4);
assert.strictEqual(result.diagnostic.rejectedCount, 2);
assert.strictEqual(result.diagnostic.invalidRecordSummary.missing_ts, 1);
assert.strictEqual(result.diagnostic.latestBookingShape.hasTs, true);
assert.strictEqual(result.diagnostic.latestBookingShape.hasSource, true);
assert.strictEqual(result.diagnostic.latestBookingShape.hasSourceMode, true);
assert.strictEqual(result.diagnostic.latestBookingShape.hasServiceDate, true);
assert.strictEqual(result.diagnostic.latestBookingShape.hasPax, true);
assert.strictEqual(result.diagnostic.latestBookingShape.hasStatus, true);

const unsupported = summary.aggregateDashboard({
  BK_CANCEL_NO_TS: Object.assign({}, records.BK_CANCEL, { cancelledAt: undefined })
}, { range: 'daily', anchor, nowMs: day28, travelRecords: {}, cancelledRecords: { BK_CANCEL_NO_TS: Object.assign({}, records.BK_CANCEL, { cancelledAt: undefined }) }, refundedRecords: {}, generatedAt: 2 });
assert.strictEqual(unsupported.bookings.cancelledCount, 0);
assert.strictEqual(unsupported.bookings.cancellationContractStatus, 'unsupported_missing_cancelledAt');

const noWebsiteSource = summary.aggregateDashboard(records, {
  range: 'daily',
  anchor,
  nowMs: day28,
  travelRecords: records,
  cancelledRecords: records,
  refundedRecords: records,
  generatedAt: 3
});
assert.strictEqual(noWebsiteSource.website.status, 'unavailable');
assert.strictEqual(noWebsiteSource.website.visitors, null);
assert.strictEqual(noWebsiteSource.website.actualUsers, null);

const serialized = JSON.stringify(result);
['name', 'firstName', 'lastName', 'surname', 'phone', 'lineUserId', 'bookingCode', 'rawBooking', 'passengerIdentity', 'bankAccount', 'password'].forEach((field) => {
  assert(!serialized.includes(`"${field}"`), `response must not expose ${field}`);
});

const monthly = summary.bucketPlan('monthly', '2026-03-31', day28);
assert.strictEqual(monthly.length, 12);
assert.strictEqual(new Set(monthly.map((point) => point.key)).size, 12);
assert(monthly.some((point) => point.key === '2026-02'), 'February bucket must exist once');

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
assert(!adminHtml.includes('site-analytics-read-model.js'), 'admin must not load legacy site analytics model');
assert(!adminHtml.includes('booking-activity-read-model.js'), 'admin must not load direct booking read model');
assert(!adminHtml.includes("firebase.database().ref('bookings')"), 'admin must not read raw bookings');
assert(!adminHtml.includes('จำนวนครั้งเข้าเยี่ยมชม'), 'old website label must be removed');
assert(!adminHtml.includes('ผู้เยี่ยมชมโดยประมาณ'), 'old estimated visitor label must be removed');

const functionsIndex = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
assert(functionsIndex.includes('orderByChild("ts")'), 'function must query bookings by ts');
assert(functionsIndex.includes('orderByChild("date")'), 'function must query travel passengers by service date');
assert(functionsIndex.includes('orderByChild("serviceDate")'), 'function must query travel passengers by serviceDate fallback');
assert(functionsIndex.includes('orderByChild("cancelledAt")'), 'function must query cancellations by cancelledAt');
assert(functionsIndex.includes('orderByChild("refundedAt")'), 'function must query refunds by refundedAt');
assert(functionsIndex.includes('ref("data/erpDataCenter/fleet").get()'), 'function must read ERP fleet master for vehicle alias and public driver display names');
assert(functionsIndex.includes('ref("analytics/mainWeb")'), 'function must read website analytics rollups through the HTTPS summary endpoint');
assert(!functionsIndex.includes('ref("bookings").get()'), 'function must not read full booking root');

console.log('admin-dashboard-summary.test.js OK');
