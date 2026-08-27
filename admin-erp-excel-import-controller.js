(function (global) {
  'use strict';

  var STORAGE_KEY = 'slTransitAdminErpExcelPreviewV1';

  function object(value) { return value && typeof value === 'object' ? value : {}; }
  function text(value) { return String(value == null ? '' : value); }
  function clone(value) { return JSON.parse(JSON.stringify(value == null ? null : value)); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }
  function parserFrom(options) {
    return options && options.parser || global.XLSX || null;
  }
  function readBytes(file) {
    if (file && typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    if (typeof global.FileReader === 'function') {
      return new Promise(function (resolve, reject) {
        var reader = new global.FileReader();
        reader.onload = function (event) { resolve(new Uint8Array(event.target.result)); };
        reader.onerror = function () { reject({ code: 'file-read-failed', message: 'อ่านไฟล์จากเครื่องไม่สำเร็จ' }); };
        reader.readAsArrayBuffer(file);
      });
    }
    return Promise.reject({ code: 'file-reader-unavailable', message: 'เครื่องมืออ่านไฟล์ยังไม่พร้อมใช้งาน' });
  }
  function definitionFor(name) {
    var contract = global.AdminErpExcelDraftImport;
    return contract && contract.SHEETS && contract.SHEETS[name] || { headerRow: 1 };
  }
  function sheetToContract(parser, name, sheet) {
    var definition = definitionFor(name);
    var matrix = parser.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: '', raw: false });
    var headerIndex = Math.max(0, Number(definition.headerRow || 1) - 1);
    var header = Array.isArray(matrix[headerIndex]) ? matrix[headerIndex].slice() : [];
    var startIndex = definition.headerMode === 'keyValue' ? headerIndex + 1 : headerIndex + 1;
    var rows = matrix.slice(startIndex).map(function (values, index) {
      var row = Array.isArray(values) ? values.slice() : [];
      row.sourceRowNumber = startIndex + index + 1;
      return row;
    });
    var result = { name: name, rows: rows };
    if (definition.headerMode === 'keyValue') {
      result.title = text(header[0]).trim();
      result.headers = [result.title];
    } else {
      result.headers = header;
    }
    return result;
  }
  function parseFile(file, options) {
    options = options || {};
    if (!file) return Promise.reject({ code: 'file-required', message: 'กรุณาเลือกไฟล์ Excel ก่อนตรวจสอบ' });
    var parser = parserFrom(options);
    if (!parser || typeof parser.read !== 'function' || !parser.utils || typeof parser.utils.sheet_to_json !== 'function') {
      return Promise.reject({ code: 'excel-parser-unavailable', message: 'ยังไม่พบตัวอ่าน Excel ที่อนุมัติ จึงยังตรวจไฟล์นี้ไม่ได้' });
    }
    return readBytes(file).then(function (bytes) {
      var workbook = parser.read(bytes, { type: 'array' });
      var names = Array.isArray(workbook && workbook.SheetNames) ? workbook.SheetNames.slice() : [];
      return {
        name: text(file.name),
        sheets: names.map(function (name) { return sheetToContract(parser, name, workbook.Sheets[name]); })
      };
    }).catch(function (error) {
      if (error && error.code) throw error;
      throw { code: 'excel-parse-failed', message: 'อ่านโครงสร้างไฟล์ Excel ไม่สำเร็จ' };
    });
  }
  function buildPreview(workbook, options) {
    var contract = global.AdminErpExcelDraftImport;
    if (!contract || typeof contract.buildDraftPreview !== 'function') {
      throw { code: 'draft-contract-unavailable', message: 'ยังไม่พบสัญญาตรวจข้อมูล ERP แบบร่าง' };
    }
    return contract.buildDraftPreview(workbook, options || {});
  }
  function storePreview(result) {
    var safe = clone(result);
    safe.storedAt = new Date().toISOString();
    try { global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch (error) { return false; }
    return true;
  }
  function readPreview() {
    try { return JSON.parse(global.sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (error) { return null; }
  }
  function clearPreview() {
    try { global.sessionStorage.removeItem(STORAGE_KEY); } catch (error) { /* local storage may be unavailable */ }
  }
  function previewFromFile(file, options) {
    return parseFile(file, options).then(function (workbook) {
      var result = buildPreview(workbook, options);
      storePreview(result);
      return result;
    });
  }
  function issueLabel(item) {
    var location = item && item.sheet ? item.sheet + (item.sourceRowNumber ? ' แถว ' + item.sourceRowNumber : '') : '';
    return (item && (item.message || item.code) || 'พบข้อผิดพลาด') + (location ? ' · ' + location : '');
  }
  function renderPreview(result) {
    var preview = object(result && result.preview);
    var counts = object(preview.counts);
    var blockers = Array.isArray(preview.blockers) ? preview.blockers : [];
    var warnings = Array.isArray(preview.warnings) ? preview.warnings : [];
    var restricted = object(preview.restrictedReview);
    var restrictedBlockers = Array.isArray(restricted.blockers) ? restricted.blockers : [];
    var status = text(preview.status || 'ตรวจสอบข้อมูลไม่สำเร็จ');
    var issues = blockers.concat(restrictedBlockers);
    var issueHtml = issues.length ? '<div class="erp-drawer-list">' + issues.slice(0, 8).map(function (item) { return '<div class="erp-drawer-item"><span>ต้องแก้ไข</span><strong>' + escapeHtml(issueLabel(item)) + '</strong></div>'; }).join('') + (issues.length > 8 ? '<div class="erp-drawer-item"><span>รายการเพิ่มเติม</span><strong>อีก ' + (issues.length - 8) + ' รายการ</strong></div>' : '') + '</div>' : '<div class="notice">ยังไม่พบข้อผิดพลาดจากโครงสร้างที่ตรวจ</div>';
    var warningHtml = warnings.length ? '<div class="notice">มีข้อมูลที่ต้องทบทวน ' + warnings.length + ' รายการ · ระบบยังไม่เขียนข้อมูลจริง</div>' : '';
    return '<div class="erp-excel-preview" data-admin-erp-excel-preview-result>' +
      '<div class="impact-list"><div><span>สถานะ</span><strong>' + escapeHtml(status) + '</strong></div>' +
      '<div><span>จำนวนแถว</span><strong>' + escapeHtml(counts.rows || 0) + '</strong></div>' +
      '<div><span>เพิ่ม / แก้ไข / ไม่เปลี่ยน</span><strong>' + escapeHtml((counts.added || 0) + ' / ' + (counts.changed || 0) + ' / ' + (counts.unchanged || 0)) + '</strong></div>' +
      '<div><span>เขียน Firebase จริง</span><strong>ไม่เขียน</strong></div></div>' +
      '<h3>ผลตรวจ</h3>' + issueHtml + warningHtml +
      '<div class="notice">ไฟล์ต้นฉบับไม่ได้ถูกเก็บในระบบกลาง ผลนี้เก็บเฉพาะในเซสชันของเบราว์เซอร์ และยังไม่พร้อมนำไปใช้จริง</div>' +
      '</div>';
  }
  function handleChange(event, options) {
    var input = event && event.target;
    if (!input || !input.matches || !input.matches('[data-admin-erp-excel-file]')) return Promise.resolve(null);
    var status = input.parentElement && input.parentElement.querySelector('[data-admin-erp-excel-status]');
    var resultBox = input.parentElement && input.parentElement.querySelector('[data-admin-erp-excel-preview]');
    if (status) status.textContent = 'กำลังอ่านและตรวจสอบไฟล์ในเครื่อง…';
    if (resultBox) resultBox.innerHTML = '';
    return previewFromFile(input.files && input.files[0], options).then(function (result) {
      if (status) status.textContent = 'ตรวจสอบเสร็จแล้ว: ' + text(result.preview.status);
      if (resultBox) resultBox.innerHTML = renderPreview(result);
      return result;
    }).catch(function (error) {
      if (status) status.textContent = text(error && error.message || 'ตรวจสอบไฟล์ไม่สำเร็จ');
      if (resultBox) resultBox.innerHTML = '<div class="notice">ยังไม่มีพรีวิว จึงไม่มีการนำข้อมูลใดไปใช้งาน</div>';
      return null;
    });
  }
  function attach(documentRef, options) {
    if (!documentRef || typeof documentRef.addEventListener !== 'function') return function () {};
    var listener = function (event) { handleChange(event, options || {}); };
    documentRef.addEventListener('change', listener);
    return function () { documentRef.removeEventListener('change', listener); };
  }
  var api = {
    STORAGE_KEY: STORAGE_KEY,
    parseFile: parseFile,
    buildPreview: buildPreview,
    previewFromFile: previewFromFile,
    storePreview: storePreview,
    readPreview: readPreview,
    clearPreview: clearPreview,
    renderPreview: renderPreview,
    handleChange: handleChange,
    attach: attach
  };
  global.AdminErpExcelImportController = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.adminErpExcelImportController = api;
  if (global.document) attach(global.document, {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
