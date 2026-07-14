'use strict';

const assert = require('node:assert/strict');
const center = require('../fare-decision-center.js');

const fare = center.decideFare({
  pair: { paymentOwnership: 'sl_transit' },
  segment: {},
  timeEntry: { fareAmount: 70 },
  option: {},
  serviceFeeAmount: 5
});
assert.equal(fare.status, 'ready');
assert.equal(fare.fareAmount, 70);
assert.equal(fare.serviceFeeAmount, 5);
assert.equal(fare.totalAmount, 75);
assert.equal(fare.sourceScope, 'time');
assert.equal(fare.source, 'erp_logic_center');

const pairFare = center.decideFare({
  pair: { fareAmount: 55 },
  segment: {},
  timeEntry: {},
  option: {}
});
assert.equal(pairFare.status, 'ready');
assert.equal(pairFare.fareAmount, 55);
assert.equal(pairFare.sourceScope, 'pair');

const external = center.decideFare({
  pair: { passengerDisplayMode: 'external_reference', slTransitFareCollection: false, paymentOwnership: 'external_pay' },
  segment: {},
  timeEntry: {},
  option: {}
});
assert.equal(external.status, 'external_reference');
assert.equal(external.fareAmount, null);
assert.equal(external.totalAmount, null);
assert.equal(external.externalPaymentRequired, true);
assert.equal(external.slTransitFareCollection, false);

const missing = center.decideFare({
  pair: { paymentOwnership: 'sl_transit' },
  segment: {},
  timeEntry: {},
  option: {},
  serviceFeeAmount: 5
});
assert.equal(missing.status, 'NEEDS_CONTRACT_FIELD');
assert.equal(missing.fareAmount, null);
assert.equal(missing.totalAmount, null);
assert.equal(missing.missingField, 'preview/publishedSchedule/pairs/{pairKey}.fareAmount or segment/time fareAmount');

console.log('fare-decision-center ok');
