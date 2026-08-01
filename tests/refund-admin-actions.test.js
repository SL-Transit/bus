const assert = require('assert');
const refund = require('../functions/refund-admin-actions.js');

function mockAdmin(initial) {
  const store = JSON.parse(JSON.stringify(initial || {}));
  const writes = [];
  function ref(path) {
    return {
      async get() {
        return { val: () => store[path] == null ? null : JSON.parse(JSON.stringify(store[path])) };
      },
      async update(patch) {
        writes.push({ path, op: 'update', patch });
        if (!path) {
          Object.keys(patch).forEach((key) => {
            const parts = key.split('/');
            const leaf = parts.pop();
            const parentPath = parts.join('/');
            store[parentPath] = Object.assign({}, store[parentPath] || {}, { [leaf]: patch[key] });
          });
          return;
        }
        store[path] = Object.assign({}, store[path] || {}, patch);
      },
      async set(value) {
        writes.push({ path, op: 'set', value });
        store[path] = value;
      },
      async transaction(fn) {
        const before = store[path] == null ? null : JSON.parse(JSON.stringify(store[path]));
        const next = fn(before);
        if (next === undefined) {
          return { committed: false, snapshot: { val: () => before } };
        }
        store[path] = next;
        return { committed: true, snapshot: { val: () => next } };
      }
    };
  }
  return {
    store,
    writes,
    database: Object.assign(() => ({ ref }), { ServerValue: { TIMESTAMP: '__SERVER_TIMESTAMP__' } })
  };
}

