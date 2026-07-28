const assert = require('assert');
const model = require('../admin-dashboard-read-model.js');

const response = {
  status: 'ready',
  timezone: 'Asia/Bangkok',
  range: 'hourly',
  anchor: '2026-07-28',
  website: {
    visitors: 2,
    actualUsers: 1,
    points: Array.from({ length: 24 }, (_, hour) => ({
      key: `2026-07-28T${String(hour).padStart(2, '0')}`,
      label: `${String(hour).padStart(2, '0')}:00`,
      visitors: hour === 9 ? 2 : 0,
      actualUsers: hour === 9 ? 1 : 0
    }))
  },
  bookings: {
    createdCount: 1,
    travelPassengerCount: 2,
    cancelledCount: 0,
    refundedCount: 0,
    points: Array.from({ length: 24 }, (_, hour) => ({
      key: `2026-07-28T${String(hour).padStart(2, '0')}`,
      label: `${String(hour).padStart(2, '0')}:00`,
      bookings: hour === 9 ? 1 : 0,
      cancellations: 0,
      refunds: 0
    }))
  },
  finance: {
    grossAmount: 120,
    fareAmount: 110,
    serviceFeeAmount: 10,
    refundAmount: 0,
    netAmount: 120
  },
  vehicles: [{ vehicleId: 'van-1', driverId: 'driver-1', queueId: 'Q1', bookingCount: 1, passengerCount: 2, grossAmount: 120, fareAmount: 110, serviceFeeAmount: 10, refundAmount: 0, netAmount: 120 }],
  queues: [],
  routes: [],
  generatedAt: 1
};

const validated = model.validateResponse('hourly', response);
assert.strictEqual(validated.visits.points[9].key, '2026-07-28T09');
assert.strictEqual(validated.visits.points[9].label, '09:00');
assert.strictEqual(validated.visits.points[9].visitors, 2);
assert.strictEqual(validated.visits.points[9].actualUsers, 1);
assert.strictEqual(validated.bookings.points[9].bookings, 1);
assert.strictEqual(validated.revenue.grossPassengerPayment, 120);
assert.strictEqual(validated.revenue.fareCollected, 110);
assert.strictEqual(validated.revenue.platformServiceFeeRevenue, 10);
assert.strictEqual(validated.vehicleSettlements.rows[0].bookingCount, 1);

assert.throws(() => model.validateResponse('hourly', Object.assign({}, response, { name: 'Private' })), /private field/);
assert.throws(() => model.validateResponse('daily', response), /range mismatch/);

console.log('admin-dashboard-read-model.test.js OK');
