const assert = require('assert');
const auth = require('../functions/admin-auth.js');

assert.strictEqual(auth.bearerToken({ headers: {} }), '');
assert.strictEqual(auth.bearerToken({ headers: { authorization: 'Bearer token-1' } }), 'token-1');
assert.strictEqual(auth.hasPermission({ slTransitRole: 'owner' }, 'refundApprove'), true);
assert.strictEqual(auth.hasPermission({ slTransitPermissions: ['adminDashboardRead'] }, 'refundApprove'), false);
assert.strictEqual(auth.hasPermission({ slTransitPermissions: ['adminDashboardRead'] }, 'adminDashboardRead'), true);

const ownerAdmin = {
  calls: [],
  auth() {
    return { verifyIdToken: async (token, checkRevoked) => { ownerAdmin.calls.push([token, checkRevoked]); return { uid: 'owner-uid', slTransitRole: 'owner' }; } };
  }
};
const normalAdmin = {
  auth() {
    return { verifyIdToken: async () => ({ uid: 'user-uid' }) };
  }
};
const badAdmin = {
  auth() {
    return { verifyIdToken: async () => { throw new Error('bad token'); } };
  }
};

(async () => {
  const owner = await auth.requireAdmin({ headers: { authorization: 'Bearer ok' } }, ownerAdmin, 'refundApprove');
  assert.strictEqual(owner.uid, 'owner-uid');
  assert.strictEqual(ownerAdmin.calls[0][1], true, 'admin token verification must check revoked tokens');
  await assert.rejects(() => auth.requireAdmin({ headers: {} }, ownerAdmin, 'adminDashboardRead'), (err) => err.httpStatus === 401 && err.message === 'auth_required');
  await assert.rejects(() => auth.requireAdmin({ headers: { authorization: 'Bearer bad' } }, badAdmin, 'adminDashboardRead'), (err) => err.httpStatus === 401 && err.message === 'invalid_token');
  await assert.rejects(() => auth.requireAdmin({ headers: { authorization: 'Bearer ok' } }, normalAdmin, 'refundApprove'), (err) => err.httpStatus === 403 && err.message === 'permission_denied');
  const passenger = await auth.requireAuthenticated({ headers: { authorization: 'Bearer ok' } }, normalAdmin);
  assert.strictEqual(passenger.role, 'passenger');
  console.log('admin-auth.test.js OK');
})();
