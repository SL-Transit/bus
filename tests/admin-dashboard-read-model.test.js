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
    cancellationContractStatus: 'ready',
    refundContractStatus: 'ready',
    createdDateSource: 'ts',
    travelDateSource: 'date/serviceDate',
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
  vehicles: [{ vehicleId: 'veh_001', vehicleAlias: 'car1', driverId: 'driver-1', driverDisplayName: 'นาย ก', queueId: 'Q1', bookingCount: 1, passengerCount: 2, grossAmount: 120, fareAmount: 110, serviceFeeAmount: 10, refundAmount: 0, netAmount: 120, paymentMethod: 'bank_transfer', approvalStatus: 'pending_approval', signatureStatus: 'waiting' }],
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
assert.strictEqual(validated.bookings.cancelledCount, 0);
assert.strictEqual(validated.bookings.refundedCount, 0);
assert.strictEqual(validated.bookings.createdDateSource, 'ts');
assert.strictEqual(validated.bookings.travelDateSource, 'date/serviceDate');
assert.strictEqual(validated.revenue.grossPassengerPayment, 120);
assert.strictEqual(validated.revenue.fareCollected, 110);
assert.strictEqual(validated.revenue.platformServiceFeeRevenue, 10);
assert.strictEqual(validated.vehicleSettlements.rows[0].bookingCount, 1);
assert.strictEqual(validated.vehicleSettlements.rows[0].vehicleAlias, 'car1');
assert.strictEqual(validated.vehicleSettlements.rows[0].driverDisplayName, 'นาย ก');
assert.strictEqual(validated.vehicleSettlements.rows[0].paymentMethod, 'bank_transfer');
assert.strictEqual(validated.vehicleSettlements.rows[0].approvalStatus, 'pending_approval');
assert.strictEqual(validated.vehicleSettlements.rows[0].signatureStatus, 'waiting');

assert.throws(() => model.validateResponse('hourly', Object.assign({}, response, { name: 'Private' })), /private field/);
assert.throws(() => model.validateResponse('hourly', Object.assign({}, response, { vehicles: [{ vehicleId: 'car1', firstName: 'Private' }] })), /private field/);
assert.throws(() => model.validateResponse('daily', response), /range mismatch/);

const unsupported = model.validateResponse('hourly', Object.assign({}, response, {
  bookings: Object.assign({}, response.bookings, {
    cancellationContractStatus: 'ready',
    refundContractStatus: 'unsupported_missing_refund_timestamp'
  })
}));
assert.strictEqual(unsupported.bookings.cancelledCount, 0);
assert.strictEqual(unsupported.bookings.refundedCount, null);
assert.strictEqual(unsupported.bookings.cancellationMessage, '');

const unavailableWebsite = model.validateResponse('hourly', Object.assign({}, response, {
  website: Object.assign({}, response.website, {
    status: 'unavailable',
    visitors: null,
    actualUsers: null,
    points: response.website.points.map((point) => Object.assign({}, point, { visitors: null, actualUsers: null }))
  })
}));
assert.strictEqual(unavailableWebsite.visits.status, 'unavailable');
assert.strictEqual(unavailableWebsite.visits.visitors, null);
assert.strictEqual(unavailableWebsite.visits.actualUsers, null);
assert.strictEqual(unavailableWebsite.visits.points[9].visitors, null);

(async () => {
  model._clearCacheForTest();
  global.firebase = { auth: () => ({ currentUser: null }) };
  const unauth = await model.refresh({ range: 'hourly', anchor: '2026-07-28' });
  assert.strictEqual(unauth.status, 'auth_required');

  let authorizationHeader = '';
  global.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 'ID_TOKEN_FOR_TEST' } }) };
  global.fetch = async (url, options) => {
    authorizationHeader = options.headers.Authorization;
    return { ok: true, status: 200, json: async () => response };
  };
  const authed = await model.refresh({ range: 'hourly', anchor: '2026-07-28' });
  assert.strictEqual(authorizationHeader, 'Bearer ID_TOKEN_FOR_TEST');
  assert.strictEqual(authed.status, 'ready');
  delete global.fetch;
  delete global.firebase;

  console.log('admin-dashboard-read-model.test.js OK');
})();
