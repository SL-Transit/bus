'use strict';
// Private trusted server service, disabled by default. No Firebase init, endpoint, sender or credential.
const { createHash, randomUUID } = require('node:crypto');
const { canonicalJson } = require('./booking-authority-service');
const CHANNEL = '2010730849', SCHEMA = 'booking_command_v1';
const digest = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function commandIdentity(ownerUid, requestId) {
  if (typeof ownerUid !== 'string' || !ownerUid || ownerUid.length > 128 || !/^[a-f0-9]{64}$/.test(requestId || '')) throw Error('invalid_identity');
  const commandId = digest(CHANNEL + ':' + ownerUid + ':' + requestId);
  return { commandId, bookingCode: 'LC_' + commandId.slice(0, 40),
    ledgerPath: 'operations/bookingCommands/v1/' + digest(ownerUid) + '/' + requestId };
}
function createBookingCommandService({ enabled = false, channelId = CHANNEL, db, authority, clock = Date.now, leaseMs = 30000, maxAttempts = 5 } = {}) {
  const active = enabled === true && channelId === CHANNEL;
  if (active && (!db || typeof db.ref !== 'function' || !authority || ['prepare', 'reserve', 'create'].some(key => typeof authority[key] !== 'function') ||
      typeof clock !== 'function' || !Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 60000 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5)) throw Error('command_dependencies_required');
  function now() { const value = clock(); if (!Number.isSafeInteger(value) || value < 0) throw Error('invalid_clock'); return value; }
  async function transact(ref, update) {
    const keepCache = () => {}; ref.on('value', keepCache);
    try { await ref.once('value'); return await ref.transaction(update, undefined, false); }
    finally { ref.off('value', keepCache); }
  }
  function safeCapacity(capacity) {
    return capacity && /^operations\/bookingCapacityByServiceDate\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{1,240}$/.test(capacity.counterPath || '') &&
      Number.isInteger(capacity.requestedSeats) && capacity.requestedSeats >= 1 && capacity.requestedSeats <= 10 &&
      typeof capacity.sourceRowId === 'string' && capacity.sourceRowId && typeof capacity.tripKey === 'string' && capacity.tripKey;
  }
  function slotMatches(marker, record) {
    const capacity = record.capacity;
    return marker && marker.ownerUid === record.ownerUid && Number(marker.seats) === capacity.requestedSeats &&
      marker.commandId === record.commandId && marker.requestHash === record.requestHash && marker.planHash === record.planHash &&
      marker.tripId === capacity.tripKey && marker.capacityKey === capacity.capacityKey;
  }
  function bookingMatches(booking, record) {
    const capacity = record.capacity;
    return safeCapacity(capacity) && booking && booking.ownerUid === record.ownerUid && booking.code === record.bookingCode &&
      booking.bookingCommand?.schemaVersion === SCHEMA && booking.bookingCommand.commandId === record.commandId &&
      booking.bookingCommand.requestHash === record.requestHash && booking.bookingCommand.planHash === record.planHash &&
      booking.date === capacity.serviceDate && Number(booking.pax) === capacity.requestedSeats && booking.tripId === capacity.tripKey &&
      booking.capacity?.counterPath === capacity.counterPath;
  }
  async function inspectBooking(record) {
    const booking = (await db.ref('bookings/' + record.bookingCode).get()).val();
    if (!booking) return { status: 'absent' };
    if (!bookingMatches(booking, record)) return { status: 'conflict' };
    if (booking.status === 'cancelled') return { status: 'cancelled', booking };
    return { status: 'found', booking };
  }
  return {
    async confirm({ ownerUid, requestId, booking: rawBooking } = {}) {
      if (!active) return { status: 'disabled' };
      let identity, booking, requestHash;
      try {
        identity = commandIdentity(ownerUid, requestId);
        const text = JSON.stringify(rawBooking);
        if (!text || Buffer.byteLength(text) > 16384) return { status: 'invalid_request' };
        booking = JSON.parse(text);
        if (!booking || typeof booking !== 'object' || Array.isArray(booking)) return { status: 'invalid_request' };
        for (const key of ['code', 'bookingCode', 'ownerUid', 'capacity', 'bookingCommand', 'createdAt', 'source']) delete booking[key];
        booking.code = identity.bookingCode;
        requestHash = digest(canonicalJson(booking));
      } catch { return { status: 'invalid_request' }; }
      const ref = db.ref(identity.ledgerPath), leaseToken = randomUUID();
      let record, decision;
      function compatible(value) { return value && value.schemaVersion === SCHEMA && value.ownerUid === ownerUid && value.commandId === identity.commandId && value.requestHash === requestHash && value.bookingCode === identity.bookingCode; }
      async function patch(changes) {
        const tx = await transact(ref, current => {
          if (!compatible(current) || current.leaseToken !== leaseToken || current.leaseUntil <= now()) return;
          return { ...current, ...changes, updatedAt: now() };
        });
        if (tx.committed) record = tx.snapshot.val();
        return tx.committed;
      }
      async function uncertain(reason = 'uncertain_outcome') {
        try { if (record?.leaseToken === leaseToken) await patch({ status: 'needs_reconciliation', reason }); } catch { /* Do not log private command data. */ }
        return { status: 'needs_reconciliation', bookingCode: identity.bookingCode };
      }
      async function complete(found) {
        if (!bookingMatches(found, record)) return uncertain('booking_conflict');
        if (found.status === 'cancelled') {
          await patch({ status: 'cancelled' });
          return { status: 'cancelled', bookingCode: identity.bookingCode };
        }
        const tx = await transact(db.ref(record.capacity.counterPath), current => {
          const marker = current?.bookings?.[record.bookingCode];
          if (record.leaseUntil <= now() || !slotMatches(marker, record) || !['committing', 'committed'].includes(marker.status) || String(current.sourceRowId || '') !== record.capacity.sourceRowId) return;
          return { ...current, bookings: { ...current.bookings, [record.bookingCode]: { ...marker, status: 'committed' } }, updatedAt: now() };
        });
        if (!tx.committed) return uncertain('capacity_commit_conflict');
        const paymentStatus = found.paymentStatus === 'slip_uploaded' ? 'awaiting_payment' : found.paymentStatus;
        if (!['awaiting_payment', 'pay_on_site', 'payment_verified'].includes(paymentStatus)) return uncertain('payment_state_unrecognized');
        const receipt = { requestId, bookingCode: identity.bookingCode, paymentStatus };
        if (!await patch({ status: 'confirmed', receipt, reason: null })) return uncertain('lease_lost_after_booking');
        return { status: 'confirmed', receipt, replay: false };
      }
      try {
        const claim = await transact(ref, current => {
          const time = now();
          if (current && !compatible(current)) { decision = 'request_conflict'; return; }
          if (current && ['confirmed', 'cancelled', 'rejected'].includes(current.status)) { decision = current.status; record = current; return; }
          if (current && current.leaseUntil > time && current.leaseToken !== leaseToken) { decision = 'busy'; return; }
          if (current?.leaseToken === leaseToken && current.status === 'processing' && current.leaseUntil > time) { decision = 'claimed'; return current; }
          if (current && Number(current.attempts || 0) >= maxAttempts) { decision = 'attempt_limit'; return; }
          decision = 'claimed';
          return { ...(current || {}), schemaVersion: SCHEMA, ownerUid, requestId, commandId: identity.commandId,
            requestHash, bookingCode: identity.bookingCode, status: 'processing', leaseToken, leaseUntil: time + leaseMs,
            attempts: Number(current?.attempts || 0) + 1, createdAt: current?.createdAt || time, updatedAt: time };
        });
        if (!claim.committed) {
          if (decision === 'confirmed' || decision === 'cancelled') {
            const existing = await inspectBooking(record);
            if (existing.status === 'cancelled') return { status: 'cancelled', bookingCode: identity.bookingCode };
            if (decision !== 'confirmed' || existing.status !== 'found') return uncertain('record_missing_or_changed');
            const counter = (await db.ref(record.capacity.counterPath).get()).val(), marker = counter?.bookings?.[record.bookingCode];
            return slotMatches(marker, record) && marker.status === 'committed' && String(counter.sourceRowId || '') === record.capacity.sourceRowId ? { status: 'confirmed', receipt: record.receipt, replay: true } : uncertain('counter_missing_or_changed');
          }
          return { status: decision === 'attempt_limit' ? 'needs_reconciliation' : decision, bookingCode: identity.bookingCode };
        }
        record = claim.snapshot.val();
        let existing = await inspectBooking(record);
        if (existing.status === 'found' || existing.status === 'cancelled') return complete(existing.booking);
        if (existing.status !== 'absent') return uncertain('booking_conflict');
        const prepared = await authority.prepare({ ownerUid, booking });
        if (prepared.statusCode !== 200 || !safeCapacity(prepared.capacity)) {
          if (!record.capacity && [400, 409].includes(prepared.statusCode)) {
            if (!await patch({ status: 'rejected', reason: String(prepared.body?.error || 'invalid_booking').slice(0, 80) })) return uncertain();
            return { status: 'rejected', bookingCode: identity.bookingCode };
          }
          return uncertain('authority_not_ready');
        }
        if (record.planHash && (record.planHash !== prepared.planHash || canonicalJson(record.capacity) !== canonicalJson(prepared.capacity))) return uncertain('canonical_plan_changed');
        if (!record.planHash && !await patch({ planHash: prepared.planHash, capacity: prepared.capacity })) return uncertain('lease_lost_before_reserve');
        const capacity = record.capacity, counterRef = db.ref(capacity.counterPath);
        let counter = (await counterRef.get()).val(), marker = counter?.bookings?.[record.bookingCode];
        if (marker?.status === 'committed') return uncertain('committed_seat_without_booking');
        if (!marker) {
          if (record.leaseUntil <= now()) return uncertain('lease_lost_before_reserve');
          const reserved = await authority.reserve({ ownerUid, body: { ...capacity, action: 'reserve' } });
          counter = (await counterRef.get()).val(); marker = counter?.bookings?.[record.bookingCode];
          if (!marker) {
            if (record.attempts === 1 && reserved.statusCode === 409 && await patch({ status: 'rejected', reason: 'capacity_unavailable' })) return { status: 'rejected', bookingCode: identity.bookingCode };
            return uncertain('reservation_not_proven');
          }
        }
        if (String(counter.sourceRowId || '') !== capacity.sourceRowId || marker.ownerUid !== ownerUid || Number(marker.seats) !== capacity.requestedSeats) return uncertain('reservation_mismatch');
        const seal = await transact(counterRef, current => {
          const slot = current?.bookings?.[record.bookingCode];
          if (record.leaseUntil <= now() || !slot || slot.ownerUid !== ownerUid || Number(slot.seats) !== capacity.requestedSeats || String(current.sourceRowId || '') !== capacity.sourceRowId) return;
          if (slot.status === 'committing' && slotMatches(slot, record)) return current;
          if (slot.status !== 'reserved' || slot.commandId) return;
          return { ...current, bookings: { ...current.bookings, [record.bookingCode]: { ...slot, status: 'committing',
            commandId: record.commandId, requestHash, planHash: record.planHash, tripId: capacity.tripKey, capacityKey: capacity.capacityKey } }, updatedAt: now() };
        });
        if (!seal.committed || record.leaseUntil <= now()) return uncertain('reservation_not_sealed');
        // Stable code + protected marker permits recovery to retry an insert only after exact absence.
        // No automatic release: a previous writer may still finish after a network timeout.
        await authority.create({ ownerUid, booking, expectedReservation: { commandId: record.commandId, requestHash, planHash: record.planHash } });
        existing = await inspectBooking(record);
        if (existing.status === 'found' || existing.status === 'cancelled') return complete(existing.booking);
        return uncertain('creation_outcome_not_proven');
      } catch { return uncertain(); }
    }
  };
}
module.exports = { createBookingCommandService, commandIdentity };
