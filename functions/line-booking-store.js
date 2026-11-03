'use strict';
// Draft only: injected Admin RTDB. No Firebase initialization, HTTP export or sender.
const { createHash, randomUUID } = require('node:crypto');
const CHANNEL = '2010730849';
const RETENTION = 24 * 60 * 60 * 1000;
const MAX_INBOX = 128, MAX_OUTBOX = 16;
const hash = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function bounded(value, limit) {
  const text = JSON.stringify(value);
  if (!text || Buffer.byteLength(text) > limit) throw new Error('payload_limit');
  return JSON.parse(text);
}
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function actorKey(userId) {
  if (typeof userId !== 'string' || !/^U[0-9a-f]{32}$/i.test(userId)) throw new Error('invalid_user');
  return hash(CHANNEL + ':' + userId);
}
function prepare(input, now) {
  const actor = actorKey(input.userId);
  if (!integer(now) || !integer(input.eventTimestamp) || input.eventTimestamp < now - RETENTION || input.eventTimestamp > now + 60000) throw new Error('event_time');
  if (typeof input.eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.eventId)) throw new Error('event_id');
  if (!integer(input.expectedRevision)) throw new Error('revision');
  const command = bounded(input.command, 4096);
  // The verified envelope must be normalized by the caller; property order is significant.
  return { actor, key: hash(input.eventId), fingerprint: hash(JSON.stringify({ timestamp: input.eventTimestamp, command })), command, expectedRevision: input.expectedRevision, timestamp: input.eventTimestamp, now };
}
function planEvent(current, p, reducer) {
  const state = current ? copy(current) : { actorKey: p.actor, revision: 0, inbox: {}, outbox: {} };
  if (state.actorKey !== p.actor) return { status: 'owner_conflict' };
  state.inbox ||= {}; state.outbox ||= {};
  const seen = state.inbox[p.key];
  if (seen) return { status: seen.fingerprint === p.fingerprint ? 'duplicate' : 'event_collision' };
  if (state.revision !== p.expectedRevision) return { status: 'revision_conflict' };
  if (integer(state.lastEventTimestamp) && p.timestamp < state.lastEventTimestamp) return { status: 'out_of_order' };
  for (const [id, marker] of Object.entries(state.inbox)) if (marker.expiresAt < p.now) delete state.inbox[id];
  for (const [id, job] of Object.entries(state.outbox)) if (job.status === 'delivered') delete state.outbox[id];
  if (Object.keys(state.inbox).length >= MAX_INBOX || Object.keys(state.outbox).length >= MAX_OUTBOX) return { status: 'backpressure' };
  // Pure reducer: a transaction callback may execute more than once. Never call a service here.
  const result = reducer(state.session ? copy(state.session) : null, copy(p.command), { actorKey: p.actor, revision: state.revision, now: p.now });
  if (!result || !result.session || result.session.actorKey !== p.actor || result.session.revision !== state.revision + 1) throw new Error('invalid_transition');
  state.session = bounded(result.session, 32768);
  state.revision = result.session.revision;
  state.lastEventTimestamp = p.timestamp;
  const expiresAt = p.now + RETENTION;
  state.inbox[p.key] = { fingerprint: p.fingerprint, expiresAt, revision: state.revision };
  if (result.payload != null) state.outbox[p.key] = { status: 'pending', createdAt: p.now, expiresAt, attempts: 0, payload: bounded(result.payload, 16384) };
  bounded(state, 65536);
  return { status: 'committed', state, revision: state.revision, jobId: result.payload != null ? p.key : null };
}
function planClaim(current, { workerId, token, now, leaseMs }) {
  if (!current) return { status: 'missing' };
  const job = copy(current);
  if (job.status === 'processing' && job.leaseUntil <= now) {
    job.status = 'needs_reconciliation'; delete job.leaseToken;
    return { status: 'needs_reconciliation', job };
  }
  if (job.status !== 'pending') return { status: job.status };
  if (job.expiresAt <= now) { job.status = 'needs_reconciliation'; return { status: 'needs_reconciliation', job }; }
  Object.assign(job, { status: 'processing', workerId, leaseToken: token, leaseUntil: now + leaseMs, attempts: job.attempts + 1 });
  return { status: 'claimed', job };
}
function planAck(current, { workerId, token, now }) {
  if (!current || current.status !== 'processing' || current.workerId !== workerId || current.leaseToken !== token || current.leaseUntil <= now) return { status: 'lease_conflict' };
  const job = copy(current);
  job.status = 'delivered'; job.deliveredAt = now;
  delete job.payload; delete job.leaseToken;
  return { status: 'delivered', job };
}
function createLineBookingStore({ db, clock = Date.now, channelId = CHANNEL } = {}) {
  if (!db || typeof db.ref !== 'function' || typeof clock !== 'function' || channelId !== CHANNEL) throw new Error('invalid_store_configuration');
  const path = userId => 'lineChatPrivate/v1/channels/' + CHANNEL + '/actors/' + actorKey(userId);
  function now() { const time = clock(); if (!integer(time)) throw new Error('invalid_clock'); return time; }
  function jobRef(userId, jobId) {
    if (typeof jobId !== 'string' || !/^[a-f0-9]{64}$/.test(jobId)) throw new Error('job_id');
    return db.ref(path(userId) + '/outbox/' + jobId);
  }
  function worker(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new Error('worker_id'); }
  return {
    actorKey,
    async commitEvent(input, reducer) {
      if (typeof reducer !== 'function') throw new Error('reducer_required');
      const p = prepare(input, now()); let decision;
      const ref = db.ref(path(input.userId));
      await ref.once('value'); // Prime RTDB cache: null in a cold transaction is not proof of absence.
      const tx = await ref.transaction(current => {
        decision = planEvent(current, p, reducer);
        return decision.state; // undefined aborts. Duplicate events never re-run the reducer.
      }, undefined, false);
      return tx.committed ? { status: 'committed', revision: decision.revision, jobId: decision.jobId } : { status: decision.status };
    },
    async readSession(userId) {
      const value = (await db.ref(path(userId) + '/session').once('value')).val();
      if (value && value.actorKey !== actorKey(userId)) throw new Error('owner_conflict');
      return value ? copy(value) : null;
    },
    async claimOutbox({ userId, jobId, workerId, leaseMs = 30000 }) {
      worker(workerId);
      if (!integer(leaseMs) || leaseMs < 1000 || leaseMs > 60000) throw new Error('lease_duration');
      const args = { workerId, token: randomUUID(), now: now(), leaseMs }; let decision;
      const ref = jobRef(userId, jobId); await ref.once('value');
      const tx = await ref.transaction(current => { decision = planClaim(current, args); return decision.job; }, undefined, false);
      return tx.committed && decision.status === 'claimed' ? { status: 'claimed', job: decision.job } : { status: decision.status };
    },
    async acknowledge({ userId, jobId, workerId, token }) {
      worker(workerId);
      const args = { workerId, token, now: now() }; let decision;
      const ref = jobRef(userId, jobId); await ref.once('value');
      const tx = await ref.transaction(current => { decision = planAck(current, args); return decision.job; }, undefined, false);
      return { status: tx.committed ? 'delivered' : decision.status };
    }
  };
}
module.exports = { createLineBookingStore, actorKey, prepare, planEvent, planClaim, planAck, RETENTION, MAX_INBOX, MAX_OUTBOX };
