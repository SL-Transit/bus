'use strict';
// Simulation draft only. No Firebase initialization, HTTP export, real adapter or LINE sender.
const { createHash } = require('node:crypto');
const { prepareWebhook } = require('./line-passenger-webhook');
const flow = require('./line-booking-conversation');
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const SCHEMA = 'line_chat_runtime_v1';
function normalized(command) {
  const out = { action: command.action };
  for (const key of ['revision', 'choiceToken', 'page', 'inputText']) if (command[key] !== undefined) out[key] = command[key];
  return out; // Reply tokens/redelivery metadata never enter the deduplication fingerprint or store.
}
function menu(text = 'เลือกจองตั๋วเพื่อเริ่มขั้นตอนตัวอย่าง') {
  return [{ type: 'text', text: '[ตัวอย่างทดสอบ ยังไม่ใช่การจองจริง]\n' + text, quickReply: { items: [
    { type: 'action', action: { type: 'postback', label: 'จองตั๋ว', data: 'sl:v1:book' } }
  ] } }];
}
function createLineBookingProcessor({ store, adapters, config = {}, clock = Date.now } = {}) {
  const settings = { ...config, allowedUserIds: [...(config.allowedUserIds || [])] };
  const ready = () => settings.enabled === true && adapters?.mode === 'simulation' &&
    ['loadOptions', 'loadTerms', 'quote', 'confirmBooking'].every(key => typeof adapters[key] === 'function');
  function now() { const n = clock(); if (!Number.isSafeInteger(n) || n < 0) throw Error('invalid_clock'); return n; }
  function envelope(value, actor) {
    if (value && (value.schemaVersion !== SCHEMA || value.actorKey !== actor || !Number.isSafeInteger(value.revision))) throw Error('incompatible_session');
    // RTDB omits empty objects/arrays. Restore pure reducer defaults on private reads.
    if (value?.conversation) value.conversation = { ...value.conversation, selection: value.conversation.selection || {},
      selectionLabels: value.conversation.selectionLabels || {}, choices: value.conversation.choices || [] };
    return value;
  }
  async function plan(base, command, eventId, actor) {
    const time = now(), previous = base?.conversation || null;
    let result;
    if (command.action === 'start_booking') {
      if (previous && !['complete', 'cancelled'].includes(previous.state) && time < previous.expiresAt) {
        result = { session: previous, text: 'กรุณาทำขั้นตอนปัจจุบันต่อ หรือยกเลิกขั้นตอนก่อนเริ่มใหม่', effects: [] };
      } else {
        result = flow.startConversation({ id: hash(actor + ':' + eventId).slice(0, 32), actorKey: actor, now: time });
        // Keep button revisions monotonic across restarts so old buttons cannot enter a new session.
        result.session.revision = (previous?.revision || 0) + 1;
        result.effects[0].revision = result.session.revision;
      }
    } else if (!previous) return { conversation: null, messages: menu(), booking: null };
    else if (command.action === 'my_bookings') return { conversation: previous, messages: menu('ตัวอย่างนี้ยังไม่เชื่อมการค้นหาตั๋วเดิม'), booking: null };
    else result = flow.advanceConversation(previous, { ...command, revision: command.revision ?? previous.revision }, { actorKey: actor, now: time });
    const effects = result.effects || [];
    const options = effects.find(effect => effect.type === 'load_published_options');
    const quote = effects.find(effect => effect.type === 'quote_existing_booking');
    const booking = effects.find(effect => effect.type === 'confirm_existing_booking');
    if (options) result = flow.applyOptions(result.session, await adapters.loadOptions(copy(result.session), copy(options)), now());
    if (result.session.state === 'consent' && !result.session.termsVersion) result = flow.applyTerms(result.session, await adapters.loadTerms(copy(result.session)), now());
    if (quote) result = flow.applyQuote(result.session, await adapters.quote(copy(result.session), copy(quote)), now());
    if (effects.some(effect => effect.type === 'request_staff_handoff')) result.text = 'ตัวอย่างนี้ยังไม่ส่งต่อเจ้าหน้าที่จริง';
    return { conversation: result.session, messages: flow.toLineMessages(result), booking: booking || null };
  }
  async function processCommand(command) {
    const actor = store.actorKey(command.userId);
    const base = envelope(await store.readSession(command.userId), actor);
    const action = normalized(command);
    const planned = await plan(base, action, command.eventId, actor);
    const expectedRevision = base?.revision || 0;
    return store.commitEvent({ userId: command.userId, eventId: command.eventId, eventTimestamp: command.eventTimestamp, expectedRevision, command: action }, (current, ignored, ctx) => {
      envelope(current, actor);
      if ((current?.revision || 0) !== expectedRevision) throw Error('stale_snapshot');
      if (planned.conversation && ctx.now >= planned.conversation.expiresAt) throw Error('session_expired');
      if (planned.booking && ctx.now >= planned.conversation.quote.expiresAt) throw Error('quote_expired');
      return { session: { schemaVersion: SCHEMA, actorKey: actor, revision: ctx.revision + 1, conversation: planned.conversation },
        payload: { kind: planned.booking ? 'simulation_booking' : 'simulation_preview', messages: planned.messages,
          ...(planned.booking ? { effect: planned.booking, sessionId: planned.conversation.id } : {}) } };
    });
  }
  return {
    async processWebhook(request) {
      if (!ready()) return { status: 503, publicBody: { status: 'simulation_disabled' }, privateResults: [] };
      const verified = prepareWebhook(request, settings);
      if (verified.status !== 200) return { status: verified.status, publicBody: verified.publicBody, privateResults: [] };
      const privateResults = [];
      try {
        for (const command of verified.commands) privateResults.push({ eventId: command.eventId, ...await processCommand(command) });
        // HTTP wrappers may return only publicBody. Jobs and preview messages are internal data.
        return { status: 200, publicBody: { status: verified.commands.length ? 'simulation_staged' : 'verified' }, privateResults };
      } catch { return { status: 503, publicBody: { status: 'simulation_unavailable' }, privateResults }; }
    },
    async runSimulationJob({ userId, jobId, workerId }) {
      if (!ready() || !settings.allowedUserIds.includes(userId) || settings.channelId !== '2010730849') return { status: 'simulation_disabled' };
      const claim = await store.claimOutbox({ userId, jobId, workerId });
      if (claim.status !== 'claimed') return { status: claim.status };
      const job = claim.job, actor = store.actorKey(userId);
      const ack = () => store.acknowledge({ userId, jobId, workerId, token: job.leaseToken });
      try {
        if (job.leaseUntil <= now()) return { status: 'pending_reconciliation' };
        if (job.payload?.kind === 'simulation_preview') {
          const done = await ack();
          return done.status === 'delivered' ? { status: 'previewed', messages: job.payload.messages } : { status: 'pending_reconciliation' };
        }
        if (job.payload?.kind !== 'simulation_booking') return { status: 'pending_reconciliation' };
        const effect = job.payload.effect;
        let base = envelope(await store.readSession(userId), actor), conversation = base?.conversation;
        if (!conversation || conversation.state !== 'submitting' || conversation.id !== job.payload.sessionId ||
            conversation.requestId !== effect.requestId || conversation.quote.id !== effect.quoteId || conversation.quote.expiresAt <= now()) return { status: 'pending_reconciliation' };
        // Synthetic service only, OUTSIDE every RTDB transaction. Real booking authority is not wired.
        const receipt = await adapters.confirmBooking(copy({ actorKey: actor, requestId: effect.requestId, quoteId: effect.quoteId,
          publicationVersion: effect.publicationVersion, selection: conversation.selection, name: conversation.name,
          phone: conversation.phone, consent: conversation.consent }));
        if (job.leaseUntil <= now()) return { status: 'pending_reconciliation' };
        base = envelope(await store.readSession(userId), actor); conversation = base?.conversation;
        if (!conversation || conversation.id !== job.payload.sessionId || conversation.requestId !== effect.requestId) return { status: 'pending_reconciliation' };
        const result = flow.applyReceipt(conversation, receipt, now());
        result.text += '\nรหัสจอง: ' + receipt.bookingCode;
        const staged = await store.commitEvent({ userId, eventId: 'internal_receipt_' + effect.requestId, eventTimestamp: now(),
          expectedRevision: base.revision, command: { action: 'trusted_simulation_receipt', requestId: effect.requestId, receipt } }, (current, ignored, ctx) => {
          envelope(current, actor);
          if (current.conversation.id !== job.payload.sessionId || current.conversation.state !== 'submitting' || current.conversation.requestId !== effect.requestId || job.leaseUntil <= ctx.now) throw Error('receipt_conflict');
          return { session: { schemaVersion: SCHEMA, actorKey: actor, revision: ctx.revision + 1, conversation: result.session },
            payload: { kind: 'simulation_preview', messages: flow.toLineMessages(result) } };
        });
        if (staged.status !== 'committed') return { status: 'pending_reconciliation' };
        const done = await ack();
        return { status: done.status === 'delivered' ? 'receipt_staged' : 'pending_reconciliation', nextJobId: staged.jobId };
      } catch { return { status: 'pending_reconciliation' }; }
      // Uncertain jobs are NOT acknowledged or retried. Expiry moves them to reconciliation.
    }
  };
}
module.exports = { createLineBookingProcessor, normalized };
