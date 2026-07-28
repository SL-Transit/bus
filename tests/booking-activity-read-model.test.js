const assert = require('assert');
const readModel = require('../booking-activity-read-model.js');
const aggregate = require('../functions/booking-activity-aggregate.js');

const BKK = '+07:00';
const today = '2026-07-28';
const tomorrow = '2026-07-29';
const yesterday = '2026-07-27';
const createdToday = Date.parse(`${today}T09:00:00${BKK}`);
const createdYesterday = Date.parse(`${yesterday}T23:00:00${BKK}`);

const records = {
  BK_TODAY_TRAVEL_TODAY: { code: 'BK_TODAY_TRAVEL_TODAY', createdAt: createdToday, date: today, status: 'confirmed' },
  BK_TODAY_TRAVEL_FUTURE: { code: 'BK_TODAY_TRAVEL_FUTURE', createdAtMs: createdToday + 60000, serviceDate: tomorrow, status: 'confirmed' },
  BK_YESTERDAY_TRAVEL_TODAY: { code: 'BK_YESTERDAY_TRAVEL_TODAY', createdAt: createdYesterday, date: today, status: 'confirmed' },
  BK_CANCELLED_TODAY: { code: 'BK_CANCELLED_TODAY', ts: createdToday + 120000, date: tomorrow, status: 'cancelled' },
  BK_REFUNDED_TODAY: { code: 'BK_REFUNDED_TODAY', createdAt: createdToday + 180000, date: tomorrow, paymentStatus: 'refunded' },
  BK_TEST_MODE: { code: 'BK_TEST_MODE', createdAt: createdToday, date: today, testMode: true },
  BK_MOCK_PAYMENT: { code: 'BK_MOCK_PAYMENT', createdAt: createdToday, date: today, mockPayment: true },
  BK_NO_CREATED: { code: 'BK_NO_CREATED', date: today, status: 'confirmed' }
};

const daily = aggregate.aggregateBookingActivity(records, { range: 'daily', anchor: today });
const todayPoint = daily.points.find((point) => point.key === today);
assert.strictEqual(todayPoint.bookings, 4, 'booking today must count by createdDate, including future serviceDate');
assert.strictEqual(todayPoint.cancellations, 1, 'cancelled booking remains booking history and cancellation series');
assert.strictEqual(todayPoint.refunds, 1, 'refunded booking remains booking history and refund series');
assert.strictEqual(daily.totals.bookings, 5, '30-day daily total includes yesterday-created booking too');
assert.strictEqual(daily.invalidRecords.test_or_mock, 2, 'testMode/mockPayment records are excluded');
assert.strictEqual(daily.invalidRecords.missing_created_server_timestamp, 1, 'missing server created timestamp is reported and excluded');

const yesterdayPoint = daily.points.find((point) => point.key === yesterday);
assert.strictEqual(yesterdayPoint.bookings, 1, 'booking yesterday and travel today must not increase today bucket');

const hourly = aggregate.aggregateBookingActivity(records, { range: 'hourly', anchor: today });
assert.strictEqual(hourly.points.length, 24);
assert.strictEqual(hourly.points.find((point) => point.key === `${today}T09`).bookings, 4);

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
assert(!/json\(\{[^}]*name\s*:|json\(\{[^}]*phone\s*:|rawBooking\s*:/.test(functionsIndex), 'Function response must not return private booking fields');

console.log('booking-activity-read-model.test.js OK');