(async () => {
  const paidBooking = { paymentStatus: 'paid', paidAt: 1, paidAmount: 100, paymentOwnership: 'sl_transit', externalPaymentRequired: false, refundEligibleAmount: 80 };
  assert.throws(() => refund.validateAmount(paidBooking, 90), /refund_amount_exceeds_eligible/);
  assert.throws(() => refund.validateAmount(Object.assign({}, paidBooking, { paidAmount: 70, refundEligibleAmount: 80 }), 71), /refund_amount_exceeds_paid/);
  assert.throws(() => refund.validateAmount({ price: 100, refundEligibleAmount: 80 }, 80), /missing_paid_amount_contract/);
  assert.throws(() => refund.validateAmount(Object.assign({}, paidBooking, { refundEligibleAmount: undefined }), 80), /missing_refund_eligibility_contract/);
  assert.strictEqual(refund.validateAmount(paidBooking, 80), 80);
  assert.strictEqual(refund.bookingOwnerUid({ passengerIdentity: { firebaseUid: 'passenger-1' } }), 'passenger-1');

  const audit = refund.auditEvent('completeRefund', 'BK123456', 'processing', 'refunded', 80, { uid: 'owner-1', role: 'owner' }, 'idem-1', 'success');
  const serializedAudit = JSON.stringify(audit);
  ['name', 'phone', 'lineUserId', 'paymentEvidence', 'slip'].forEach((field) => {
    assert(!serializedAudit.includes(field), 'audit must not expose ' + field);
  });

  const admin = mockAdmin({
    'bookings/BK123456': {
      code: 'BK123456',
      paymentStatus: 'paid',
      paidAt: 1,
      paidAmount: 100,
      paymentOwnership: 'sl_transit',
      externalPaymentRequired: false,
      refundEligibleAmount: 80,
      refundStatus: 'processing',
      refundAmount: 80
    }
  });
  const result = await refund.runRefundAction({
    admin,
    action: 'completeRefund',
    nextStatus: 'refunded',
    actor: { uid: 'owner-1', role: 'owner' },
    bookingId: 'BK123456',
    idempotencyKey: 'idem-complete-1',
    body: { refundReference: 'REF-001' }
  });
  assert.strictEqual(result.refundStatus, 'refunded');
  assert.strictEqual(admin.store['bookings/BK123456'].refundedAt, '__SERVER_TIMESTAMP__');
  assert.strictEqual(admin.store['bookings/BK123456'].refundReference, undefined);
  assert.strictEqual(admin.store['operations/refunds/refund_' + refund.hashBookingId('BK123456').slice(0, 32)].refundReferenceHash, refund.safeKeyHash('REF-001', 'refund_reference'));

  await refund.runRefundAction({
    admin: mockAdmin({ 'bookings/BKPASS01': Object.assign({ code: 'BKPASS01', refundStatus: 'none', passengerUid: 'passenger-1' }, paidBooking) }),
    action: 'requestRefund',
    nextStatus: 'requested',
    actor: { uid: 'passenger-1', role: 'passenger' },
    bookingId: 'BKPASS01',
    idempotencyKey: 'idem-passenger-request',
    body: { refundAmount: 50, refundReasonCode: 'customer_request' }
  });

  await assert.rejects(() => refund.runRefundAction({
    admin: mockAdmin({ 'bookings/BKPASS02': Object.assign({ code: 'BKPASS02', refundStatus: 'none', passengerUid: 'passenger-2' }, paidBooking) }),
    action: 'requestRefund',
    nextStatus: 'requested',
    actor: { uid: 'passenger-1', role: 'passenger' },
    bookingId: 'BKPASS02',
    idempotencyKey: 'idem-passenger-denied',
    body: { refundAmount: 50 }
  }), /booking_ownership_unverified/);

  await assert.rejects(() => refund.runRefundAction({
    admin: mockAdmin({ 'bookings/BK999999': Object.assign({ code: 'BK999999', refundStatus: 'requested', refundAmount: 80 }, paidBooking) }),
    action: 'completeRefund',
    nextStatus: 'refunded',
    actor: { uid: 'owner-1', role: 'owner' },
    bookingId: 'BK999999',
    idempotencyKey: 'idem-invalid-transition',
    body: { refundReference: 'REF-002' }
  }), /invalid_refund_state_transition/);

  const flowAdmin = mockAdmin({
    'bookings/BKFLOW1': Object.assign({ code: 'BKFLOW1', refundStatus: 'none', passengerUid: 'passenger-1' }, paidBooking)
  });
  const actorOwner = { uid: 'owner-1', role: 'owner' };
  await refund.runRefundAction({ admin: flowAdmin, action: 'requestRefund', nextStatus: 'requested', actor: { uid: 'passenger-1', role: 'passenger' }, bookingId: 'BKFLOW1', idempotencyKey: 'flow-1', body: { refundAmount: 80 } });
  await refund.runRefundAction({ admin: flowAdmin, action: 'reviewRefund', nextStatus: 'under_review', actor: actorOwner, bookingId: 'BKFLOW1', idempotencyKey: 'flow-2', body: {} });
  await refund.runRefundAction({ admin: flowAdmin, action: 'approveRefund', nextStatus: 'approved', actor: actorOwner, bookingId: 'BKFLOW1', idempotencyKey: 'flow-3', body: { refundAmount: 80 } });
  await assert.rejects(() => refund.runRefundAction({ admin: flowAdmin, action: 'completeRefund', nextStatus: 'refunded', actor: actorOwner, bookingId: 'BKFLOW1', idempotencyKey: 'flow-bad-skip', body: { refundReference: 'REF-SKIP' } }), /invalid_refund_state_transition/);
  await refund.runRefundAction({ admin: flowAdmin, action: 'startRefundProcessing', nextStatus: 'processing', actor: actorOwner, bookingId: 'BKFLOW1', idempotencyKey: 'flow-4', body: {} });
  await refund.runRefundAction({ admin: flowAdmin, action: 'completeRefund', nextStatus: 'refunded', actor: actorOwner, bookingId: 'BKFLOW1', idempotencyKey: 'flow-5', body: { refundReference: 'REF-FLOW-001' } });
  assert.strictEqual(flowAdmin.store['bookings/BKFLOW1'].refundStatus, 'refunded');
  assert.strictEqual(flowAdmin.store['bookings/BKFLOW1'].refundUpdatedByUid, undefined);
  assert.strictEqual(flowAdmin.store['bookings/BKFLOW1'].refundReference, undefined);

  await assert.rejects(() => refund.runRefundAction({
    admin: mockAdmin({
      'bookings/BKREF01': Object.assign({ code: 'BKREF01', refundStatus: 'processing', refundAmount: 80 }, paidBooking),
      'bookings/BKREF02': Object.assign({ code: 'BKREF02', refundStatus: 'processing', refundAmount: 80 }, paidBooking),
      ['operations/refundReferences/' + refund.safeKeyHash('REF-DUP', 'refund_reference')]: { bookingIdHash: refund.hashBookingId('BKREF01') }
    }),
    action: 'completeRefund',
    nextStatus: 'refunded',
    actor: actorOwner,
    bookingId: 'BKREF02',
    idempotencyKey: 'dup-ref-1',
    body: { refundReference: 'REF-DUP' }
  }), /refund_reference_conflict/);

  const duplicate = await refund.runRefundAction({
    admin,
    action: 'completeRefund',
    nextStatus: 'refunded',
    actor: { uid: 'owner-1', role: 'owner' },
    bookingId: 'BK123456',
    idempotencyKey: 'idem-complete-2',
    body: { refundReference: 'REF-001' }
  });
  assert.strictEqual(duplicate.idempotent, true, 'completed refund cannot be completed twice');
  console.log('refund-admin-actions.test.js OK');
})();
