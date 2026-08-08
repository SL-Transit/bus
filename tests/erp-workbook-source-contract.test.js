'use strict';

const assert = require('assert');
const source = require('../erp-workbook-source-contract.js');

function rows(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    route_id: prefix + String(index + 1),
    value: index + 1
  }));
}

function scheduleRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    trip_id: 'schedule-' + (index + 1),
    route_id: 'route-' + (index + 1),
    group_id: 'group_001',
    origin: 'A',
    destination: 'B',
    departure_time: '09:40',
    booking_enabled: true,
    capacity: 3,
    note: ''
  }));
}

const workbook = {
  name: 'owner-approved.xlsx',
  sheets: {
    '03_routes_and_fares': { rows: rows(244, 'fare-') },
    '04_timetable': { rows: scheduleRows(881) }
  }
};

const candidate = source.buildCandidate(workbook);
assert.strictEqual(candidate.schemaVersion, 'erpWorkbookSource.v1');
assert.strictEqual(Object.keys(candidate.routeFareRows).length, 244);
assert.strictEqual(Object.keys(candidate.scheduleRows).length, 881);
assert.strictEqual(candidate.routeFareRows.fare_0002.sourceRowNumber, 2);
assert.strictEqual(candidate.routeFareRows.fare_0002.routeId, 'fare-1');
assert.strictEqual(candidate.routeFareRows.fare_0002.sourceValues.route_id, 'fare-1');
assert.strictEqual(candidate.scheduleRows.schedule_0882.sourceRowNumber, 882);
assert.strictEqual(candidate.scheduleRows.schedule_0002.scheduleOfferId, 'schedule-1');

const numericTime = source.buildCandidate({
  name: 'numeric-time.xlsx',
  sheets: {
    '03_routes_and_fares': { rows: rows(244, 'fare-') },
    '04_timetable': { rows: Array.from({ length: 881 }, (_, index) => ({
      trip_id: 'trip-' + index,
      route_id: 'route-' + index,
      group_id: 'group_001',
      origin: 'A',
      destination: 'B',
      departure_time: index === 0 ? 0.7222222222222222 : '09:40'
    })) }
  }
});
assert.strictEqual(numericTime.scheduleRows.schedule_0002.departureTime, '17:20');
assert.strictEqual(numericTime.reconciliation.valid, true);
assert.strictEqual(candidate.reconciliation.valid, true);
assert.strictEqual(candidate.manifest.readyForFirebaseReview, true);
assert.strictEqual(candidate.manifest.readyForApply, false);

const blankFareRows = rows(244, 'fare-');
blankFareRows.splice(1, 0, {});
const blankRowWorkbook = {
  name: 'blank-row-owner-workbook.xlsx',
  sheets: {
    '03_routes_and_fares': { rows: blankFareRows },
    '04_timetable': { rows: scheduleRows(881) }
  }
};
const blankRowCandidate = source.buildCandidate(blankRowWorkbook);
assert.strictEqual(blankRowCandidate.routeFareRows.fare_0004.sourceRowNumber, 4, 'blank Excel rows must not shift the original source row number');
assert.strictEqual(blankRowCandidate.reconciliation.valid, true, 'blank rows with valid source order remain reviewable');

const invalidOrderCandidate = source.buildCandidate(workbook);
invalidOrderCandidate.scheduleRows.schedule_0003.sourceRowNumber = 2;
const invalidOrder = source.validateCandidate(invalidOrderCandidate);
assert(invalidOrder.blockers.some((item) => item.code === 'schedule-source-row-order-invalid'), 'non-increasing Excel source rows must block review');

const incomplete = source.buildCandidate({
  name: 'incomplete.xlsx',
  sheets: {
    '03_routes_and_fares': { rows: rows(243, 'fare-') },
    '04_timetable': { rows: scheduleRows(880) }
  }
});
assert.strictEqual(incomplete.reconciliation.valid, false);
assert.deepStrictEqual(incomplete.reconciliation.blockers.map(item => item.code), [
  'route-fare-row-count-mismatch',
  'schedule-row-count-mismatch'
]);

console.log('erp workbook source contract ok');
