const assert = require('assert');
const readModel = require('../booking-activity-read-model.js');
const aggregate = require('../functions/booking-activity-aggregate.js');

const BKK = '+07:00';
const today = '2026-07-28';
const tomorrow = '2026-07-29';
const yesterday = '2026-07-27';
const createdToday = Date.parse(`${today}T09:00:00${BKK}`);
const createdYesterday = Date.parse(`${yesterday}T23:00:00${BKK}`);

function complete(extra) {
  return Object.assign({
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    date: today,
    origin: 'A',
    destination: 'B',
    pax: 1,
    status: 'awaiting_payment'
  }, extra || {});
}

const records = {
  BK_TODAY_TRAVEL_TODAY: complete({ code: 'BK_TODAY_TRAVEL_TODAY', ts: createdToday, date: today }),
  BK_TODAY_TRAVEL_FUTURE: complete({ code: 'BK_TODAY_TRAVEL_FUTURE', ts: createdToday + 60000, serviceDate: tomorrow, date: tomorrow }),
  BK_YESTERDAY_TRAVEL_TODAY: complete({ code: 'BK_YESTERDAY_TRAVEL_TODAY', ts: createdYesterday, date: today }),
  BK_CANCELLED_TODAY: complete({ code: 'BK_CANCELLED_TODAY', ts: createdToday + 120000, date: tomorrow, status: 'cancelled' }),
  BK_REFUNDED_TODAY: complete({ code: 'BK_REFUNDED_TODAY', ts: createdToday + 180000, date: tomorrow, paymentStatus: 'refunded' }),
  BK_TEST_MODE: complete({ code: 'BK_TEST_MODE', ts: createdToday, testMode: true }),
  BK_MOCK_PAYMENT: complete({ code: 'BK_MOCK_PAYMENT', ts: createdToday, mockPayment: true }),
  BK_DRAFT: complete({ code: 'BK_DRAFT', ts: createdToday, status: 'draft' }),
  BK_FAILED: complete({ code: 'BK_FAILED', ts: createdToday, status: 'failed' }),
  BK_NO_CREATED: complete({ code: 'BK_NO_CREATED', ts: null }),
  BK_INCOMPLETE: { code: 'BK_INCOMPLETE', ts: createdToday, source: 'booking1.html', sourceMode: 'erp_data_center', date: today, status: 'awaiting_payment' },
  BK_CREATED_AT_ONLY: complete({ code: 'BK_CREATED_AT_ONLY', createdAt: createdToday, date: today }),
  BK_TS_WINS: complete({ code: 'BK_TS_WINS', ts: createdToday, createdAt: createdYesterday, date: tomorrow })
};

const daily = aggregate.aggregateBookingActivity(records, { range: 'daily', anchor: today });
const todayPoint = daily.points.find((point) => point.key === today);
assert.strictEqual(todayPoint.bookings, 5, 'booking today must count by canonical ts, including future serviceDate');
assert.strictEqual(todayPoint.cancellations, 1, 'cancelled booking remains booking history and cancellation series');
assert.strictEqual(todayPoint.refunds, 1, 'refunded booking remains booking history and refund series');
assert.strictEqual(daily.totals.bookings, 6, '30-day daily total includes yesterday-created booking too');
assert.strictEqual(daily.invalidRecords.test_or_mock, 2, 'testMode/mockPayment records are excluded');
assert.strictEqual(daily.invalidRecords.missing_created_server_timestamp, 2, 'missing server created timestamp is reported and excluded');
assert.strictEqual(daily.invalidRecords.excluded_status, 2, 'failed/draft records are excluded');
assert.strictEqual(daily.invalidRecords.missing_route, 1, 'incomplete records are excluded');

const yesterdayPoint = daily.points.find((point) => point.key === yesterday);
assert.strictEqual(yesterdayPoint.bookings, 1, 'booking yesterday and travel today must not increase today bucket');

const hourly = aggregate.aggregateBookingActivity(records, { range: 'hourly', anchor: today });
assert.strictEqual(hourly.points.length, 24);
assert.strictEqual(hourly.points.find((point) => point.key === `${today}T09`).bookings, 5);

