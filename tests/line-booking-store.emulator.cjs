'use strict';
// This file deliberately refuses every non-demo / non-loopback target before loading Admin.
if (process.env.GCLOUD_PROJECT !== 'demo-sl-transit-line' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') throw Error('demo_emulator_required');
const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { createLineBookingStore, actorKey, RETENTION } = require('../functions/line-booking-store');
const project = 'demo-sl-transit-line';
const app = admin.initializeApp({ projectId: project, databaseURL: 'http://127.0.0.1:9000?ns=' + project + '-default-rtdb' }, 'line-draft');
const db = app.database();
let time = 1800000000000;
const store = createLineBookingStore({ db, clock: () => time });
const user = n => 'U' + n.toString(16).padStart(32, '0');
const event = (n, id, revision = 0) => ({ userId: user(n), eventId: id, eventTimestamp: time, expectedRevision: revision, command: { action: 'synthetic' } });
const reduce = (session, command, ctx) => ({ session: { actorKey: ctx.actorKey, revision: ctx.revision + 1, step: 'synthetic' }, payload: { synthetic: true } });
(async () => {
  try {
    // Only synthetic nodes inside this guarded demo emulator are reset.
    await db.ref('lineChatPrivate').remove();
    const duplicate = await Promise.all(Array.from({ length: 20 }, () => store.commitEvent(event(1, 'same_event'), reduce)));
    assert.equal(duplicate.filter(r => r.status === 'committed').length, 1);
    assert.equal(duplicate.filter(r => r.status === 'duplicate').length, 19);
    assert.equal((await store.readSession(user(1))).revision, 1);
    console.log('PASS 20 concurrent duplicate deliveries commit once');
    const races = await Promise.all(Array.from({ length: 20 }, (_, i) => store.commitEvent(event(2, 'race_' + i), reduce)));
    assert.equal(races.filter(r => r.status === 'committed').length, 1);
    assert.equal(races.filter(r => r.status === 'revision_conflict').length, 19);
    console.log('PASS concurrent revision race has one winner');
    const freshStore = createLineBookingStore({ db, clock: () => time });
    assert.equal((await freshStore.commitEvent(event(1, 'same_event'), reduce)).status, 'duplicate');
    assert.equal(await freshStore.readSession(user(3)), null);
    await freshStore.commitEvent(event(3, 'same_event'), reduce);
    assert.equal((await freshStore.readSession(user(3))).revision, 1);
    console.log('PASS new store retains deduplication; actor data is isolated');
    const jobId = duplicate.find(r => r.jobId).jobId;
    const claims = await Promise.all(Array.from({ length: 10 }, (_, i) => store.claimOutbox({ userId: user(1), jobId, workerId: 'worker_' + i, leaseMs: 1000 })));
    assert.equal(claims.filter(r => r.status === 'claimed').length, 1, JSON.stringify({ statuses: claims.map(r => r.status), stored: (await db.ref('lineChatPrivate/v1/channels/2010730849/actors/' + actorKey(user(1)) + '/outbox/' + jobId + '/status').once('value')).val() }));
    const claim = claims.find(r => r.status === 'claimed');
    assert.equal((await store.acknowledge({ userId: user(1), jobId, workerId: 'wrong', token: claim.job.leaseToken })).status, 'lease_conflict');
    time += 1000;
    assert.equal((await store.claimOutbox({ userId: user(1), jobId, workerId: 'replacement' })).status, 'needs_reconciliation');
    assert.equal((await store.acknowledge({ userId: user(1), jobId, workerId: claim.job.workerId, token: claim.job.leaseToken })).status, 'lease_conflict');
    console.log('PASS expired worker cannot resend or acknowledge ambiguous job');
    const second = await store.commitEvent(event(3, 'second', 1), reduce);
    const c = await store.claimOutbox({ userId: user(3), jobId: second.jobId, workerId: 'ack_worker' });
    assert.equal((await store.acknowledge({ userId: user(3), jobId: second.jobId, workerId: 'ack_worker', token: c.job.leaseToken })).status, 'delivered');
    const saved = (await db.ref('lineChatPrivate/v1/channels/2010730849/actors/' + actorKey(user(3)) + '/outbox/' + second.jobId).once('value')).val();
    assert.equal(saved.payload, undefined); assert.equal(saved.leaseToken, undefined);
    console.log('PASS acknowledgement clears private outbox payload');
    const deniedRead = await fetch('http://127.0.0.1:9000/lineChatPrivate.json?ns=' + project + '-default-rtdb');
    assert.ok([401, 403].includes(deniedRead.status));
    const deniedWrite = await fetch('http://127.0.0.1:9000/lineChatPrivate/intruder.json?ns=' + project + '-default-rtdb', { method: 'PUT', body: JSON.stringify({ synthetic: true }) });
    assert.ok([401, 403].includes(deniedWrite.status));
    time += RETENTION + 1;
    await assert.rejects(() => store.commitEvent({ ...event(1, 'same_event'), eventTimestamp: 1800000000000 }, reduce), /event_time/);
    console.log('PASS anonymous read/write denied; old envelopes rejected');
    console.log('LINE demo Emulator validation passed; no production or LINE calls');
  } finally { await app.delete(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
