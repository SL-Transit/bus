'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingAuthority } = require('../functions/booking-authority-service');
const { createBookingCommandService, commandIdentity } = require('../functions/booking-command-service');
const bookingTimeAuthority = require('../functions/booking-time-authority');
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const OWNER = 'verified_synthetic_owner', REQUEST = 'a'.repeat(64);
const input = (extra = {}) => ({ pairKey: 'fare_fixture', tripId: 'trip_fixture', date: '2027-01-15', pax: 1,
  name: 'ผู้ทดสอบจำลอง', phone: '0890000000', time: '09:00', pickupTime: '09:00', fareAmount: 100, fare: 100, price: 100, paymentMode: 'onsite', ...extra });
function harness(options = {}) {
  let time = 1800000000000, policy = {}, listeners = 0;
  const rows = new Map(), faults = {}, stats = { creates: 0, reserves: 0, prepares: 0, bookingWrites: 0 };
  const snap = value => ({ val: () => copy(value), child: name => snap(name.split('/').reduce((v, key) => v && v[key], value)) });
  const db = { ref(path) { return {
    on() { listeners++; }, off() { listeners--; }, async once() { return snap(rows.get(path)); },
    async get() { if (faults.readPath === path) { delete faults.readPath; throw Error('synthetic_read_failure'); } return snap(rows.get(path)); },
    async transaction(update) {
      const before = copy(rows.get(path)), value = update(before);
      if (value === undefined) return { committed: false, snapshot: snap(before) };
      if (path.startsWith('bookings/') && before == null && value != null) stats.bookingWrites++;
      rows.set(path, copy(value)); return { committed: true, snapshot: snap(value) };
    }
  }; } };
  const validPart = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
  const pair = { pairKey: 'fare_fixture', pairId: 'fare_fixture', routeId: 'route_fixture', scheduleOfferId: 'trip_fixture', scheduleRowId: 'schedule_fixture',
    departureTime: '09:00', fareAmount: 100, fareContract: { serviceFeeAmount: 0 } };
  const raw = createBookingAuthority({ db, serverTimestamp: { '.sv': 'timestamp' }, bookingTimeAuthority,
    readSystemTestMode: async () => policy,
    readCanonicalWorkbookSource: async () => ({ ready: true, manifest: { schemaVersion: 'synthetic' }, pair }),
    canonicalWorkbookReady: source => source.ready === true,
    findCanonicalWorkbookPair: (source, booking) => booking.pairKey === 'fare_fixture' && booking.tripId === 'trip_fixture' ? source.pair : null,
    resolvePublishedCapacity: async () => ({ sourceRowId: 'schedule_fixture', capacityLimit: options.capacity || 3, bookedSeats: 0, seatsAvailable: options.capacity || 3, bookings: {} }),
    cleanBookingText: (value, max) => String(value == null ? '' : value).trim().slice(0, max), validCapacityPart: validPart,
    capacityCounterPath: (date, key) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && validPart(key, 240) ? 'operations/bookingCapacityByServiceDate/' + date + '/' + key : null });
  const authority = {
    async prepare(args) { stats.prepares++; return raw.prepare(args); },
    async reserve(args) { stats.reserves++; const result = await raw.reserve(args); if (faults.reserveAfter) { delete faults.reserveAfter; throw Error('synthetic_lost_reserve_response'); } return result; },
    async create(args) {
      stats.creates++;
      if (faults.createBefore) { delete faults.createBefore; throw Error('synthetic_before_create'); }
      const result = await raw.create(args);
      if (faults.createAfter) { delete faults.createAfter; throw Error('synthetic_lost_create_response'); }
      if (faults.expireDuringCreate) { delete faults.expireDuringCreate; time += 30001; }
      return result;
    }
  };
  const service = createBookingCommandService({ enabled: true, db, authority, clock: () => time, maxAttempts: options.maxAttempts || 5 });
  const identity = commandIdentity(OWNER, REQUEST);
  const counterPath = 'operations/bookingCapacityByServiceDate/2027-01-15/2027-01-15__fare_fixture__09_00';
  return { service, authority, raw, rows, faults, stats, identity, counterPath,
    confirm: (booking = input(), extra = {}) => service.confirm({ ownerUid: OWNER, requestId: REQUEST, booking, ...extra }),
    advance: ms => { time += ms; }, policy: value => { policy = value; },
    record: () => copy(rows.get(identity.ledgerPath)), stored: () => copy(rows.get('bookings/' + identity.bookingCode)),
    counter: () => copy(rows.get(counterPath)), listeners: () => listeners };
}
test('command is disabled by default and refuses invalid identity or oversized input', async () => {
  assert.equal((await createBookingCommandService().confirm({})).status, 'disabled');
  const h = harness();
  assert.equal((await h.confirm(input(), { requestId: 'not_a_request' })).status, 'invalid_request');
  assert.equal((await h.confirm(input({ name: 'x'.repeat(17000) }))).status, 'invalid_request');
  assert.equal(h.rows.size, 0);
});
test('trusted command seals canonical owner/seats/trip and returns the original receipt on replay', async () => {
  const h = harness(); const result = await h.confirm();
  assert.equal(result.status, 'confirmed'); assert.equal(h.stored().source, 'line_chat');
  assert.equal(h.stored().ownerUid, OWNER); assert.equal(h.stored().capacity.counterPath, h.counterPath);
  assert.equal(h.counter().bookings[h.identity.bookingCode].status, 'committed');
  const replay = await h.confirm(); assert.equal(replay.status, 'confirmed'); assert.equal(replay.replay, true);
  assert.deepEqual(replay.receipt, result.receipt); assert.equal(h.stats.bookingWrites, 1); assert.equal(h.stats.creates, 1);
  const ledger = JSON.stringify(h.record()); assert.ok(!ledger.includes(input().phone)); assert.ok(!ledger.includes(input().name));
  assert.equal(h.listeners(), 0);
});
test('server derives the shared counter and ignores supplied code owner and capacity path', async () => {
  const h = harness(); const result = await h.confirm(input({ code: 'CLIENT_CODE', ownerUid: 'forged', capacity: { counterPath: 'attacker/root' } }));
  assert.equal(result.status, 'confirmed'); assert.equal(result.receipt.bookingCode, h.identity.bookingCode);
  assert.equal(h.stored().capacity.counterPath, h.counterPath); assert.equal(h.rows.has('bookings/CLIENT_CODE'), false);
  assert.equal(h.rows.has('attacker/root'), false);
});
test('lost create response recovers the stored booking without another insert or ordinary release', async () => {
  const h = harness(); h.faults.createAfter = true;
  assert.equal((await h.confirm()).status, 'needs_reconciliation'); assert.equal(h.stats.bookingWrites, 1);
  assert.equal(h.counter().bookings[h.identity.bookingCode].status, 'committing');
  const release = await h.raw.reserve({ ownerUid: OWNER, body: { ...h.record().capacity, action: 'release' } });
  assert.equal(release.statusCode, 409); assert.equal(h.counter().bookedSeats, 1);
  assert.equal((await h.confirm()).status, 'busy'); h.advance(30001);
  assert.equal((await h.confirm()).status, 'confirmed'); assert.equal(h.stats.creates, 1); assert.equal(h.stats.bookingWrites, 1);
  assert.equal((await h.raw.reserve({ ownerUid: OWNER, body: { ...h.record().capacity, action: 'release' } })).statusCode, 409);
});
test('lost reserve response recovers the exact reservation before creating once', async () => {
  const h = harness(); h.faults.reserveAfter = true;
  assert.equal((await h.confirm()).status, 'needs_reconciliation'); assert.equal(h.stats.bookingWrites, 0); assert.equal(h.counter().bookedSeats, 1);
  h.advance(30001); assert.equal((await h.confirm()).status, 'confirmed');
  assert.equal(h.stats.reserves, 1); assert.equal(h.stats.bookingWrites, 1);
});
test('failure before create retains the sealed seat and safely retries the same absent code', async () => {
  const h = harness(); h.faults.createBefore = true;
  assert.equal((await h.confirm()).status, 'needs_reconciliation'); assert.equal(h.stored(), null);
  assert.equal(h.counter().bookedSeats, 1); h.advance(30001);
  assert.equal((await h.confirm()).status, 'confirmed'); assert.equal(h.stats.creates, 2); assert.equal(h.stats.bookingWrites, 1); assert.equal(h.counter().bookedSeats, 1);
});
test('same request with changed payload conflicts and cannot reserve more seats', async () => {
  const h = harness(); await h.confirm();
  assert.equal((await h.confirm(input({ name: 'ข้อมูลเปลี่ยน' }))).status, 'request_conflict');
  assert.equal(h.stats.bookingWrites, 1); assert.equal(h.counter().bookedSeats, 1);
});
test('parallel copies of a command produce one booking and one held seat', async () => {
  const h = harness(); const results = await Promise.all(Array.from({ length: 20 }, () => h.confirm()));
  assert.ok(results.some(r => r.status === 'confirmed')); assert.ok(results.every(r => ['confirmed', 'busy'].includes(r.status)));
  assert.equal(h.stats.bookingWrites, 1); assert.equal(h.stats.creates, 1); assert.equal(h.counter().bookedSeats, 1);
});
test('expired worker cannot finish a receipt; recovery reads the existing bound booking', async () => {
  const h = harness(); h.faults.expireDuringCreate = true;
  assert.equal((await h.confirm()).status, 'needs_reconciliation'); assert.notEqual(h.record().status, 'confirmed');
  assert.equal(h.stats.bookingWrites, 1); assert.equal((await h.confirm()).status, 'confirmed'); assert.equal(h.stats.creates, 1);
});
test('bound create rejects wrong owner seats trip or plan before writing', async () => {
  for (const patch of [{ ownerUid: 'wrong' }, { seats: 2 }, { tripId: 'wrong_trip' }, { planHash: '0'.repeat(64) }]) {
    const h = harness(), booking = input({ code: h.identity.bookingCode });
    const prepared = await h.raw.prepare({ ownerUid: OWNER, booking });
    await h.raw.reserve({ ownerUid: OWNER, body: { ...prepared.capacity, action: 'reserve' } });
    const counter = h.rows.get(h.counterPath), marker = counter.bookings[h.identity.bookingCode];
    Object.assign(marker, { status: 'committing', commandId: h.identity.commandId, requestHash: 'b'.repeat(64), planHash: prepared.planHash, tripId: 'trip_fixture', capacityKey: prepared.capacity.capacityKey }, patch);
    const created = await h.raw.create({ ownerUid: OWNER, booking, expectedReservation: { commandId: h.identity.commandId, requestHash: 'b'.repeat(64), planHash: prepared.planHash } });
    assert.equal(created.statusCode, 409); assert.equal(h.stats.bookingWrites, 0);
  }
});
test('cancelled or missing stored booking is never recreated by a completed command', async () => {
  const cancelled = harness(); await cancelled.confirm(); cancelled.rows.get('bookings/' + cancelled.identity.bookingCode).status = 'cancelled';
  delete cancelled.rows.get(cancelled.counterPath).bookings[cancelled.identity.bookingCode]; cancelled.rows.get(cancelled.counterPath).bookedSeats = 0;
  assert.equal((await cancelled.confirm()).status, 'cancelled'); assert.equal(cancelled.stats.creates, 1);
  const missing = harness(); await missing.confirm(); missing.rows.delete('bookings/' + missing.identity.bookingCode);
  assert.equal((await missing.confirm()).status, 'needs_reconciliation'); assert.equal(missing.stats.creates, 1); assert.equal(missing.counter().bookedSeats, 1);
});
test('recovery attempts are bounded when authority remains unavailable', async () => {
  const h = harness({ maxAttempts: 2 }); h.policy({ enabled: true });
  await h.confirm(); h.advance(30001); await h.confirm(); h.advance(30001);
  assert.equal((await h.confirm()).status, 'needs_reconciliation'); assert.equal(h.record().attempts, 2); assert.equal(h.stats.prepares, 2); assert.equal(h.stats.bookingWrites, 0);
});

test('unavailable authoritative read cannot trigger another create after a lost response', async () => {
  const h = harness(); h.faults.createAfter = true; await h.confirm(); h.advance(30001);
  h.faults.readPath = 'bookings/' + h.identity.bookingCode;
  assert.equal((await h.confirm()).status, 'needs_reconciliation'); assert.equal(h.stats.creates, 1); assert.equal(h.counter().bookedSeats, 1);
  h.advance(30001); assert.equal((await h.confirm()).status, 'confirmed'); assert.equal(h.stats.creates, 1); assert.equal(h.stats.bookingWrites, 1);
});
