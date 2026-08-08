(function (global) {
  'use strict';

  var WORKBOOK_NAME = 'SL-Transit_20260712_payment_contact_updated.xlsx';
  var SHEET_ORDER = [
    '01_ข้อมูลป้ายต้นทาง',
    '02_เส้นทาง',
    '03_เส้นทางและราคา',
    '04_รอบเวลา',
    '06_รถและคิว',
    '05_คิวรถและเวลา',
    '07_PaymentContact',
    '08_DriverVehicleGroup',
    '09_StaffLineConfig'
  ];

  var SHEETS = Object.freeze({
    '01_ข้อมูลป้ายต้นทาง': Object.freeze({
      headerRow: 1,
      headers: ['รหัสอ้างอิง', 'รหัสระบบ (ห้ามแก้)', 'ชื่อป้าย', 'ละติจูด', 'ลองจิจูด', 'ไอคอน', 'ลำดับ', 'ประเภทป้าย', 'เปิดใช้ในการจอง', 'หมายเหตุ'],
      idFields: ['รหัสระบบ (ห้ามแก้)'],
      required: ['รหัสระบบ (ห้ามแก้)', 'ชื่อป้าย', 'ละติจูด', 'ลองจิจูด', 'ลำดับ'],
      numberFields: ['ละติจูด', 'ลองจิจูด', 'ลำดับ'],
      kind: 'stops'
    }),
    '02_เส้นทาง': Object.freeze({
      headerRow: 1,
      headers: ['รหัสกลุ่ม (group_id)', 'ชื่อกลุ่ม', 'ลำดับกลุ่ม', 'ประเภทกลุ่ม', 'รหัสจุดต่อรถ', 'เวลาเปลี่ยนรถขั้นต่ำ (นาที)', 'เวลารอแนะนำสูงสุด (นาที)', 'เวลารอเหมาะสม (นาที)', 'ความน่าเชื่อถือ (0-100)', 'ลำดับแนะนำ', 'ให้ผู้โดยสารเลือกเอง', 'เปิดใช้งาน'],
      idFields: ['รหัสกลุ่ม (group_id)'],
      required: ['รหัสกลุ่ม (group_id)', 'ชื่อกลุ่ม', 'ลำดับกลุ่ม'],
      numberFields: ['ลำดับกลุ่ม', 'เวลาเปลี่ยนรถขั้นต่ำ (นาที)', 'เวลารอแนะนำสูงสุด (นาที)', 'เวลารอเหมาะสม (นาที)', 'ความน่าเชื่อถือ (0-100)', 'ลำดับแนะนำ'],
      kind: 'routes'
    }),
    '03_เส้นทางและราคา': Object.freeze({
      headerRow: 1,
      headers: ['รหัสเส้นทาง (route_id)', 'รหัสกลุ่ม (group_id)', 'ลำดับในกลุ่ม', 'รหัสระบบต้นทาง', 'ต้นทาง', 'รหัสระบบปลายทาง', 'ปลายทาง', 'ราคา', 'เปิดใช้งาน'],
      idFields: ['รหัสเส้นทาง (route_id)', 'รหัสกลุ่ม (group_id)', 'ลำดับในกลุ่ม'],
      required: ['รหัสเส้นทาง (route_id)', 'รหัสกลุ่ม (group_id)', 'ลำดับในกลุ่ม', 'รหัสระบบต้นทาง', 'รหัสระบบปลายทาง', 'ราคา'],
      numberFields: ['ลำดับในกลุ่ม', 'ราคา'],
      kind: 'fares'
    }),
    '04_รอบเวลา': Object.freeze({
      headerRow: 1,
      headers: ['รหัสรอบ (trip_id)', 'รหัสเส้นทาง (route_id)', 'ชื่อกลุ่ม', 'ต้นทาง', 'ปลายทาง', 'เวลาออก', 'เปิดจอง', 'จำนวนคนสูงสุด', 'หมายเหตุ'],
      idFields: ['รหัสรอบ (trip_id)'],
      required: ['รหัสรอบ (trip_id)', 'รหัสเส้นทาง (route_id)', 'เวลาออก', 'จำนวนคนสูงสุด'],
      numberFields: ['จำนวนคนสูงสุด'],
      timeFields: ['เวลาออก'],
      kind: 'trips'
    }),
    '06_รถและคิว': Object.freeze({
      headerRow: 1,
      headers: ['vehicle_id', 'legacy_alias', 'queue_id', 'assignment_mode', 'ทะเบียนชั่วคราว', 'เบอร์โทรศัพท์ชั่วคราว', 'active', 'driver_id', 'ชื่อคนขับชั่วคราว', 'เบอร์โทรคนขับชั่วคราว', 'login_id', 'รหัสผ่านชั่วคราว', 'หมายเหตุ'],
      idFields: ['vehicle_id'],
      required: ['vehicle_id', 'queue_id', 'assignment_mode', 'active'],
      restrictedFields: ['ทะเบียนชั่วคราว', 'เบอร์โทรศัพท์ชั่วคราว', 'driver_id', 'ชื่อคนขับชั่วคราว', 'เบอร์โทรคนขับชั่วคราว', 'login_id', 'รหัสผ่านชั่วคราว'],
      kind: 'vehicles'
    }),
    '05_คิวรถและเวลา': Object.freeze({
      headerRow: 1,
      headers: ['0', 'รหัสเที่ยว', 'ลำดับป้าย', 'รหัสเส้นทาง', 'ชื่อเส้นทาง', 'รหัสป้าย', 'ชื่อป้าย', 'เวลา'],
      idFields: ['รหัสเที่ยว', 'ลำดับป้าย', 'รหัสป้าย'],
      required: ['รหัสเที่ยว', 'ลำดับป้าย', 'รหัสเส้นทาง', 'รหัสป้าย', 'เวลา'],
      numberFields: ['ลำดับป้าย'],
      timeFields: ['เวลา'],
      kind: 'stopTimes'
    }),
    '07_PaymentContact': Object.freeze({
      headerRow: 1,
      headerMode: 'keyValue',
      headers: ['ข้อมูลชำระเงินและติดต่อ S.L.Transit'],
      keyValueKeys: ['ชื่อธนาคาร', 'เลขที่บัญชี', 'เบอร์โทรศัพท์', 'แหล่งข้อมูล'],
      restricted: true,
      kind: 'paymentOwnership'
    }),
    '08_DriverVehicleGroup': Object.freeze({
      headerRow: 4,
      headers: ['runtimeVehicleId', 'erpVehicleId', 'serviceGroupId', 'serviceGroupNameTh', 'queueScope', 'assignmentMode', 'note'],
      idFields: ['runtimeVehicleId'],
      required: ['runtimeVehicleId', 'erpVehicleId', 'serviceGroupId'],
      kind: 'serviceGroups'
    }),
    '09_StaffLineConfig': Object.freeze({
      headerRow: 4,
      headers: ['System field', 'Value to fill', 'System destination', 'Required', 'Notes'],
      idFields: ['System field'],
      required: ['System field', 'Value to fill', 'System destination', 'Required'],
      restricted: true,
      blocked: true,
      blockedReason: 'ข้อมูลแจ้งเตือนเจ้าหน้าที่ต้องใช้สัญญาข้อมูลแยก และห้ามนำค่าโทเคนเข้า ERP Data Center',
      kind: 'staffLineConfig'
    })
  });

  function object(value) { return value && typeof value === 'object' ? value : {}; }
  function clone(value) { return JSON.parse(JSON.stringify(value == null ? null : value)); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function isBlankRow(values) { return Object.keys(object(values)).every(function (key) { return text(values[key]) === ''; }); }
  function sheetList(workbook) {
    if (Array.isArray(workbook && workbook.sheets)) return workbook.sheets.slice();
    var sheets = object(workbook && workbook.sheets);
    return Object.keys(sheets).map(function (name) { return Object.assign({ name: name }, object(sheets[name])); });
  }
  function sheetName(sheet) { return text(sheet && (sheet.name || sheet.sheetName)); }
  function valuesFromRow(raw, headers) {
    if (Array.isArray(raw)) return headers.reduce(function (out, header, index) { out[header] = raw[index]; return out; }, {});
    var source = raw && raw.values && typeof raw.values === 'object' ? raw.values : raw;
    return headers.reduce(function (out, header) { out[header] = source && source[header]; return out; }, {});
  }
  function keyValueFromRow(raw) {
    if (Array.isArray(raw)) return { key: raw[0], value: raw[1] };
    var source = raw && raw.values && typeof raw.values === 'object' ? raw.values : raw;
    return { key: source && (source.key || source.field || source['System field']), value: source && (source.value || source['Value to fill']) };
  }
  function sourceRowNumber(raw, index, definition) {
    var explicit = raw && (raw.sourceRowNumber != null ? raw.sourceRowNumber : raw.excelRowNumber);
    var number = explicit == null ? definition.headerRow + 1 + index : Number(explicit);
    return isFinite(number) && Math.floor(number) === number ? number : null;
  }
  function identity(values, definition) {
    if (!definition.idFields) return '';
    return definition.idFields.map(function (field) { return text(values[field]); }).join('|');
  }
  function sanitizedValues(values, definition) {
    var result = {};
    Object.keys(values).forEach(function (key) {
      if (definition.restricted || (definition.restrictedFields || []).indexOf(key) !== -1) result[key] = '[ปกปิด]';
      else result[key] = values[key];
    });
    return result;
  }
  function headerIssues(sheet, definition) {
    if (definition.headerMode === 'keyValue') {
      var title = text(sheet && (sheet.title || (Array.isArray(sheet.headers) && sheet.headers[0])));
      return title === definition.headers[0] ? [] : [{ code: 'header-mismatch', expected: definition.headers.slice(), actual: title ? [title] : [] }];
    }
    var headers = Array.isArray(sheet && (sheet.headers || sheet.header)) ? (sheet.headers || sheet.header) : [];
    return JSON.stringify(headers.slice(0, definition.headers.length)) === JSON.stringify(definition.headers) && headers.length >= definition.headers.length ? [] : [{ code: 'header-mismatch', expected: definition.headers.slice(), actual: headers.slice() }];
  }
  function normalizeRows(sheet, definition) {
    var rawRows = Array.isArray(sheet && sheet.rows) ? sheet.rows : [];
    return rawRows.map(function (raw, index) {
      var values = definition.headerMode === 'keyValue' ? keyValueFromRow(raw) : valuesFromRow(raw, definition.headers);
      return {
        values: values,
        sourceRowNumber: sourceRowNumber(raw, index, definition),
        blank: isBlankRow(values)
      };
    });
  }
  function issue(code, sheet, row, extra) {
    return Object.assign({ code: code, sheet: sheet, sourceRowNumber: row && row.sourceRowNumber || null }, extra || {});
  }
  function numberValid(value) { return text(value) !== '' && isFinite(Number(value)); }
  function timeValid(value) { return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(text(value)); }
  function compareRows(base, next) {
    var left = object(base), right = object(next), added = 0, changed = 0, unchanged = 0, removed = 0;
    Object.keys(right).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(left, key)) added++; else if (JSON.stringify(left[key]) === JSON.stringify(right[key])) unchanged++; else changed++; });
    Object.keys(left).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(right, key)) removed++; });
    return { added: added, changed: changed, unchanged: unchanged, removed: removed };
  }
  function buildDraftPreview(workbook, options) {
    options = options || {};
    var sheets = sheetList(workbook);
    var blockers = [];
    var warnings = [];
    var records = {};
    var rawRowsBySheet = {};
    var sheetPreviews = [];
    var actualOrder = sheets.map(sheetName);
    if (text(workbook && workbook.name) !== WORKBOOK_NAME) warnings.push({ code: 'workbook-name-diff', expected: WORKBOOK_NAME, actual: text(workbook && workbook.name) });
    if (JSON.stringify(actualOrder) !== JSON.stringify(SHEET_ORDER)) blockers.push({ code: 'sheet-order-mismatch', expected: SHEET_ORDER.slice(), actual: actualOrder });
    SHEET_ORDER.forEach(function (expectedName, position) {
      var definition = SHEETS[expectedName];
      var sheet = sheets[position] && sheetName(sheets[position]) === expectedName ? sheets[position] : sheets.find(function (candidate) { return sheetName(candidate) === expectedName; });
      if (!sheet) { blockers.push({ code: 'missing-sheet', sheet: expectedName, position: position + 1 }); return; }
      var headerErrors = headerIssues(sheet, definition);
      headerErrors.forEach(function (item) { blockers.push(Object.assign({ sheet: expectedName }, item)); });
      var normalized = normalizeRows(sheet, definition);
      var nonBlank = normalized.filter(function (row) { return !row.blank; });
      rawRowsBySheet[expectedName] = nonBlank;
      var rows = [];
      var seen = {};
      var previousRowNumber = null;
      nonBlank.forEach(function (row) {
        if (row.sourceRowNumber == null || (previousRowNumber !== null && row.sourceRowNumber <= previousRowNumber)) blockers.push(issue('source-row-order-invalid', expectedName, row));
        previousRowNumber = row.sourceRowNumber;
        var id = identity(row.values, definition);
        if (definition.idFields && definition.idFields.some(function (field) { return text(row.values[field]) === ''; })) blockers.push(issue('missing-stable-id', expectedName, row, { fields: definition.idFields }));
        if (id && seen[id]) blockers.push(issue('duplicate-stable-id', expectedName, row, { id: id, firstSourceRowNumber: seen[id] }));
        if (id) seen[id] = row.sourceRowNumber;
        if (definition.headerMode === 'keyValue' && definition.keyValueKeys.indexOf(text(row.values.key)) === -1) blockers.push(issue('unknown-key-value-field', expectedName, row, { field: row.values.key }));
        (definition.required || []).forEach(function (field) { if (text(row.values[field]) === '') blockers.push(issue('missing-required-field', expectedName, row, { field: field, id: id })); });
        (definition.numberFields || []).forEach(function (field) { if (text(row.values[field]) !== '' && !numberValid(row.values[field])) blockers.push(issue('invalid-number', expectedName, row, { field: field, id: id })); });
        (definition.timeFields || []).forEach(function (field) { if (!timeValid(row.values[field])) blockers.push(issue('invalid-time', expectedName, row, { field: field, id: id })); });
        rows.push({ id: id || null, sourceRowId: expectedName + '_' + String(row.sourceRowNumber).padStart(4, '0'), sourceSheet: expectedName, sourceRowNumber: row.sourceRowNumber, sourceValues: sanitizedValues(row.values, definition), restricted: Boolean(definition.restricted || (definition.restrictedFields || []).length) });
      });
      if (definition.blocked) blockers.push({ code: 'sheet-not-approved-for-erp-import', sheet: expectedName, reason: definition.blockedReason });
      if (definition.restricted) warnings.push({ code: 'restricted-sheet-redacted', sheet: expectedName });
      records[expectedName] = rows;
      var base = object(options.base && options.base[expectedName]);
      var next = rows.reduce(function (map, row) { map[row.id || row.sourceRowId] = row.sourceValues; return map; }, {});
      sheetPreviews.push({ name: expectedName, position: position + 1, headerRow: definition.headerRow, rowCount: rows.length, sourceRowNumbers: rows.map(function (row) { return row.sourceRowNumber; }), restricted: Boolean(definition.restricted || (definition.restrictedFields || []).length), diff: compareRows(base, next) });
    });
    function idsFor(sheetName, field) {
      return rawRowsBySheet[sheetName] ? rawRowsBySheet[sheetName].map(function (row) { return text(row.values[field]); }).filter(Boolean) : [];
    }
    function checkReference(sheetName, field, targetSheet, targetField) {
      var targetIds = idsFor(targetSheet, targetField);
      (rawRowsBySheet[sheetName] || []).forEach(function (row) {
        var value = text(row.values[field]);
        if (value && targetIds.indexOf(value) === -1) blockers.push(issue('invalid-foreign-key', sheetName, row, { field: field, value: value, targetSheet: targetSheet, targetField: targetField }));
      });
    }
    checkReference('03_เส้นทางและราคา', 'รหัสกลุ่ม (group_id)', '02_เส้นทาง', 'รหัสกลุ่ม (group_id)');
    checkReference('03_เส้นทางและราคา', 'รหัสระบบต้นทาง', '01_ข้อมูลป้ายต้นทาง', 'รหัสระบบ (ห้ามแก้)');
    checkReference('03_เส้นทางและราคา', 'รหัสระบบปลายทาง', '01_ข้อมูลป้ายต้นทาง', 'รหัสระบบ (ห้ามแก้)');
    checkReference('05_คิวรถและเวลา', 'รหัสเที่ยว', '04_รอบเวลา', 'รหัสรอบ (trip_id)');
    checkReference('05_คิวรถและเวลา', 'รหัสเส้นทาง', '03_เส้นทางและราคา', 'รหัสเส้นทาง (route_id)');
    checkReference('05_คิวรถและเวลา', 'รหัสป้าย', '01_ข้อมูลป้ายต้นทาง', 'รหัสระบบ (ห้ามแก้)');
    checkReference('08_DriverVehicleGroup', 'erpVehicleId', '06_รถและคิว', 'vehicle_id');
    checkReference('08_DriverVehicleGroup', 'serviceGroupId', '02_เส้นทาง', 'รหัสกลุ่ม (group_id)');
    var hasBlockedSensitiveData = sheetPreviews.some(function (sheet) { return sheet.restricted; });
    var validation = { valid: blockers.length === 0, blockers: blockers, warnings: warnings };
    return {
      draft: {
        localOnly: true,
        productionWrite: false,
        readyForApply: false,
        sourceWorkbookName: text(workbook && workbook.name),
        sourceWorkbookOrder: actualOrder,
        records: clone(records),
        validation: validation
      },
      preview: {
        status: blockers.length ? 'ตรวจสอบข้อมูลไม่สำเร็จ' : (hasBlockedSensitiveData ? 'อยู่ระหว่างตรวจสอบ' : 'พร้อมสร้างฉบับร่าง'),
        readyForApply: false,
        localOnly: true,
        productionWrite: false,
        sheetOrderVerified: JSON.stringify(actualOrder) === JSON.stringify(SHEET_ORDER),
        sheets: sheetPreviews,
        counts: sheetPreviews.reduce(function (total, sheet) { total.rows += sheet.rowCount; total.added += sheet.diff.added; total.changed += sheet.diff.changed; total.unchanged += sheet.diff.unchanged; total.removed += sheet.diff.removed; return total; }, { rows: 0, added: 0, changed: 0, unchanged: 0, removed: 0 }),
        blockers: blockers,
        warnings: warnings
      }
    };
  }

  var api = { WORKBOOK_NAME: WORKBOOK_NAME, SHEET_ORDER: SHEET_ORDER.slice(), SHEETS: SHEETS, buildDraftPreview: buildDraftPreview };
  global.AdminErpExcelDraftImport = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.adminErpExcelDraftImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
