(function (global) {
  'use strict';
  var KEY = 'slTransitAdminErpDraftsV1';
  function read() { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function write(value) { try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch (e) {} }
  function id() { return 'draft_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }
  function now() { return new Date().toISOString(); }
  function audit(store, draftId, action, detail) { store[draftId].audit = store[draftId].audit || []; store[draftId].audit.push({ action: action, detail: detail || '', at: now() }); }
  function create(input) {
    input = input || {}; var store = read(), draftId = id();
    store[draftId] = { draftId: draftId, entity: input.entity || '', rows: input.rows || [], status: 'draft', createdAt: now(), updatedAt: now(), audit: [] };
    audit(store, draftId, 'draft_created', 'สร้างฉบับร่างในเครื่อง'); write(store); return store[draftId];
  }
  function validateRows(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var filled = rows.filter(function (row) { return Object.keys(row || {}).some(function (key) { return row[key] !== ''; }); });
    var missing = filled.filter(function (row) { return !row.id && !row.code && !row.tripId && !row.stopKey && !row.vehicleId; }).length;
    return { rowCount: rows.length, filledCount: filled.length, missingIdentityCount: missing, duplicateCheck: 'ยังไม่ได้เชื่อมข้อมูลอ้างอิง', ready: filled.length > 0 && missing === 0 };
  }
  function validate(draftId, rows) {
    var store = read(), draft = store[draftId]; if (!draft) return { status: 'missing', report: validateRows(rows) };
    var report = validateRows(rows || draft.rows); draft.validation = report; draft.status = report.ready ? 'validated' : 'error'; draft.updatedAt = now(); audit(store, draftId, 'validated', report.ready ? 'ผ่านการตรวจเบื้องต้น' : 'พบข้อมูลที่ต้องตรวจสอบ'); write(store); return { draft: draft, report: report };
  }
  function submitForReview(draftId) { var store = read(), draft = store[draftId]; if (!draft) return null; draft.status = 'review'; draft.updatedAt = now(); audit(store, draftId, 'submitted_for_review', 'ส่งตรวจสอบในโหมดทดสอบ'); write(store); return draft; }
  function history(draftId) { var store = read(); return draftId && store[draftId] ? store[draftId].audit || [] : Object.keys(store).map(function (key) { return store[key]; }); }
  global.SLTransitErpDraftAdapter = { create: create, validate: validate, validateRows: validateRows, submitForReview: submitForReview, history: history, storageKey: KEY, safety: { firebaseWrites: false, productionWrites: false, persistence: 'sessionStorage only' } };
}(window));
