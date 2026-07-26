const assert = require('assert');
const model = require('../screen01-central-read-model');

const SERVICE_DATE = '2026-07-27';
const NOW = Date.parse('2026-07-27T10:10:00+07:00');
const GPS_STALE_MS = 10 * 60 * 1000;

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
    BK1_OLD: { bookingId: 'BK1', date: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 100, updatedAt: 1 },
    BK1: { bookingId: 'BK1', date: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 120, updatedAt: 2 },
    BK2: { bookingId: 'BK2', date: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'unpaid', canonicalPaidAmount: 200 },
    BK3: { bookingId: 'BK3', date: SERVICE_DATE, status: 'cancelled', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 300 },
    BK4: { bookingId: 'BK4', date: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid' },
    BK5: { bookingId: 'BK5', date: SERVICE_DATE, status: 'confirmed', canonicalRefundStatus: 'pending', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 50 },
    BK6: { bookingId: 'BK6', date: SERVICE_DATE, status: 'confirmed', canonicalRefundStatus: 'completed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 60 },
    BK8: { bookingId: 'BK8', date: SERVICE_DATE, status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 100, canonicalRefundAmount: 40 },
    OTHER_DATE: { bookingId: 'BK7', date: '2026-07-28', status: 'confirmed', canonicalPaymentStatus: 'paid', canonicalPaidAmount: 70 },
  },
  liveVehicles: {
    car1: { vehicleId: 'car1', lat: 13.1, lng: 101.1, gpsTimestamp: NOW - 30_000 },
    car2: { vehicleId: 'car2', lat: 13.2, lng: 101.2, gpsTimestamp: NOW - 900_000 },
    car3: { vehicleId: 'car3' },
    car4: { vehicleId: 'car4', lat: 13.4, lng: 101.4, gpsTimestamp: NOW - 30_000 },
  },
  driverWork: {
    car1: { vehicleId: 'car1', status: 'active', activeTripId: 'TRIP1' },
    car2: { vehicleId: 'car2', status: 'active', activeTripId: 'TRIP2' },
    car3: { vehicleId: 'car3', status: 'active', activeTripId: 'TRIP3' },
    car5: { vehicleId: 'car5', status: 'active', activeTripId: 'TRIP5' },
  },
};

const safeRuntime = model.build(raw, { serviceDate: SERVICE_DATE, nowMs: NOW, gpsStaleMs: GPS_STALE_MS });
assert.strictEqual(safeRuntime.bookings.status, 'proposed', 'readable proposed booking source must not be marked confirmed/resolved');
assert.strictEqual(safeRuntime.bookings.count, 7, 'deduped selected-date bookings only');
assert.strictEqual(safeRuntime.revenue.status, 'unresolved', 'revenue must stay unresolved without confirmed payment contract');
assert.strictEqual(safeRuntime.refunds.status, 'unresolved', 'refunds must stay unresolved without confirmed refund contract');
assert.deepStrictEqual(safeRuntime.legacyRejected, ['bookings'], 'legacy /bookings fallback must be rejected');

assert.strictEqual(safeRuntime.fleet.status, 'proposed', 'vehicle runtime remains proposed until owner confirms source contract');
assert.strictEqual(safeRuntime.fleet.vehicles.length, 5, 'fleet must be the union of liveVehicles and driverWork vehicle IDs');
assert.strictEqual(safeRuntime.fleet.activeServiceCount, 4, 'Dashboard KPI must use active-service count');
assert.strictEqual(safeRuntime.fleet.operational.active_service, 4, 'active service includes stale or missing GPS when driver work is active');
assert.strictEqual(safeRuntime.fleet.operational.unknown, 1, 'fresh GPS without driver work is unknown operational state');
assert.strictEqual(safeRuntime.fleet.telemetry.live_gps, 2, 'fresh GPS telemetry is separate from operation state');
assert.strictEqual(safeRuntime.fleet.telemetry.stale_gps, 1, 'active service with stale GPS remains active_service plus stale_gps');
assert.strictEqual(safeRuntime.fleet.telemetry.missing_gps, 2, 'active driver work without live record appears as missing_gps');
assert.strictEqual(safeRuntime.fleet.vehicles.find((item) => item.vehicleId === 'car5').operationalState, 'active_service');
assert.strictEqual(safeRuntime.fleet.vehicles.find((item) => item.vehicleId === 'car5').telemetryState, 'missing_gps');
assert.strictEqual(safeRuntime.fleet.vehicles.find((item) => item.vehicleId === 'car4').operationalState, 'unknown', 'inactive/unknown vehicle with fresh GPS must not count as active service');
assert.strictEqual(safeRuntime.fleet.gpsFreshness.status, 'proposed', 'default GPS freshness rule is proposed unless contract is passed');
assert(safeRuntime.chartProportions.fleet.some((item) => item.key === 'active_service' && item.percent === 80), 'fleet chart proportions must use operational state counts');
assert(safeRuntime.chartProportions.gps.some((item) => item.key === 'missing_gps' && item.percent === 40), 'GPS chart proportions must use telemetry state counts');

