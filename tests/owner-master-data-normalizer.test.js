'use strict';

const assert = require('assert');
const source = require('../erp-workbook-source-contract.js');

const candidate = source.buildCandidate({
  name: 'owner-master.xlsx',
  sheets: {
    '02_groups': { rows: [
      { a: 'group_001', b: 'กลุ่มหลัก', c: 1, d: 'เส้นทางหลัก', e: '34', f: 15, g: 60, h: 30, i: 100, j: 100, k: 'ใช่', l: 'ใช่' },
      { a: 'group_002', b: 'กลุ่มภายนอก', c: 2, d: 'เส้นทางหลัก', e: '34', f: 15, g: 60, h: 30, i: 100, j: 100, k: 'ใช่', l: 'ใช่' }
    ] },
    '03_fares': { rows: [
      { a: 'route-1', b: 'group_001', c: 1, d: 'origin', e: 'ต้นทาง', f: 'hub', g: 'จุดต่อ', h: 50, i: 'ใช่' }
    ] },
    '04_timetable': { rows: [
      { a: 'trip-1', b: 'G_001-P_001', c: 'group_001', d: 'ต้นทาง', e: 'จุดต่อ', f: '09:00', g: 'ใช่', h: 3, i: '' },
      { a: 'trip-2', b: 'G_002-P_001', c: 'กลุ่มภายนอก', d: 'จุดต่อ', e: 'ปลายทาง', f: '10:00', g: 'ไม่', h: 0, i: '' }
    ] },
    '06_vehicles': { rows: [
      { a: 'veh_001', b: 'car1', c: 'Q_001', d: 'rotation', e: 'ทดลอง', f: '', g: 'ใช่', h: 'driver_001', i: 'คนขับ', j: '', k: '', l: 'TEMP', m: 'ทดลอง' }
    ] },
    '08_mapping': { rows: [
      { a: 'Driver App Vehicle Group Mapping' },
      { a: 'runtimeVehicleId', b: 'erpVehicleId', c: 'serviceGroupId', d: 'serviceGroupNameTh' },
      { a: 'car1', b: 'veh_001', c: 'group_001', d: 'กลุ่มหลัก' }
    ] }
  }
});

assert.strictEqual(Object.keys(candidate.masterData.serviceGroups).length, 2);
assert.strictEqual(candidate.masterData.scheduleRows[1].serviceGroupId, 'group_002', 'route prefix must normalize external group id');
assert.strictEqual(candidate.masterData.vehicles.veh_001.serviceGroupId, 'group_001');
assert.strictEqual(candidate.masterData.sensitiveCredentialCount, 1, 'credentials must be counted, not exported');
assert.strictEqual(candidate.manifest.masterDataCounts.serviceGroups, 2);
console.log('owner master data normalizer ok');