const tsPriority = aggregate.createdTimestamp(records.BK_TS_WINS);
assert.strictEqual(tsPriority.field, 'ts', 'ts must be selected before createdAt');
assert.strictEqual(tsPriority.ms, createdToday);

const fallbackDisabled = aggregate.createdTimestamp(records.BK_CREATED_AT_ONLY);
assert.strictEqual(fallbackDisabled, null, 'createdAt cannot outrank missing ts unless explicitly enabled');

const bkkBoundary = aggregate.aggregateBookingActivity({
  BK_BKK_BOUNDARY: complete({ code: 'BK_BKK_BOUNDARY', ts: Date.parse('2026-07-27T23:30:00+00:00'), date: today })
}, { range: 'daily', anchor: today });
assert.strictEqual(bkkBoundary.points.find((point) => point.key === today).bookings, 1, 'Bangkok date before 07:00 UTC boundary must map to the correct local day');
const windowDaily = aggregate.queryWindow('daily', today);
assert.strictEqual(windowDaily.startMs, Date.parse('2026-06-29T00:00:00+07:00'), 'daily query starts 30 Bangkok dates including anchor');
assert.strictEqual(windowDaily.endMs, Date.parse('2026-07-28T23:59:59.999+07:00'), 'daily query ends at anchor Bangkok day');

const validated = readModel.validateResponse('daily', {
  status: 'ready',
  range: 'daily',
  timezone: 'Asia/Bangkok',
  points: daily.points,
  totals: daily.totals,
  generatedAt: 1
});
assert.deepStrictEqual(validated.totals, daily.totals, 'read model summary and graph use the same aggregate source');

assert.throws(() => readModel.validateResponse('daily', {
  status: 'ready',
  range: 'daily',
  timezone: 'Asia/Bangkok',
  points: daily.points,
  totals: daily.totals,
  phone: '0812345678'
}), /private field/, 'response must not expose phone');

assert.throws(() => readModel.validateResponse('daily', {
  status: 'ready',
  range: 'daily',
  timezone: 'Asia/Bangkok',
  points: daily.points.map((point, index) => index === 0 ? Object.assign({}, point, { name: 'Passenger' }) : point),
  totals: daily.totals
}), /private field/, 'response points must not expose name');

const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'booking-activity-read-model.js'), 'utf8');
assert(!/firebase\.database|\.ref\(['"]bookings['"]/.test(source), 'browser read model must not read bookings directly');
assert(source.includes('cache: \'no-store\''), 'refresh/read must not hide new bookings behind browser cache');

const adminHtml = require('fs').readFileSync(require('path').join(__dirname, '..', 'admin-erp.html'), 'utf8');
assert(adminHtml.includes("bookingActivityValue(model,'bookings')"), 'booking summary must use booking activity model totals');
assert(adminHtml.includes("source.refresh({range:state.bookingChartRange"), 'Dashboard refresh must refresh booking activity source');

const functionsIndex = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');
assert(functionsIndex.includes('exports.readBookingActivity = onRequest'), 'readBookingActivity HTTPS Function must exist');
assert(functionsIndex.includes('aggregateBookingActivity'), 'readBookingActivity must aggregate on the server');
assert(functionsIndex.includes('orderByChild("ts").startAt(window.startMs).endAt(window.endMs)'), 'Function must query by ts range');
assert(!functionsIndex.includes('ref("bookings").get()'), 'Function must not read the whole bookings root');
assert(functionsIndex.includes('origin_not_allowed'), 'Function must reject invalid/no-origin production requests');
assert(functionsIndex.includes('FUNCTIONS_EMULATOR === "true"'), 'localhost must be emulator-only');
assert(functionsIndex.includes('rate_limited'), 'Function must enforce rate limiting');
assert(functionsIndex.includes('maxInstances: 10'), 'Function must cap max instances');
assert(!/json\(\{[^}]*name\s*:|json\(\{[^}]*phone\s*:|rawBooking\s*:/.test(functionsIndex), 'Function response must not return private booking fields');

const rules = require('fs').readFileSync(require('path').join(__dirname, '..', 'database.rules.json'), 'utf8');
assert(rules.includes('"ts"'), 'database rules must index bookings.ts');

console.log('booking-activity-read-model.test.js OK');
