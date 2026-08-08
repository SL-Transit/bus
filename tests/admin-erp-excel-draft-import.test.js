'use strict';

const assert = require('assert');
const contract = require('../admin-erp-excel-draft-import.js');

function sheet(name, rows) {
  const definition = contract.SHEETS[name];
  const result = { name, headers: definition.headers.slice(), rows };
  if (definition.headerMode === 'keyValue') result.title = definition.headers[0];
  return result;
}

function validWorkbook() {
  return {
    name: contract.WORKBOOK_NAME,
    sheets: [
      sheet('01_ข้อมูลป้ายต้นทาง', [
        ['P-test', 'stop_test', 'ป้ายทดสอบ', 13, 101, '🚏', 1, 'main', 'ใช่', '']
      ]),
      sheet('02_เส้นทาง', [
        ['group_test', 'กลุ่มทดสอบ', 1, 'เส้นทางหลัก', 'stop_test', 15, 60, 30, 100, 1, 'ใช่', 'ใช่']
      ]),
      sheet('03_เส้นทางและราคา', [
        ['route_test', 'group_test', 1, 'stop_test', 'ป้ายทดสอบ', 'stop_test', 'ป้ายทดสอบ', 50, 'ใช่']
      ]),
      sheet('04_รอบเวลา', [
        ['trip_test', 'route_test', 'กลุ่มทดสอบ', 'ป้ายทดสอบ', 'ป้ายทดสอบ', '09:00', 'ใช่', 3, '']
      ]),
      sheet('06_รถและคิว', [
        ['vehicle_test', 'car-test', 'queue_test', 'rotation', 'private-plate', 'private-phone', 'ใช่', 'private-driver', 'private-name', 'private-driver-phone', 'private-login', 'private-password', '']
      ]),
      sheet('05_คิวรถและเวลา', [
        [0, 'trip_test', 1, 'route_test', 'เส้นทางทดสอบ', 'stop_test', 'ป้ายทดสอบ', '09:10']
      ]),
      sheet('07_PaymentContact', [
        ['ชื่อธนาคาร', null]
      ]),
      sheet('08_DriverVehicleGroup', [
        ['car-test', 'vehicle_test', 'group_test', 'กลุ่มทดสอบ', 'queue_test', 'rotation', '']
      ]),
      sheet('09_StaffLineConfig', [
        ['System field', 'Value to fill', 'System destination', 'Required', 'Notes']
      ])
    ]
  };
}

const preview = contract.buildDraftPreview(validWorkbook());
assert.deepStrictEqual(preview.draft.sourceWorkbookOrder, contract.SHEET_ORDER);
assert.strictEqual(preview.preview.sheetOrderVerified, true);
assert.strictEqual(preview.draft.localOnly, true);
assert.strictEqual(preview.draft.productionWrite, false);
assert.strictEqual(preview.preview.readyForApply, false);
assert(preview.preview.blockers.some((item) => item.code === 'sheet-not-approved-for-erp-import' && item.sheet === '09_StaffLineConfig'));
assert.strictEqual(preview.draft.records['06_รถและคิว'][0].sourceValues['เบอร์โทรศัพท์ชั่วคราว'], '[ปกปิด]');
assert.strictEqual(preview.draft.records['07_PaymentContact'][0].sourceValues.value, '[ปกปิด]');
assert.strictEqual(preview.draft.records['01_ข้อมูลป้ายต้นทาง'][0].sourceRowNumber, 2);
assert.strictEqual(preview.preview.counts.rows, 9);

const withBlankRow = validWorkbook();
withBlankRow.sheets[0].rows = [
  withBlankRow.sheets[0].rows[0],
  [],
  ['P-test-2', 'stop_test_2', 'ป้ายทดสอบ 2', 14, 102, '🚏', 2, 'main', 'ใช่', '']
];
const blankPreview = contract.buildDraftPreview(withBlankRow);
assert.deepStrictEqual(blankPreview.preview.sheets[0].sourceRowNumbers, [2, 4], 'blank Excel rows must preserve original row numbers');

const wrongOrder = validWorkbook();
[wrongOrder.sheets[4], wrongOrder.sheets[5]] = [wrongOrder.sheets[5], wrongOrder.sheets[4]];
const wrongOrderPreview = contract.buildDraftPreview(wrongOrder);
assert(wrongOrderPreview.preview.blockers.some((item) => item.code === 'sheet-order-mismatch'));
assert.strictEqual(wrongOrderPreview.preview.sheetOrderVerified, false);

const duplicate = validWorkbook();
duplicate.sheets[0].rows.push(['P-test-duplicate', 'stop_test', 'ป้ายซ้ำ', 14, 102, '🚏', 2, 'main', 'ใช่', '']);
const duplicatePreview = contract.buildDraftPreview(duplicate);
assert(duplicatePreview.preview.blockers.some((item) => item.code === 'duplicate-stable-id' && item.sheet === '01_ข้อมูลป้ายต้นทาง'));

const missing = validWorkbook();
missing.sheets[3].rows[0][5] = '';
const missingPreview = contract.buildDraftPreview(missing);
assert(missingPreview.preview.blockers.some((item) => item.code === 'missing-required-field' && item.field === 'เวลาออก'));

const foreignKey = validWorkbook();
foreignKey.sheets[2].rows[0][3] = 'missing_stop';
const foreignKeyPreview = contract.buildDraftPreview(foreignKey);
assert(foreignKeyPreview.preview.blockers.some((item) => item.code === 'invalid-foreign-key' && item.field === 'รหัสระบบต้นทาง'));

console.log('admin erp excel draft import contract: PASS');
