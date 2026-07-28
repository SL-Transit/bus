const assert = require('assert');
const auth = require('../functions/admin-auth.js');

assert.strictEqual(auth.bearerToken({ headers: {} }), '');
assert.strictEqual(auth.bearerToken({ headers: { authorization: 'Bearer token-1' } }), 'token-1');
assert.strictEqual(auth.hasPermission({ slTransitRole: 'owner' }, 'refundApprove'), true);
assert.strictEqual(auth.hasPermission({ slTransitPermissions: ['adminDashboardRead'] }, 'refundApprove'), false);
assert.strictEqual(auth.hasPermission({ slTransitPermissions: ['adminDashboardRead'] }, 'adminDashboardRead'), true);

const ownerAdmin = {
  auth() {
    return { verifyIdToken: async () => ({ uid: 'owner-uid', slTransitRole: 'owner' }) };
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
  await assert.rejects(() => auth.requireAdmin({ headers: {} }, ownerAdmin, 'adminDashboardRead'), (err) => err.httpStatus === 401 && err.message === 'auth_required');
  await assert.rejects(() => auth.requireAdmin({ headers: { authorization: 'Bearer bad' } }, badAdmin, 'adminDashboardRead'), (err) => err.httpStatus === 401 && err.message === 'invalid_token');
  await assert.rejects(() => auth.requireAdmin({ headers: { authorization: 'Bearer ok' } }, normalAdmin, 'refundApprove'), (err) => err.httpStatus === 403 && err.message === 'permission_denied');
  const passenger = await auth.requireAuthenticated({ headers: { authorization: 'Bearer ok' } }, normalAdmin);
  assert.strictEqual(passenger.role, 'passenger');
  console.log('admin-auth.test.js OK');
})();

