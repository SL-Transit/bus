const assert = require('assert');
const model = require('../screen01-central-read-model');

const SERVICE_DATE = '2026-07-27';
const NOW = Date.parse('2026-07-27T10:10:00+07:00');

const paymentContract = {
  confirmed: true,
  amountField: 'canonicalPaidAmount',
  paymentStatusField: 'canonicalPaymentStatus',
  paidStatuses: ['paid'],
  bookingStatusField: 'status',
  cancelledStatuses: ['cancelled', 'refunded'],
  refundStatusField: 'canonicalRefundStatus',
  completedRefundStatuses: ['completed'],
  refundAmountField: 'canonicalRefundAmount',
};

const refundContract = {
  confirmed: true,
  statusField: 'canonicalRefundStatus',
  pendingStatuses: ['pending'],
};

const raw = {
  bookings: {
    BK1_OLD: { bookingId: 'BK1', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 100, updatedAt: 1 },
    BK1: { bookingId: 'BK1', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 120, updatedAt: 2 },
    BK2: { bookingId: 'BK2', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'unpaid', canonicalPaidAmount: 200 },
    BK3: { bookingId: 'BK3', serviceDate: SERVICE_DATE, status: 'cancelled', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 300 },
    BK4: { bookingId: 'BK4', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid' },
    BK5: { bookingId: 'BK5', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalRefundStatus: 'pending', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 50 },
    BK6: { bookingId: 'BK6', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalRefundStatus: 'completed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 60 },
    BK8: { bookingId: 'BK8', serviceDate: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 100, canonicalRefundAmount: 40 },
    OTHER_DATE: { bookingId: 'BK7', serviceDate: '2026-07-28', status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 70 },
  },
  liveVehicles: {
    car1: { vehicleId: 'car1', lat: 13.1, lng: 101.1, gpsTimestamp: NOW - 30_000 },
    car2: { vehicleId: 'car2', lat: 13.2, lng: 101.2, gpsTimestamp: NOW - 600_000 },
    car3: { vehicleId: 'car3', gpsTimestamp: NOW - 30_000 },
    car4: { vehicleId: 'car4', lat: 13.4, lng: 101.4, gpsTimestamp: NOW - 30_000 },
  },
  driverWork: {
    car1: { vehicleId: 'car1', status: 'active', activeTripId: 'TRIP1' },
    car2: { vehicleId: 'car2', status: 'active', activeTripId: 'TRIP2' },
    car3: { vehicleId: 'car3', status: 'active', activeTripId: 'TRIP3' },
    car4: { vehicleId: 'car4', status: 'idle' },
  },
};

const safeRuntime = model.build(raw, { serviceDate: SERVICE_DATE, nowMs: NOW });
assert.strictEqual(safeRuntime.bookings.count, 7, 'deduped selected-date bookings only');
assert.strictEqual(safeRuntime.revenue.status, 'unresolved', 'revenue must stay unresolved without confirmed payment contract');
assert.strictEqual(safeRuntime.refunds.status, 'unresolved', 'refunds must stay unresolved without confirmed refund contract');
assert.deepStrictEqual(safeRuntime.legacyRejected, ['bookings'], 'legacy /bookings fallback must be rejected');

const confirmedFixture = model.build(raw, { serviceDate: SERVICE_DATE, nowMs: NOW, paymentContract, refundContract });
assert.strictEqual(confirmedFixture.revenue.amount, 230, 'paid revenue excludes unpaid, cancelled, completed refund, missing amount, and subtracts partial refund by contract');
assert.strictEqual(confirmedFixture.refunds.count, 1, 'only pending refund status is counted');
assert.strictEqual(confirmedFixture.fleet.runningCount, 1, 'running vehicle requires active work and fresh GPS');
assert.strictEqual(confirmedFixture.fleet.byStatus.stale_gps, 1, 'stale GPS is separated');
assert.strictEqual(confirmedFixture.fleet.byStatus.missing_gps, 1, 'missing GPS is separated');
assert.strictEqual(confirmedFixture.fleet.byStatus.inactive, 1, 'GPS without active work is inactive');
assert(confirmedFixture.chartProportions.bookings.some((item) => item.percent > 0), 'booking chart proportions must come from fixture values');
assert(confirmedFixture.chartProportions.fleet.some((item) => item.key === 'running' && item.percent === 25), 'fleet chart proportions must change with fixture values');

const empty = model.build({ bookings: {}, liveVehicles: {}, driverWork: {} }, { serviceDate: SERVICE_DATE, nowMs: NOW });
assert.strictEqual(empty.bookings.status, 'empty');
assert.strictEqual(empty.fleet.status, 'empty');
assert.strictEqual(empty.health.GPS, 'ไม่มีข้อมูล');

let wrote = false;
const db = {
  ref(path) {
    assert.notStrictEqual(path, 'bookings', 'must not read legacy /bookings fallback');
    return {
      once(event) {
        assert.strictEqual(event, 'value');
        return Promise.resolve({ val: () => ({}) });
      },
      set() { wrote = true; },
      update() { wrote = true; },
      push() { wrote = true; },
      remove() { wrote = true; },
    };
  },
};

model.load(db, { serviceDate: SERVICE_DATE }).then(() => {
  assert.strictEqual(wrote, false, 'central read model must not perform Firebase writes');
  console.log('screen01 central read model ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
