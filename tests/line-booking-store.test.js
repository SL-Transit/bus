'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { actorKey, prepare, planEvent, planClaim, planAck, createLineBookingStore, RETENTION, MAX_INBOX, MAX_OUTBOX } = require('../functions/line-booking-store');
const userId = 'U' + '1'.repeat(32), now = 1800000000000;
const input = (extra = {}) => ({ userId, eventId: 'event_1', eventTimestamp: now, expectedRevision: 0, command: { action: 'start' }, ...extra });
const reducer = (session, command, ctx) => ({ session: { actorKey: ctx.actorKey, revision: ctx.revision + 1, step: 'origin' }, payload: { effect: 'synthetic_only' } });
const initial = () => planEvent(null, prepare(input(), now), reducer);
test('event atomically stages private session inbox and outbox', () => {
  const result = initial(); assert.equal(result.status, 'committed'); assert.equal(result.state.revision, 1);
  assert.equal(Object.keys(result.state.inbox).length, 1); assert.equal(Object.keys(result.state.outbox).length, 1);
  assert.ok(!JSON.stringify(result.state).includes(userId));
});
test('duplicate never invokes reducer again', () => {
  assert.equal(planEvent(initial().state, prepare(input(), now), () => { throw Error('must not run'); }).status, 'duplicate');
});
test('event ID collision is rejected', () => {
  assert.equal(planEvent(initial().state, prepare(input({ command: { action: 'different' } }), now), reducer).status, 'event_collision');
});
test('different event cannot overwrite a newer revision', () => {
  assert.equal(planEvent(initial().state, prepare(input({ eventId: 'event_2' }), now), reducer).status, 'revision_conflict');
});
test('actor ownership cannot be crossed', () => {
  const p = prepare(input({ userId: 'U' + '2'.repeat(32) }), now);
  assert.equal(planEvent(initial().state, p, reducer).status, 'owner_conflict');
  assert.throws(() => actorKey('../../passenger'), /invalid_user/);
});
test('old and future envelopes and invalid clocks rejected', () => {
  for (const time of [now - RETENTION - 1, now + 60001, NaN]) assert.throws(() => prepare(input({ eventTimestamp: time }), now), /event_time/);
  assert.throws(() => prepare(input(), NaN), /event_time/);
});
test('unexpired inbox markers are not evicted to allow replay', () => {
  const state = initial().state; state.inbox = {};
  for (let i = 0; i < MAX_INBOX; i++) state.inbox['key' + i] = { expiresAt: now + RETENTION };
  assert.equal(planEvent(state, prepare(input({ eventId: 'event_2', expectedRevision: 1 }), now), reducer).status, 'backpressure');
});
test('undelivered jobs apply backpressure', () => {
  const state = initial().state; state.outbox = {};
  for (let i = 0; i < MAX_OUTBOX; i++) state.outbox['key' + i] = { status: 'needs_reconciliation', expiresAt: now - 1 };
  assert.equal(planEvent(state, prepare(input({ eventId: 'event_2', expectedRevision: 1 }), now), reducer).status, 'backpressure');
});
test('out of order text cannot advance session', () => {
  assert.equal(planEvent(initial().state, prepare(input({ eventId: 'event_2', expectedRevision: 1, eventTimestamp: now - 1 }), now), reducer).status, 'out_of_order');
});
test('reducer must increment revision and preserve owner', () => {
  assert.throws(() => planEvent(null, prepare(input(), now), () => ({ session: { actorKey: 'other', revision: 1 } })), /invalid_transition/);
  assert.throws(() => prepare(input({ command: { text: 'x'.repeat(4097) } }), now), /payload_limit/);
});
test('claim fences workers and does not replay processing job', () => {
  const job = Object.values(initial().state.outbox)[0];
  const claim = planClaim(job, { workerId: 'one', token: 'token1', now, leaseMs: 1000 });
  assert.equal(claim.status, 'claimed');
  assert.equal(planClaim(claim.job, { workerId: 'two', token: 'token2', now: now + 1, leaseMs: 1000 }).status, 'processing');
  assert.equal(planAck(claim.job, { workerId: 'two', token: 'token1', now: now + 1 }).status, 'lease_conflict');
});
test('expired claim requires reconciliation and rejects stale acknowledgement', () => {
  const claim = planClaim(Object.values(initial().state.outbox)[0], { workerId: 'one', token: 'token1', now, leaseMs: 1000 });
  const expired = planClaim(claim.job, { workerId: 'two', token: 'token2', now: now + 1000, leaseMs: 1000 });
  assert.equal(expired.status, 'needs_reconciliation'); assert.equal(expired.job.leaseToken, undefined);
  assert.equal(planAck(claim.job, { workerId: 'one', token: 'token1', now: now + 1000 }).status, 'lease_conflict');
});
test('acknowledgement removes private payload', () => {
  const claim = planClaim(Object.values(initial().state.outbox)[0], { workerId: 'one', token: 'token1', now, leaseMs: 1000 });
  const ack = planAck(claim.job, { workerId: 'one', token: 'token1', now: now + 1 });
  assert.equal(ack.status, 'delivered'); assert.equal(ack.job.payload, undefined); assert.equal(ack.job.leaseToken, undefined);
});
test('store requires injection and cannot target staff channel', () => {
  assert.throws(() => createLineBookingStore(), /configuration/);
  assert.throws(() => createLineBookingStore({ db: { ref() {} }, channelId: '2010104391' }), /configuration/);
});

test('ack checks time after database wait and releases its cache listener', async () => {
  let time = now, listeners = 0;
  const job = { status: 'processing', workerId: 'worker', leaseToken: 'token', leaseUntil: now + 1000, payload: { synthetic: true } };
  const ref = {
    on() { listeners++; }, off() { listeners--; },
    async once() { time += 2000; return { val: () => job }; },
    async transaction(update) { assert.equal(listeners, 1); const value = update(job); assert.equal(value, undefined); return { committed: false }; }
  };
  const store = createLineBookingStore({ db: { ref: () => ref }, clock: () => time });
  assert.equal((await store.acknowledge({ userId, jobId: 'a'.repeat(64), workerId: 'worker', token: 'token' })).status, 'lease_conflict');
  assert.equal(listeners, 0);
});
test('database failure releases its temporary listener', async () => {
  let listeners = 0;
  const ref = { on() { listeners++; }, off() { listeners--; }, async once() { throw Error('database_unavailable'); } };
  const store = createLineBookingStore({ db: { ref: () => ref }, clock: () => now });
  await assert.rejects(() => store.commitEvent(input(), reducer), /database_unavailable/);
  assert.equal(listeners, 0);
});
