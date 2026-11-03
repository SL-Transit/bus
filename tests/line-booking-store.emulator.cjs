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

    // Full signed conversation, actual RTDB persistence, synthetic services and NO LINE sender.
    const { createLineBookingProcessor } = require('../functions/line-booking-processor');
    const crypto = require('node:crypto');
    const syntheticSecret = 'emulator-synthetic-secret', bot = user(9);
    let sequence = 0, serviceCalls = 0, crashAfterBooking = false;
    const syntheticBookings = new Map();
    const adapters = {
      mode: 'simulation',
      async loadOptions(s) {
        const values = { origin: 'emulator_origin', destination: 'emulator_destination', date: new Date(time + 25200000).toISOString().slice(0, 10), trip: 'emulator_trip', pax: '1' };
        return { step: s.state, revision: s.revision, publicationVersion: 'emulator-publication', timezone: 'Asia/Bangkok',
          options: [{ id: values[s.state], label: 'ตัวเลือกจำลอง ' + s.state, token: crypto.createHash('sha256').update(s.id + s.state).digest('hex').slice(0, 16) }] };
      },
      async loadTerms(s) { return { revision: s.revision, version: 'emulator_terms', text: 'เงื่อนไขจำลองเท่านั้น' }; },
      async quote(s) { return { revision: s.revision, id: 'emulator_quote', publicationVersion: s.publicationVersion, currency: 'THB', totalMinor: 12300, seats: Number(s.selection.pax), available: true, expiresAt: time + 60000 }; },
      async confirmBooking(input) {
        serviceCalls++;
        if (!syntheticBookings.has(input.requestId)) syntheticBookings.set(input.requestId, { requestId: input.requestId, actorKey: input.actorKey, bookingCode: 'EMULATOR_ONLY', paymentStatus: 'pay_on_site' });
        if (crashAfterBooking) throw Error('synthetic_crash_after_booking');
        return syntheticBookings.get(input.requestId);
      }
    };
    const config = { enabled: true, channelId: '2010730849', channelSecret: syntheticSecret, botUserId: bot, allowedUserIds: [user(4), user(5)] };
    let processor = createLineBookingProcessor({ store, adapters, config, clock: () => time });
    function signedEvent(n, text, postback) {
      time++;
      const e = { mode: 'active', timestamp: time, webhookEventId: 'integration_' + ++sequence, replyToken: 'synthetic_reply', source: { type: 'user', userId: user(n) },
        ...(postback ? { type: 'postback', postback: { data: postback } } : { type: 'message', message: { type: 'text', text } }) };
      const rawBody = Buffer.from(JSON.stringify({ destination: bot, events: [e] }));
      return { method: 'POST', rawBody, signature: crypto.createHmac('sha256', syntheticSecret).update(rawBody).digest('base64') };
    }
    async function send(n, text, postback, preview = true) {
      const request = signedEvent(n, text, postback), response = await processor.processWebhook(request);
      assert.equal(response.status, 200); assert.equal(response.privateResults[0].status, 'committed');
      const jobId = response.privateResults[0].jobId;
      if (preview) assert.equal((await processor.runSimulationJob({ userId: user(n), jobId, workerId: 'preview_worker' })).status, 'previewed');
      return { request, response, jobId };
    }
    const conversation = async n => (await store.readSession(user(n))).conversation;
    async function prepareConfirmation(n) {
      await send(n, 'จองตั๋ว');
      // Reconstruct processor/store between requests to prove the path uses durable session data.
      processor = createLineBookingProcessor({ store: createLineBookingStore({ db, clock: () => time }), adapters, config, clock: () => time });
      for (let i = 0; i < 5; i++) { const s = await conversation(n); await send(n, '', 'sl:v1:choose:' + s.revision + ':' + s.choices[0].token); }
      await send(n, 'ผู้โดยสารจำลอง'); await send(n, '0890000000');
      const terms = await conversation(n); assert.equal(terms.termsVersion, 'emulator_terms');
      await send(n, '', 'sl:v1:accept:' + terms.revision);
      const review = await conversation(n); assert.equal(review.state, 'review');
      return send(n, '', 'sl:v1:confirm:' + review.revision, false);
    }
    const submitted = await prepareConfirmation(4);
    assert.equal(serviceCalls, 0); assert.equal((await conversation(4)).state, 'submitting');
    const replay = await processor.processWebhook(submitted.request);
    assert.equal(replay.privateResults[0].status, 'duplicate');
    const bookingWorkers = await Promise.all(Array.from({ length: 10 }, (_, i) => processor.runSimulationJob({ userId: user(4), jobId: submitted.jobId, workerId: 'booking_' + i })));
    assert.equal(bookingWorkers.filter(r => r.status === 'receipt_staged').length, 1); assert.equal(serviceCalls, 1);
    const receiptJob = bookingWorkers.find(r => r.nextJobId).nextJobId;
    const receiptPreview = await processor.runSimulationJob({ userId: user(4), jobId: receiptJob, workerId: 'receipt_preview' });
    assert.equal(receiptPreview.status, 'previewed'); assert.match(receiptPreview.messages[0].text, /EMULATOR_ONLY/);
    const completed = await conversation(4); assert.equal(completed.state, 'complete'); assert.equal(completed.phone, undefined); assert.equal(completed.name, undefined);
    console.log('PASS signed full simulated conversation survives RTDB round-trips and processor restart; duplicate plus 10 workers produce one synthetic booking and verified completion preview');
    crashAfterBooking = true;
    const crashed = await prepareConfirmation(5);
    assert.equal((await processor.runSimulationJob({ userId: user(5), jobId: crashed.jobId, workerId: 'crash_worker' })).status, 'pending_reconciliation');
    assert.equal((await conversation(5)).state, 'submitting'); assert.equal(syntheticBookings.size, 2);
    const callsBeforeRecovery = serviceCalls; time += 30001;
    assert.equal((await processor.runSimulationJob({ userId: user(5), jobId: crashed.jobId, workerId: 'replacement_worker' })).status, 'needs_reconciliation');
    assert.equal(serviceCalls, callsBeforeRecovery); assert.equal((await conversation(5)).state, 'submitting');
    assert.ok(!JSON.stringify(crashed.response.publicBody).includes('0890000000'));
    console.log('PASS crash after synthetic service commit never triggers automatic booking retry or false completion; HTTP body has no private input');


    // The same extracted service used by the HTTP endpoints, two injected callers, one RTDB counter.
    const { createBookingAuthority } = require('../functions/booking-authority-service');
    const validPart = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
    const authorityDeps = { db, serverTimestamp: { '.sv': 'timestamp' },
      readSystemTestMode: async () => ({}), readCanonicalWorkbookSource: async () => ({}),
      canonicalWorkbookReady: () => false, findCanonicalWorkbookPair: () => null,
      resolvePublishedCapacity: async () => ({ capacityLimit: 3, bookedSeats: 0, seatsAvailable: 3, bookings: {} }),
      bookingTimeAuthority: require('../functions/booking-time-authority'),
      cleanBookingText: (value, max) => String(value == null ? '' : value).trim().slice(0, max), validCapacityPart: validPart,
      capacityCounterPath: (date, key) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && validPart(key, 240) ? 'operations/bookingCapacityByServiceDate/' + date + '/' + key : null };
    const webAuthority = createBookingAuthority(authorityDeps), lineAuthority = createBookingAuthority(authorityDeps);
    const capacityBody = { serviceDate: '2027-01-15', capacityKey: 'synthetic_authority_shared', requestedSeats: 1, capacityLimit: 999 };
    const seatRaces = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? webAuthority : lineAuthority).reserve({ ownerUid: 'synthetic_owner_' + i, body: { ...capacityBody, bookingCode: 'AUTHORITY_' + i } })));
    assert.equal(seatRaces.filter(r => r.statusCode === 200).length, 3);
    assert.equal(seatRaces.filter(r => r.statusCode === 409).length, 17);
    const sharedCapacityRef = db.ref('operations/bookingCapacityByServiceDate/2027-01-15/synthetic_authority_shared');
    const sharedCounter = (await sharedCapacityRef.get()).val();
    assert.equal(sharedCounter.capacityLimit, 3); assert.equal(sharedCounter.bookedSeats, 3); assert.equal(Object.keys(sharedCounter.bookings).length, 3);
    const [reservedCode, reservedOwner] = Object.entries(sharedCounter.bookings)[0];
    await lineAuthority.reserve({ ownerUid: 'synthetic_wrong_owner', body: { ...capacityBody, bookingCode: reservedCode, action: 'release' } });
    assert.equal((await sharedCapacityRef.get()).val().bookedSeats, 3);
    await webAuthority.reserve({ ownerUid: reservedOwner.ownerUid, body: { ...capacityBody, bookingCode: reservedCode, action: 'release' } });
    await webAuthority.reserve({ ownerUid: reservedOwner.ownerUid, body: { ...capacityBody, bookingCode: reservedCode, action: 'release' } });
    assert.equal((await sharedCapacityRef.get()).val().bookedSeats, 2);
    assert.equal((await lineAuthority.reserve({ ownerUid: 'synthetic_new_owner', body: { ...capacityBody, bookingCode: 'AUTHORITY_NEW' } })).statusCode, 200);
    assert.equal((await sharedCapacityRef.get()).val().bookedSeats, 3);
    console.log('PASS extracted booking authority: 20 web/LINE-labelled callers share three real Emulator seats, forged limit ignored, cross-owner release blocked and repeated release does not over-decrement');

    console.log('LINE demo Emulator validation passed; no production or LINE calls');
  } finally { await app.delete(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
