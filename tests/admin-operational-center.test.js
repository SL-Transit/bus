const assert = require('assert');
const fs = require('fs');
const path = require('path');
const center = require('../functions/admin-operational-center.js');

const actor = { uid: 'owner-1', role: 'owner' };
const now = Date.parse('2026-07-30T09:00:00+07:00');

const globalClose = center.normalizeControl({
  scope: { type: 'system' },
  state: 'temporarily_closed',
  reason: 'weather',
  customerMessageTh: 'เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว',
  effectiveStartMs: now - 1000,
  effectiveEndMs: now + 3600000
}, actor, null, now);
assert.strictEqual(globalClose.workflowState, 'published');
assert.strictEqual(globalClose.actorRole, 'owner');
assert.strictEqual(globalClose.version, 1);

let decision = center.evaluateControls({ [globalClose.controlId]: globalClose }, {
  serviceDate: '2026-07-30',
  tripId: 'trip_0900',
  departureTime: '09:00'
}, now);
assert.strictEqual(decision.bookingOpen, false, 'global closure blocks booking');
assert.strictEqual(decision.customerMessageTh, 'เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว');

const tripOpen = center.normalizeControl({
  scope: { type: 'trip', tripId: 'trip_0900' },
  state: 'open',
  reason: 'owner_reopen',
  effectiveStartMs: now - 500
}, actor, null, now + 1);
decision = center.evaluateControls({ [globalClose.controlId]: globalClose, [tripOpen.controlId]: tripOpen }, {
  serviceDate: '2026-07-30',
  tripId: 'trip_0900',
  departureTime: '09:00'
}, now);
assert.strictEqual(decision.bookingOpen, true, 'more specific trip open control can reopen');

const stopClose = center.normalizeControl({
  scope: { type: 'boarding_stop', boardingStopId: 'stop_001', serviceDate: '2026-07-30' },
  state: 'temporarily_closed',
  reason: 'stop_closed',
  effectiveStartMs: now - 1000
}, actor, null, now);
decision = center.evaluateControls({ [stopClose.controlId]: stopClose }, {
  serviceDate: '2026-07-30',
  boardingStopId: 'stop_001'
}, now);
assert.strictEqual(decision.bookingOpen, false, 'boarding stop closure blocks matching stop');

const future = center.normalizeControl({
  scope: { type: 'departure_time', departureTime: '12:00' },
  state: 'scheduled_closure',
  reason: 'scheduled',
  effectiveStartMs: now + 3600000
}, actor, null, now);
assert.strictEqual(center.evaluateControls({ [future.controlId]: future }, { departureTime: '12:00' }, now).bookingOpen, true, 'future closure does not affect now');
assert.strictEqual(center.summarizeControls({ [future.controlId]: future }, now).future, 1);

const index = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
assert(index.includes('exports.readAdminOperationalState'), 'must expose operational read endpoint');
assert(index.includes('exports.publishBookingControl'), 'must expose publish booking control endpoint');
assert(index.includes('exports.rollbackBookingControl'), 'must expose rollback endpoint');
assert(index.includes('decoded.slTransitRole !== "owner"'), 'admin endpoints must require owner custom claim');
assert(index.includes('verifyIdToken(tokenMatch[1], true)'), 'admin token verification must check revoked/disabled tokens');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const navSource = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>', html.indexOf('<nav class="nav"')));
assert(html.includes('ADMIN_OPERATIONAL_STATE_ENDPOINT'), 'Admin UI must read operational state');
assert(html.includes('ADMIN_BOOKING_CONTROL_ENDPOINT'), 'Admin UI must publish booking controls through Function');
assert(html.includes('adminTestBypass') && html.includes('localhost'), 'test bypass must be localhost-scoped');
assert(!navSource.includes('data-page="schedule"'), 'sidebar must not include a tenth schedule module');

console.log('admin-operational-center.test.js OK');
