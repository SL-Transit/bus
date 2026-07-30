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
    name: 'ผู้โดยสารคืนเงิน',
    phone: '089-000-1111',
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

assert.strictEqual(result.refunds.recent.length, 0, 'private refund rows require an authenticated admin request');
assert.strictEqual(result.refunds.recentPrivacy, 'auth_required');

const privateRefunds = summary.aggregateDashboard(records, {
  range: 'daily',
  anchor,
  nowMs: day28,
  refundedRecords: records,
  includePrivateRefunds: true,
  generatedAt: 6
});
assert.strictEqual(privateRefunds.refunds.recentPrivacy, 'firebase_id_token');
assert.strictEqual(privateRefunds.refunds.recent.length, 1);
assert.strictEqual(privateRefunds.refunds.recent[0].passengerName, 'ผู้โดยสารคืนเงิน');
assert.strictEqual(privateRefunds.refunds.recent[0].passengerPhone, '089-000-1111');
assert.strictEqual(privateRefunds.refunds.recent[0].refundAmount, 60);

const noTodaySettlement = summary.aggregateDashboard({
  BK_YESTERDAY_ONLY: records.BK_YESTERDAY_TRAVEL_TODAY
}, {
  range: 'daily',
  anchor,
  nowMs: day28,
  travelRecords: {},
  cancelledRecords: {},
  refundedRecords: {},
  generatedAt: 4
});
assert.strictEqual(noTodaySettlement.bookings.createdCount, 0, 'no booking created on anchor day');
assert(noTodaySettlement.bookings.points.some((point) => point.key === '2026-07-27' && point.bookings === 1), 'chart may still show historical range data');
assert.strictEqual(noTodaySettlement.vehicles.length, 0, 'vehicle settlement table must not show historical bookings as today revenue');
assert.strictEqual(noTodaySettlement.queues.length, 0, 'queue settlement table must not show historical bookings as today revenue');
assert.strictEqual(noTodaySettlement.finance.grossAmount, 0, 'today finance remains zero when no booking was created today');

const fleetOnly = summary.aggregateDashboard({}, {
  range: 'daily',
  anchor,
  nowMs: day28,
  travelRecords: {},
  cancelledRecords: {},
  refundedRecords: {},
  fleetMaster: {
    assignmentRules: {
      rotation_rule_v1: {
        vehicleIds: ['veh_001', 'veh_002', 'veh_003', 'veh_004'],
        queueIds: ['queue_001', 'queue_002', 'queue_003', 'queue_004']
      }
    },
    vehicles: {
      veh_001: { runtimeVehicleId: 'car1', legacyAliases: ['car1'] },
      veh_002: { runtimeVehicleId: 'car2', legacyAliases: ['car2'] },
      veh_003: { runtimeVehicleId: 'car3', legacyAliases: ['car3'] },
      veh_004: { runtimeVehicleId: 'car4', legacyAliases: ['car4'] }
    },
    serviceGroups: {
      group_001: { displayNameTh: 'ท่ารถสนามชัยเขต-หนองคอก-คลองหาด', routeScopeTh: 'สนามชัยเขต-หนองคอก-คลองหาด', status: 'active' },
      group_002: { displayNameTh: 'กลุ่มหมอชิต-เอกมัย-BTS', status: 'active' },
      group_003: { displayNameTh: 'กลุ่มพัทยา-ระยอง-มีนบุรี', status: 'active' },
      group_004: { displayNameTh: 'กลุ่มรังสิต', status: 'active' },
      group_005: { displayNameTh: 'กลุ่มรถไฟ', paymentMode: 'external_pay', status: 'active' }
    }
  },
  generatedAt: 5
});
assert.deepStrictEqual(fleetOnly.vehicles.map((row) => row.vehicleAlias), ['car1', 'car2', 'car3', 'car4']);
assert(fleetOnly.vehicles.every((row) => row.bookingCount === 0 && row.fareAmount === 0 && row.netAmount === 0), 'fleet master rows must not create fake revenue');
assert(fleetOnly.vehicles.every((row) => row.queueId), 'fleet master rows include the rotation queue for the selected day');
assert.deepStrictEqual(fleetOnly.queues.map((row) => row.queueDisplayName), ['ท่ารถสนามชัยเขต-หนองคอก-คลองหาด', 'กลุ่มหมอชิต-เอกมัย-BTS', 'กลุ่มพัทยา-ระยอง-มีนบุรี', 'กลุ่มรังสิต', 'กลุ่มรถไฟ']);
assert(fleetOnly.queues.every((row) => row.bookingCount === 0 && row.fareAmount === 0 && row.netAmount === 0), 'service group rows must not create fake revenue');

const serialized = JSON.stringify(result);
['name', 'firstName', 'lastName', 'surname', 'phone', 'lineUserId', 'bookingCode', 'rawBooking', 'passengerIdentity', 'bankAccount', 'password'].forEach((field) => {
  assert(!serialized.includes(`"${field}"`), `response must not expose ${field}`);
});

assert.strictEqual(summary.bucketPlan('hourly', '2026-03-31', day28).length, 24);
assert.strictEqual(summary.bucketPlan('daily', '2026-03-31', day28).length, 7);
assert.strictEqual(summary.bucketPlan('weekly', '2026-03-31', day28).length, 4);
const monthly = summary.bucketPlan('monthly', '2026-03-31', day28);
assert.strictEqual(monthly.length, 6);
assert.strictEqual(new Set(monthly.map((point) => point.key)).size, 6);
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
assert(functionsIndex.includes('verifyIdToken'), 'function must verify Firebase ID token before returning private refund rows');
assert(functionsIndex.includes('"Content-Type, Authorization"'), 'function CORS must allow Authorization header for admin dashboard token');
assert(functionsIndex.includes('ref("data/erpDataCenter/fleet").get()'), 'function must read ERP fleet master for vehicle alias and public driver display names');
assert(functionsIndex.includes('ref("data/erpDataCenter/serviceGroups").get()'), 'function must read ERP service groups for queue/transfer provider display names');
assert(functionsIndex.includes('ref("analytics/mainWeb")'), 'function must read website analytics rollups through the HTTPS summary endpoint');
assert(!functionsIndex.includes('ref("bookings").get()'), 'function must not read full booking root');

console.log('admin-dashboard-summary.test.js OK');
