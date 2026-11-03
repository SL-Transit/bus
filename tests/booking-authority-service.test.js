'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingAuthority } = require('../functions/booking-authority-service');
const bookingTimeAuthority = require('../functions/booking-time-authority');
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
function harness() {
  const records = new Map(); let reads = 0, policy = {};
  const snapshot = value => ({ val: () => clone(value), child: name => snapshot(name.split('/').reduce((v, key) => v && v[key], value)) });
  const db = { ref(path) { return {
    async get() { reads++; return snapshot(records.get(path)); },
    async transaction(update) {
      const current = clone(records.get(path)), next = update(current);
      if (next === undefined) return { committed: false, snapshot: snapshot(current) };
      records.set(path, clone(next)); return { committed: true, snapshot: snapshot(next) };
    }
  }; } };
  const validCapacityPart = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
  const pair = { routeId: 'synthetic_route', scheduleOfferId: 'synthetic_trip', scheduleRowId: 'synthetic_schedule', departureTime: '09:00', fareAmount: 100, fareContract: { serviceFeeAmount: 5 } };
  const deps = { db, serverTimestamp: { '.sv': 'timestamp' }, maxCapacityLimit: 300, bookingTimeAuthority,
    readSystemTestMode: async () => policy,
    readCanonicalWorkbookSource: async () => ({ ready: true, manifest: { schemaVersion: 'synthetic' }, pair }),
    canonicalWorkbookReady: source => source.ready === true,
    findCanonicalWorkbookPair: source => source.pair,
    resolvePublishedCapacity: async () => ({ capacityLimit: 1, bookedSeats: 0, seatsAvailable: 1, bookings: {} }),
    cleanBookingText: (value, max) => String(value == null ? '' : value).trim().slice(0, max), validCapacityPart,
    capacityCounterPath: (date, key) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && validCapacityPart(key, 240) ? 'operations/bookingCapacityByServiceDate/' + date + '/' + key : null };
  return { records, deps, service: createBookingAuthority(deps), reads: () => reads, policy: value => { policy = value; } };
}
const reserve = (extra = {}) => ({ serviceDate: '2027-01-15', capacityKey: 'synthetic_shared_trip', bookingCode: 'SYNTHETIC_A', requestedSeats: 1, tripKey: 'synthetic_trip', pairKey: 'synthetic_pair', ...extra });
const booking = (extra = {}) => ({ code: 'SYNTHETIC_A', pax: 2, date: '2027-01-15', phone: '0890000000', name: 'ผู้โดยสารจำลอง', tripId: 'synthetic_trip', time: '09:00', pickupTime: '09:00', fareAmount: 100, price: 210, fare: 210, paymentMode: 'onsite', ...extra });
test('shared authority requires dependencies and a verified owner before database work', async () => {
  assert.throws(() => createBookingAuthority(), /dependencies_required/);
  const h = harness();
  await assert.rejects(() => h.service.reserve({ ownerUid: '', body: reserve() }), /verified_booking_owner_required/);
  await assert.rejects(() => h.service.create({ ownerUid: null, booking: booking() }), /verified_booking_owner_required/);
  assert.equal(h.reads(), 0); assert.equal(h.records.size, 0);
});
test('system test gate runs before parsing input for both existing commands', async () => {
  const h = harness(); h.policy({ enabled: true });
  for (const method of ['reserve', 'create']) {
    const result = await h.service[method]({ ownerUid: 'verified_user', readInput() { throw Error('must not parse'); } });
    assert.equal(result.statusCode, 503); assert.equal(result.body.error, 'system_test_mode_enabled');
  }
  assert.equal(h.records.size, 0);
});
test('separate callers share one server capacity and client cannot enlarge it', async () => {
  const h = harness(), lineEntry = createBookingAuthority(h.deps);
  const first = await h.service.reserve({ ownerUid: 'web_user', body: reserve({ capacityLimit: 999 }) });
  assert.equal(first.statusCode, 200); assert.equal(first.body.capacityLimit, 1);
  const second = await lineEntry.reserve({ ownerUid: 'line_mapped_user', body: reserve({ bookingCode: 'SYNTHETIC_B' }) });
  assert.equal(second.statusCode, 409); assert.equal(second.body.error, 'capacity_full_or_not_ready');
});
test('reservation repeat is stable and release cannot cross owners or over-decrement', async () => {
  const h = harness();
  await h.service.reserve({ ownerUid: 'owner_a', body: reserve() });
  await h.service.reserve({ ownerUid: 'owner_a', body: reserve() });
  const path = 'operations/bookingCapacityByServiceDate/2027-01-15/synthetic_shared_trip';
  assert.equal(h.records.get(path).bookedSeats, 1);
  const other = await h.service.reserve({ ownerUid: 'owner_b', body: reserve() }); assert.equal(other.statusCode, 409);
  await h.service.reserve({ ownerUid: 'owner_b', body: reserve({ action: 'release' }) });
  assert.equal(h.records.get(path).bookedSeats, 1);
  await h.service.reserve({ ownerUid: 'owner_a', body: reserve({ action: 'release' }) });
  await h.service.reserve({ ownerUid: 'owner_a', body: reserve({ action: 'release' }) });
  assert.equal(h.records.get(path).bookedSeats, 0);
});
test('create rejects changed price and departure time before writing', async () => {
  const h = harness();
  const price = await h.service.create({ ownerUid: 'verified_user', booking: booking({ price: 1, fare: 1 }) });
  assert.equal(price.statusCode, 409); assert.equal(price.body.error, 'authoritative_price_mismatch');
  const time = await h.service.create({ ownerUid: 'verified_user', booking: booking({ time: '08:00', pickupTime: '08:00' }) });
  assert.equal(time.statusCode, 409); assert.equal(time.body.error, 'authoritative_time_mismatch');
  assert.equal(h.records.size, 0);
});
test('create uses verified ownership and canonical snapshot; duplicate code cannot overwrite', async () => {
  const h = harness();
  const result = await h.service.create({ ownerUid: 'verified_user', booking: booking({ ownerUid: 'client_forged', routeId: 'client_forged' }) });
  assert.equal(result.statusCode, 201); const saved = result.body.booking;
  assert.equal(saved.ownerUid, 'verified_user'); assert.equal(saved.routeId, 'synthetic_route');
  assert.equal(saved.tripId, 'synthetic_trip'); assert.equal(saved.time, '09:00'); assert.equal(saved.price, 210); assert.equal(saved.paymentStatus, 'pay_on_site');
  const duplicate = await h.service.create({ ownerUid: 'different_user', booking: booking({ name: 'different' }) });
  assert.equal(duplicate.statusCode, 409); assert.equal(h.records.get('bookings/SYNTHETIC_A').ownerUid, 'verified_user');
});
test('create still requires canonical trip identity and ready source', async () => {
  const h = harness();
  const noTrip = await h.service.create({ ownerUid: 'verified_user', booking: booking({ tripId: '' }) });
  assert.equal(noTrip.statusCode, 409); assert.equal(noTrip.body.error, 'canonical_trip_identity_required');
  h.deps.readCanonicalWorkbookSource = async () => ({ ready: false, manifest: {} });
  const unavailable = createBookingAuthority(h.deps);
  const result = await unavailable.create({ ownerUid: 'verified_user', booking: booking() });
  assert.equal(result.statusCode, 409); assert.equal(result.body.error, 'canonical_workbook_source_not_ready');
  assert.equal(h.records.size, 0);
});
