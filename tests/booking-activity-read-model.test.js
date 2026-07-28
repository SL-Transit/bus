const assert = require('assert');
const model = require('../booking-activity-read-model.js');

const hourly = model.snapshot({ range: 'hourly' });
assert.strictEqual(hourly.status, 'unavailable');

const loading = model.snapshot({ range: 'daily' });
assert.strictEqual(loading.status, 'loading');

model._setCacheForTest({
  BK001: { date: '2026-07-20', status: 'awaiting_payment', paymentStatus: 'pay_on_site', pax: 2 },
  BK002: { date: '2026-07-20', status: 'cancelled', paymentStatus: 'awaiting_payment', pax: 1 },
  BK003: { date: '2026-07-21', status: 'awaiting_payment', paymentStatus: 'refunded', pax: 3 }
}, 'ready');

const daily = model.snapshot({ range: 'daily' });
assert.strictEqual(daily.status, 'ready');
assert.strictEqual(daily.bookingCount, 3);
assert.strictEqual(daily.cancelledCount, 1);
assert.strictEqual(daily.refundedCount, 1);
assert.strictEqual(daily.passengerCount, 6); // 2 + 1 + 3

const day1 = daily.points.find(p => p.key === '2026-07-20');
assert.deepStrictEqual(day1, { key: '2026-07-20', bookings: 2, cancellations: 1, refunds: 0 });

const day2 = daily.points.find(p => p.key === '2026-07-21');
assert.deepStrictEqual(day2, { key: '2026-07-21', bookings: 1, cancellations: 0, refunds: 1 });

console.log('booking-activity-read-model.test.js OK');