const confirmedFixture = model.build(raw, { serviceDate: SERVICE_DATE, nowMs: NOW, gpsStaleMs: GPS_STALE_MS, paymentContract, refundContract });
assert.strictEqual(confirmedFixture.revenue.amount, 230, 'paid revenue excludes unpaid, cancelled, completed refund, missing amount, and subtracts partial refund by contract');
assert.strictEqual(confirmedFixture.refunds.count, 1, 'only pending refund status is counted');

const empty = model.build({ bookings: {}, liveVehicles: {}, driverWork: {} }, { serviceDate: SERVICE_DATE, nowMs: NOW });
assert.strictEqual(empty.bookings.status, 'empty', 'confirmed empty source must be distinct from read error');
assert.strictEqual(empty.bookings.count, 0);
assert.strictEqual(empty.fleet.status, 'empty');
assert.strictEqual(empty.health.GPS, 'ไม่มีข้อมูล');

const unavailable = model.build({ sources: {} }, { serviceDate: SERVICE_DATE, nowMs: NOW });
assert.strictEqual(unavailable.bookings.status, 'unavailable', 'missing Firebase/config/adapter returns unavailable, not empty');
assert.strictEqual(unavailable.bookings.count, null);

const failed = model.build({
  sources: {
    bookings: { status: 'error', path: 'operations/bookings', value: {}, error: 'permission denied' },
    liveVehicles: { status: 'error', path: 'operations/liveVehicles', value: {}, error: 'permission denied' },
    driverWork: { status: 'error', path: `operations/driverWorkByServiceDate/${SERVICE_DATE}`, value: {}, error: 'permission denied' },
    notificationEvents: { status: 'error', path: 'operations/notificationEvents', value: {}, error: 'permission denied' },
    erpAudit: { status: 'error', path: 'data/erpDataCenter/meta/audit', value: {}, error: 'permission denied' },
  },
}, { serviceDate: SERVICE_DATE, nowMs: NOW });
assert.strictEqual(failed.bookings.status, 'error', 'Firebase permission/read failure must not become count 0');
assert.strictEqual(failed.bookings.count, null);
assert.strictEqual(failed.health.Booking, 'อ่านข้อมูลไม่ได้');
assert.strictEqual(failed.fleet.status, 'error');
assert.strictEqual(failed.fleet.activeServiceCount, null);

let wrote = false;
const calls = [];
function refFor(pathName) {
  const query = {
    pathName,
    once(event) {
      calls.push({ path: pathName, event, query: this.query || null, limit: this.limit || null });
      assert.strictEqual(event, 'value');
      return Promise.resolve({ val: () => ({}) });
    },
    orderByChild(child) {
      this.query = { orderByChild: child };
      return this;
    },
    equalTo(value) {
      this.query.equalTo = value;
      return this;
    },
    limitToLast(limit) {
      this.limit = limit;
      return this;
    },
    set() { wrote = true; },
    update() { wrote = true; },
    push() { wrote = true; },
    remove() { wrote = true; },
  };
  return query;
}
const db = {
  ref(pathName) {
    assert.notStrictEqual(pathName, 'bookings', 'must not read legacy /bookings fallback');
    assert.notStrictEqual(pathName, `operations/driverTicketsByServiceDate/${SERVICE_DATE}`, 'unused driverTickets source must not be read');
    return refFor(pathName);
  },
};

model.load(db, { serviceDate: SERVICE_DATE, nowMs: NOW }).then((loaded) => {
  assert.strictEqual(wrote, false, 'central read model must not perform Firebase writes');
  const bookingCall = calls.find((call) => call.path === 'operations/bookings');
  assert.deepStrictEqual(bookingCall.query, { orderByChild: 'date', equalTo: SERVICE_DATE }, 'service-date source/query must be used');
  assert.strictEqual(calls.find((call) => call.path === 'operations/notificationEvents').limit, 50, 'notification reads must be limited');
  assert.strictEqual(calls.find((call) => call.path === 'data/erpDataCenter/meta/audit').limit, 50, 'audit reads must be limited');
  assert.strictEqual(loaded.sources.bookings.status, 'empty');
  console.log('screen01 central read model ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
