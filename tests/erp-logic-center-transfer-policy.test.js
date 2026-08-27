'use strict';

const assert = require('node:assert/strict');
const {
  DEFAULT_TRANSFER_POLICY,
  minutesBetweenForward,
  decideTransferFeasibility,
  buildErpLogicCenterDryRun
} = require('../tools/erp-logic-center-dry-run.js');

assert.equal(DEFAULT_TRANSFER_POLICY.minTransferMinutes, 15, 'default min transfer mismatch');
assert.equal(DEFAULT_TRANSFER_POLICY.idealWaitMinutes, 30, 'default ideal transfer mismatch');
assert.equal(DEFAULT_TRANSFER_POLICY.maxWaitMinutes, 60, 'default max transfer mismatch');
assert.equal(minutesBetweenForward('23:50', '00:10'), 20, 'forward midnight wait mismatch');

const ideal = decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '10:30' });
assert.equal(ideal.status, 'feasible', '30 minute wait should be feasible');
assert.equal(ideal.feasible, true, 'feasible flag mismatch');
assert.equal(ideal.idealDeltaMinutes, 0, 'ideal wait delta mismatch');

const minBoundary = decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '10:15' });
assert.equal(minBoundary.status, 'feasible', '15 minute wait should be feasible');

const shortWait = decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '10:14' });
assert.equal(shortWait.status, 'infeasible', 'under-min wait must be infeasible');
assert.equal(shortWait.reason, 'short_wait', 'short wait reason mismatch');

const maxBoundary = decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '11:00' });
assert.equal(maxBoundary.status, 'feasible', '60 minute wait should be feasible');

const longWait = decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '11:01' });
assert.equal(longWait.status, 'long_wait', 'over-max wait must be long_wait');
assert.equal(longWait.feasible, false, 'long wait should not be booking-feasible');

const inactive = decideTransferFeasibility({ waitMinutes: 30, active: false });
assert.equal(inactive.status, 'unavailable', 'inactive transfer must be unavailable');

const missing = decideTransferFeasibility({ arrivalTime: '', departureTime: '11:00' });
assert.equal(missing.status, 'unknown', 'missing time must be unknown');

const custom = decideTransferFeasibility({
  arrivalTime: '10:00',
  departureTime: '10:10',
  policy: { minTransferMinutes: 5, idealWaitMinutes: 10, maxWaitMinutes: 20 }
});
assert.equal(custom.status, 'feasible', 'custom policy should allow 10 minute transfer');
assert.equal(custom.idealDeltaMinutes, 0, 'custom ideal delta mismatch');

const dryRun = buildErpLogicCenterDryRun();
assert.equal(dryRun.counts.transfer.feasible, 1, 'sample feasible transfer count mismatch');
assert.equal(dryRun.counts.transfer.infeasible, 1, 'sample infeasible transfer count mismatch');
assert.equal(dryRun.counts.transfer.long_wait, 1, 'sample long wait transfer count mismatch');
assert.equal(dryRun.counts.transfer.unknown, 1, 'sample unknown transfer count mismatch');

console.log('erp-logic-center transfer policy ok');
