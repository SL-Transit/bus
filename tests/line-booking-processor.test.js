'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLineBookingProcessor, normalized } = require('../functions/line-booking-processor');
const durable = require('../functions/line-booking-store');
const USER = 'U' + '1'.repeat(32), BOT = 'U' + '0'.repeat(32);
const SECRET = 'synthetic-processor-secret';
const copy = x => x == null ? null : JSON.parse(JSON.stringify(x));
function harness() {
  let time = 1800000000000, serial = 0, attempts = 0;
  const actors = new Map(), bookings = new Map();
  const store = {
    actorKey: durable.actorKey,
    async readSession(user) { return copy(actors.get(durable.actorKey(user))?.session); },
    async commitEvent(input, reducer) {
      const p = durable.prepare(input, time), decision = durable.planEvent(actors.get(p.actor), p, reducer);
      if (decision.state) actors.set(p.actor, decision.state);
      return { status: decision.status, ...(decision.state ? { revision: decision.revision, jobId: decision.jobId } : {}) };
    },
    async claimOutbox({ userId, jobId, workerId }) {
      const state = actors.get(durable.actorKey(userId)), decision = durable.planClaim(state?.outbox[jobId], { workerId, token: 'synthetic_' + workerId, now: time, leaseMs: 30000 });
      if (decision.job) state.outbox[jobId] = decision.job;
      return { status: decision.status, ...(decision.status === 'claimed' ? { job: copy(decision.job) } : {}) };
    },
    async acknowledge({ userId, jobId, workerId, token }) {
      const state = actors.get(durable.actorKey(userId)), decision = durable.planAck(state?.outbox[jobId], { workerId, token, now: time });
      if (decision.job) state.outbox[jobId] = decision.job;
      return { status: decision.status };
    }
  };
  const adapters = {
    mode: 'simulation',
    async loadOptions(s) {
      const ids = { origin: 'synthetic_origin', destination: 'synthetic_destination', date: new Date(time + 25200000).toISOString().slice(0, 10), trip: 'synthetic_trip', pax: '1' };
      return { step: s.state, revision: s.revision, publicationVersion: 'synthetic-v1', timezone: 'Asia/Bangkok',
        options: [{ token: crypto.createHash('sha256').update(s.id + ':' + s.state).digest('hex').slice(0, 16), id: ids[s.state], label: 'ตัวเลือกจำลอง ' + s.state }] };
    },
    async loadTerms(s) { return { revision: s.revision, version: 'synthetic_terms_v1', text: 'เงื่อนไขจำลอง ไม่ใช่การรับจองจริง' }; },
    async quote(s) { return { revision: s.revision, id: 'synthetic_quote', publicationVersion: s.publicationVersion, currency: 'THB', totalMinor: 10000, seats: Number(s.selection.pax), expiresAt: time + 60000, available: true }; },
    async confirmBooking(input) {
      attempts++;
      if (!bookings.has(input.requestId)) bookings.set(input.requestId, { requestId: input.requestId, actorKey: input.actorKey, bookingCode: 'SIMULATED_ONLY', paymentStatus: 'pay_on_site' });
      return copy(bookings.get(input.requestId));
    }
  };
  const config = { enabled: true, channelId: '2010730849', channelSecret: SECRET, botUserId: BOT, allowedUserIds: [USER] };
  const processor = createLineBookingProcessor({ store, adapters, config, clock: () => time });
  function request(message, patch = {}) {
    time++;
    const event = { type: 'message', mode: 'active', timestamp: time, webhookEventId: 'processor_event_' + ++serial,
      replyToken: 'synthetic_reply', source: { type: 'user', userId: USER }, message: { type: 'text', text: message }, ...patch };
    const rawBody = Buffer.from(JSON.stringify({ destination: BOT, events: [event] }));
    return { method: 'POST', rawBody, signature: crypto.createHmac('sha256', SECRET).update(rawBody).digest('base64') };
  }
  async function send(text, patch = {}, preview = true) {
    const req = request(text, patch), out = await processor.processWebhook(req), job = out.privateResults[0];
    const rendered = preview && job?.jobId ? await processor.runSimulationJob({ userId: USER, jobId: job.jobId, workerId: 'preview' }) : null;
    return { req, out, job, rendered };
  }
  return { store, adapters, config, processor, request, send, bookings, actors,
    attempts: () => attempts, advance: n => { time += n; }, peek: async () => (await store.readSession(USER))?.conversation };
}
async function review(h) {
  await h.send('จองตั๋ว');
  for (let i = 0; i < 5; i++) { const s = await h.peek(); await h.send('', { type: 'postback', postback: { data: 'sl:v1:choose:' + s.revision + ':' + s.choices[0].token } }); }
  await h.send('ผู้โดยสารจำลอง'); await h.send('0890000000');
  const consent = await h.peek(); assert.equal(consent.termsVersion, 'synthetic_terms_v1');
  await h.send('', { type: 'postback', postback: { data: 'sl:v1:accept:' + consent.revision } });
  assert.equal((await h.peek()).state, 'review');
}
async function confirm(h) {
  const s = await h.peek();
  return h.send('', { type: 'postback', postback: { data: 'sl:v1:confirm:' + s.revision } }, false);
}
test('processor is disabled by default and rejects non-simulation adapters', async () => {
  assert.equal((await createLineBookingProcessor().processWebhook({})).status, 503);
  const h = harness(); h.adapters.mode = 'production';
  assert.equal((await h.processor.processWebhook(h.request('จองตั๋ว'))).status, 503); assert.equal(h.actors.size, 0);
});
test('signed flow persists terms quote confirmation and synthetic receipt before completion preview', async () => {
  const h = harness(); await review(h); const submitted = await confirm(h);
  assert.equal((await h.peek()).state, 'submitting'); assert.equal(h.attempts(), 0);
  const receipt = await h.processor.runSimulationJob({ userId: USER, jobId: submitted.job.jobId, workerId: 'booking' });
  assert.equal(receipt.status, 'receipt_staged'); assert.equal(h.attempts(), 1);
  const complete = await h.peek(); assert.equal(complete.state, 'complete'); assert.equal(complete.name, undefined); assert.equal(complete.phone, undefined);
  const preview = await h.processor.runSimulationJob({ userId: USER, jobId: receipt.nextJobId, workerId: 'receipt' });
  assert.equal(preview.status, 'previewed'); assert.match(preview.messages[0].text, /SIMULATED_ONLY/);
  assert.match(preview.messages[0].text, /ยังไม่ใช่การจองจริง/);
});
test('redelivery changed reply token does not create another booking effect', async () => {
  const h = harness(); await review(h); const submitted = await confirm(h);
  const payload = JSON.parse(submitted.req.rawBody); payload.events[0].replyToken = 'different_synthetic_reply'; payload.events[0].deliveryContext = { isRedelivery: true };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const duplicate = await h.processor.processWebhook({ method: 'POST', rawBody, signature: crypto.createHmac('sha256', SECRET).update(rawBody).digest('base64') });
  assert.equal(duplicate.privateResults[0].status, 'duplicate');
  const jobs = await Promise.all(['one', 'two'].map(workerId => h.processor.runSimulationJob({ userId: USER, jobId: submitted.job.jobId, workerId })));
  assert.equal(jobs.filter(x => x.status === 'receipt_staged').length, 1); assert.equal(h.attempts(), 1);
});
test('concurrent name messages do not rebase the losing text as a phone', async () => {
  const h = harness(); await h.send('จองตั๋ว');
  for (let i = 0; i < 5; i++) { const s = await h.peek(); await h.send('', { type: 'postback', postback: { data: 'sl:v1:choose:' + s.revision + ':' + s.choices[0].token } }); }
  const results = await Promise.all([h.processor.processWebhook(h.request('ชื่อจำลองหนึ่ง')), h.processor.processWebhook(h.request('ชื่อจำลองสอง'))]);
  assert.deepEqual(results.map(x => x.privateResults[0].status).sort(), ['committed', 'revision_conflict']);
  const s = await h.peek(); assert.equal(s.state, 'phone'); assert.equal(s.phone, undefined);
});
test('restart keeps button revision monotonic and rejects previous session buttons', async () => {
  const h = harness(); await h.send('จองตั๋ว'); const old = await h.peek();
  await h.send('', { type: 'postback', postback: { data: 'sl:v1:cancel:' + old.revision } });
  await h.send('จองตั๋ว'); const fresh = await h.peek(); assert.ok(fresh.revision > old.revision); assert.notEqual(fresh.id, old.id);
  await h.send('', { type: 'postback', postback: { data: 'sl:v1:choose:' + old.revision + ':' + old.choices[0].token } });
  assert.equal((await h.peek()).state, 'origin');
});
test('bad signature and non-cohort user cannot access store or services', async () => {
  const h = harness(); const req = h.request('จองตั๋ว'); req.signature = 'bad';
  assert.equal((await h.processor.processWebhook(req)).status, 401); assert.equal(h.actors.size, 0);
  await h.processor.processWebhook(h.request('จองตั๋ว', { source: { type: 'user', userId: 'U' + '2'.repeat(32) } }));
  assert.equal(h.actors.size, 0);
});
test('read adapter failure does not persist half a conversation', async () => {
  const h = harness(); h.adapters.loadOptions = async () => { throw Error('synthetic_failure'); };
  const out = await h.processor.processWebhook(h.request('จองตั๋ว'));
  assert.equal(out.status, 503); assert.equal(h.actors.size, 0);
});
test('crash after synthetic booking never becomes success or an automatic second call', async () => {
  const h = harness(); const service = h.adapters.confirmBooking;
  h.adapters.confirmBooking = async input => { await service(input); throw Error('synthetic_crash_after_commit'); };
  await review(h); const submitted = await confirm(h);
  assert.equal((await h.processor.runSimulationJob({ userId: USER, jobId: submitted.job.jobId, workerId: 'first' })).status, 'pending_reconciliation');
  assert.equal((await h.peek()).state, 'submitting'); assert.equal(h.bookings.size, 1);
  h.advance(30001);
  assert.equal((await h.processor.runSimulationJob({ userId: USER, jobId: submitted.job.jobId, workerId: 'replacement' })).status, 'needs_reconciliation');
  assert.equal(h.attempts(), 1); assert.equal((await h.peek()).state, 'submitting');
});
test('synthetic receipt with wrong owner cannot complete conversation', async () => {
  const h = harness(); await review(h); const submitted = await confirm(h);
  h.adapters.confirmBooking = async input => ({ requestId: input.requestId, actorKey: 'wrong_actor', bookingCode: 'SIMULATED', paymentStatus: 'pay_on_site' });
  assert.equal((await h.processor.runSimulationJob({ userId: USER, jobId: submitted.job.jobId, workerId: 'wrong_receipt' })).status, 'pending_reconciliation');
  assert.equal((await h.peek()).state, 'submitting');
});
test('HTTP body and normalized fingerprint contain no tokens or private input reflection', async () => {
  const h = harness(); const out = await h.processor.processWebhook(h.request('จองตั๋ว'));
  const body = JSON.stringify(out.publicBody); for (const value of [USER, SECRET, 'synthetic_reply', 'จองตั๋ว']) assert.ok(!body.includes(value));
  assert.deepEqual(normalized({ action: 'confirm', revision: 7, replyToken: 'private', redelivery: true, price: 1 }), { action: 'confirm', revision: 7 });
});
