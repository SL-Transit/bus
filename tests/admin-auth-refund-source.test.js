const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const adminReadModel = fs.readFileSync(path.join(root, 'admin-dashboard-read-model.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin-erp.html'), 'utf8');
const rulesProposal = fs.readFileSync(path.join(root, 'docs', 'review', 'admin-auth-refund-rules-proposal.md'), 'utf8');
const refundActions = fs.readFileSync(path.join(root, 'functions', 'refund-admin-actions.js'), 'utf8');

assert(index.includes('adminAuth.requireAdmin(req, admin, "adminDashboardRead")'), 'Dashboard Function must verify adminDashboardRead permission');
assert(index.includes('exports.requestRefund'), 'requestRefund Function must be exported');
assert(index.includes('exports.approveRefund'), 'approveRefund Function must be exported');
assert(index.includes('exports.completeRefund'), 'completeRefund Function must be exported');
assert(index.includes('exports.startRefundProcessing'), 'startRefundProcessing Function must be exported');
assert(index.includes('exports.cancelBookingAsAdmin'), 'admin cancellation Function must be exported');
assert(index.includes('releaseAdminCancelCapacity'), 'admin cancellation must release capacity through backend path');
assert(index.includes('operations/refundAudit') || fs.readFileSync(path.join(root, 'functions', 'refund-admin-actions.js'), 'utf8').includes('operations/refundAudit'), 'refund audit path must exist');

assert(adminHtml.includes('firebase-auth-compat.js'), 'Admin page must load Firebase Auth compat SDK');
assert(adminReadModel.includes('getIdToken'), 'Admin read model must get Firebase ID token');
assert(adminReadModel.includes('Authorization'), 'Admin read model must send Authorization header');
assert(adminReadModel.includes('SESSION_TIMEOUT_MS = 30 * 60 * 1000'), 'Admin read model must enforce 30 minute session timeout');
assert(adminHtml.includes('onAuthStateChanged'), 'Admin page must wait for auth initial state');
assert(adminHtml.includes('signInWithEmailAndPassword'), 'Admin page must provide login UI');
assert(adminHtml.includes('signOut'), 'Admin page must provide logout');
assert(adminHtml.includes('sessionStorage'), 'Admin page must persist idle timeout activity in sessionStorage');
assert(!adminHtml.includes("db.ref('bookings').update"), 'Admin browser must not update bookings directly');
assert(!adminHtml.includes('refundStatus') || !adminHtml.includes('.update({ refundStatus'), 'Admin browser must not write refund state directly');
assert(refundActions.includes('operations/refunds'), 'Refund operation details must move to operations/refunds');
assert(refundActions.includes('idempotencyKeyHash'), 'Refund audit/idempotency must store hashed idempotency key');
assert(!refundActions.includes('idempotencyKey: idempotencyKey'), 'Refund audit must not store raw idempotency key');
assert(!refundActions.includes('refundReference ='), 'Public booking patch must not store raw refund reference');

assert(rulesProposal.includes('slTransitRole'), 'Rules proposal must use custom claims');
assert(rulesProposal.includes('"bookings"'), 'Rules proposal must include bookings path protections');
assert(rulesProposal.includes('"refundStatus": { ".write": false }'), 'Rules proposal must block browser refundStatus writes');
assert(rulesProposal.includes('adminCancelledByUid'), 'Rules proposal must block admin cancellation actor fields on public booking');
assert(rulesProposal.includes('"refundAudit"'), 'Rules proposal must protect refund audit');
assert(rulesProposal.includes('proposal only'), 'Rules proposal must not be represented as deployed rules');

console.log('admin-auth-refund-source.test.js OK');
