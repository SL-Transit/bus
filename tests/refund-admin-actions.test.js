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
        store[path] = Object.assign({}, store[path] || {}, patch);
      },
      async set(value) {
        writes.push({ path, op: 'set', value });
        store[path] = value;
      },
      async transaction(fn) {
        const before = store[path] == null ? null : JSON.parse(JSON.stringify(store[path]));
        const next = fn(before);
        if (before != null) {
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
  assert.throws(() => refund.validateAmount({ price: 100, refundEligibleAmount: 80 }, 90), /refund_amount_exceeds_eligible/);
  assert.throws(() => refund.validateAmount({ price: 100 }, 101), /refund_amount_exceeds_paid/);
  assert.strictEqual(refund.validateAmount({ price: 100, refundEligibleAmount: 80 }, 80), 80);
  assert.strictEqual(refund.bookingOwnerUid({ passengerIdentity: { firebaseUid: 'passenger-1' } }), 'passenger-1');

  const audit = refund.auditEvent('completeRefund', 'BK123456', 'processing', 'refunded', 80, { uid: 'owner-1', role: 'owner' }, 'idem-1', 'success');
  const serializedAudit = JSON.stringify(audit);
  ['name', 'phone', 'lineUserId', 'paymentEvidence', 'slip'].forEach((field) => {
    assert(!serializedAudit.includes(field), 'audit must not expose ' + field);
  });

  const admin = mockAdmin({
    'bookings/BK123456': {
      code: 'BK123456',
      price: 100,
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
  assert.strictEqual(admin.store['bookings/BK123456'].refundReference, 'REF-001');

  await refund.runRefundAction({
    admin: mockAdmin({ 'bookings/BKPASS01': { code: 'BKPASS01', price: 100, refundStatus: 'none', passengerUid: 'passenger-1' } }),
    action: 'requestRefund',
    nextStatus: 'requested',
    actor: { uid: 'passenger-1', role: 'passenger' },
    bookingId: 'BKPASS01',
    idempotencyKey: 'idem-passenger-request',
    body: { refundAmount: 50, refundReasonCode: 'customer_request' }
  });

  await assert.rejects(() => refund.runRefundAction({
    admin: mockAdmin({ 'bookings/BKPASS02': { code: 'BKPASS02', price: 100, refundStatus: 'none', passengerUid: 'passenger-2' } }),
    action: 'requestRefund',
    nextStatus: 'requested',
    actor: { uid: 'passenger-1', role: 'passenger' },
    bookingId: 'BKPASS02',
    idempotencyKey: 'idem-passenger-denied',
    body: { refundAmount: 50 }
  }), /booking_ownership_unverified/);

  await assert.rejects(() => refund.runRefundAction({
    admin: mockAdmin({ 'bookings/BK999999': { code: 'BK999999', price: 100, refundStatus: 'requested' } }),
    action: 'completeRefund',
    nextStatus: 'refunded',
    actor: { uid: 'owner-1', role: 'owner' },
    bookingId: 'BK999999',
    idempotencyKey: 'idem-invalid-transition',
    body: { refundReference: 'REF-002' }
  }), /invalid_refund_state_transition/);

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
