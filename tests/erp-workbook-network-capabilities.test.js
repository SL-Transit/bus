const assert = require('assert');
const source = require('../erp-workbook-booking-source.js');

const index = source.build({
  fare_1: { sourceRowId: 'fare_1', fromNameTh: 'ต้นทาง', toNameTh: 'จุดต่อ', serviceGroupId: 'operator_001', amount: 50 },
  fare_2: { sourceRowId: 'fare_2', fromNameTh: 'จุดต่อ', toNameTh: 'ปลายทาง', serviceGroupId: 'operator_002', amount: 0 }
}, {
  time_1: { sourceRowId: 'time_1', scheduleOfferId: 'trip_1', originNameTh: 'ต้นทาง', destinationNameTh: 'จุดต่อ', departureTime: '08:00' },
  time_2: { sourceRowId: 'time_2', scheduleOfferId: 'trip_2', originNameTh: 'จุดต่อ', destinationNameTh: 'ปลายทาง', departureTime: '10:00' }
}, {}, {
  operator_001: { displayNameTh: 'บริษัทหลัก', operationMode: 'integrated', operatorId: 'operator_001' },
  operator_002: { displayNameTh: 'บริษัทพันธมิตร', operationMode: 'schedule_only', operatorId: 'operator_002' }
});

const internal = index.selectedRoute('ต้นทาง', 'จุดต่อ');
const external = index.selectedRoute('จุดต่อ', 'ปลายทาง');
assert.strictEqual(internal.operationMode, 'integrated');
assert.strictEqual(internal.trackingMode, 'live');
assert.strictEqual(internal.bookingEligible, true);
assert.strictEqual(external.operationMode, 'schedule_only');
assert.strictEqual(external.trackingMode, 'schedule_only');
assert.strictEqual(external.bookingEligible, false);
assert.strictEqual(external.referenceOnly, true);
assert.strictEqual(external.segments[0].times[0].vehicleId, undefined);
assert.strictEqual(external.segments[0].times[0].noLiveTracking, true);
assert.strictEqual(index.getNetworkLegs()[0].networkLegReady, false);

const readyIndex = source.build({
  fare_1: { sourceRowId: 'fare_1', fromNameTh: 'ต้นทาง', toNameTh: 'ปลายทาง', serviceGroupId: 'operator_001', amount: 50 }
}, {
  time_1: { sourceRowId: 'time_1', scheduleOfferId: 'trip_ready', originNameTh: 'ต้นทาง', destinationNameTh: 'ปลายทาง', departureTime: '08:00', arrivalTime: '10:00' }
}, {}, { operator_001: { operationMode: 'integrated' } });
assert.strictEqual(readyIndex.getNetworkLegs()[0].networkLegReady, true);
assert.strictEqual(readyIndex.getNetworkLegs()[0].arrivalTime, '10:00');

console.log('ERP workbook network capabilities ok');
