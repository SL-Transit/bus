const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = require('../erp-workbook-booking-source.js');

const candidatePath = path.join(__dirname, '..', 'outputs', 'erp-workbook-source-review-20260801', 'sl-transit-erp-workbook-source-candidate.json');
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8')).payload;
const index = source.build(candidate.routeFareRows, candidate.scheduleRows, candidate.manifest);

assert.strictEqual(index.routeFareRowCount, 244);
assert.strictEqual(index.scheduleRowCount, 881);
assert(index.originOptions.length > 0);

const fare = Object.values(candidate.routeFareRows)[0];
const route = index.selectedRoute(fare.fromNameTh, fare.toNameTh);
assert(route, 'selected route must be projected from its fare row');
assert.strictEqual(route.fareAmount, Number(fare.amount));
assert.strictEqual(route.pairId, fare.sourceRowId);
assert(Array.isArray(route.segments) && route.segments.length === 1);

const expectedTimes = Object.values(candidate.scheduleRows).filter((row) => (
  row.originNameTh === fare.fromNameTh && row.destinationNameTh === fare.toNameTh
));
assert.strictEqual(route.segments[0].times.length, expectedTimes.length);
assert.strictEqual(index.selectedRouteByRowId(fare.sourceRowId).pairId, fare.sourceRowId);

const projectedTimes = [];
for (const origin of index.originOptions) {
  for (const option of index.destinationOptionsByOrigin[origin.label] || []) {
    const selected = index.selectedRoute(origin.label, option.label);
    projectedTimes.push(...selected.segments[0].times);
  }
}
assert.strictEqual(projectedTimes.length, 881, 'all timetable rows must remain reachable through the 244 fare routes');
assert.strictEqual(new Set(projectedTimes.map((row) => row.scheduleRowId)).size, 881, 'timetable rows must not be duplicated');

console.log('ERP workbook booking source ok: 244 fare routes, 881 timetable rows');
