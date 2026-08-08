(function (global) {
  'use strict';

  var STATUS = Object.freeze({
    loading: 'loading', empty: 'empty', partial: 'partial', stale: 'stale',
    error: 'error', forbidden: 'forbidden', ready: 'ready', disconnected: 'disconnected'
  });
  var PATHS = Object.freeze({
    root: 'data/erpDataCenter', workbookSource: 'data/erpDataCenter/workbookSource',
    routeFareRows: 'data/erpDataCenter/workbookSource/routeFareRows', scheduleRows: 'data/erpDataCenter/workbookSource/scheduleRows',
    manifest: 'data/erpDataCenter/workbookSource/manifest', reconciliation: 'data/erpDataCenter/workbookSource/reconciliation',
    stops: 'data/erpDataCenter/stops', routes: 'data/erpDataCenter/routes', trips: 'data/erpDataCenter/trips',
    stopTimes: 'data/erpDataCenter/stopTimes', fares: 'data/erpDataCenter/fares', vehicles: 'data/erpDataCenter/fleet/vehicles',
    queues: 'data/erpDataCenter/fleet/queues', assignmentRules: 'data/erpDataCenter/fleet/assignmentRules',
    serviceGroups: 'data/erpDataCenter/serviceGroups', paymentOwnership: 'data/erpDataCenter/paymentOwnership',
    versions: 'data/erpDataCenter/meta/versions', audit: 'data/erpDataCenter/meta/audit'
  });
  var ENTITY_PATHS = Object.freeze({ stops: 'stops', routes: 'routes', trips: 'trips', stopTimes: 'stopTimes', fares: 'fares', vehicles: 'vehicles', queues: 'queues', serviceGroups: 'serviceGroups', paymentOwnership: 'paymentOwnership' });
  var ENTITY_SCOPES = Object.freeze({ stops: 'stops', routes: 'routes', trips: 'trips', stopTimes: 'stopTimes', fares: 'fares', vehicles: 'vehicles', queues: 'queues', serviceGroups: 'serviceGroups', paymentOwnership: 'paymentOwnership' });
  var ENTITY_DATA_PATHS = Object.freeze({ stops: 'stops', routes: 'routes', trips: 'trips', stopTimes: 'stopTimes', fares: 'fares', vehicles: 'fleet/vehicles', queues: 'fleet/queues', serviceGroups: 'serviceGroups', paymentOwnership: 'paymentOwnership' });
  var SCOPE_PATHS = Object.freeze({ access: 'data/erpDataCenter/meta/access', root: PATHS && PATHS.root, stops: 'data/erpDataCenter/stops', routes: 'data/erpDataCenter/routes', trips: 'data/erpDataCenter/trips', stopTimes: 'data/erpDataCenter/stopTimes', fares: 'data/erpDataCenter/fares', vehicles: 'data/erpDataCenter/fleet/vehicles', queues: 'data/erpDataCenter/fleet/queues', assignmentRules: 'data/erpDataCenter/fleet/assignmentRules', serviceGroups: 'data/erpDataCenter/serviceGroups', paymentOwnership: 'data/erpDataCenter/paymentOwnership', routeFareRows: 'data/erpDataCenter/workbookSource/routeFareRows', scheduleRows: 'data/erpDataCenter/workbookSource/scheduleRows', manifest: 'data/erpDataCenter/workbookSource/manifest', reconciliation: 'data/erpDataCenter/workbookSource/reconciliation', workbookSource: 'data/erpDataCenter/workbookSource' });
  var FORBIDDEN_KEYS = Object.freeze(['bookings', 'passengers', 'tickets', 'driverLogs', 'checkIns', 'operations', 'adminAccounts']);
  var state = { config: null, cache: {}, cacheAt: {}, drafts: {}, versions: {}, audits: [], sequence: 0 };

  function object(value) { return value && typeof value === 'object' ? value : {}; }
  function clone(value) { return JSON.parse(JSON.stringify(value == null ? null : value)); }
  function values(map) { return Object.keys(object(map)).map(function (key) { return Object.assign({ id: key }, object(map[key])); }); }
  function pathValue(root, path) { return path.split('/').reduce(function (value, key) { return value == null ? undefined : value[key]; }, root); }
  function adapterError(code, message, details) { var error = new Error(message || code); error.code = code; error.details = details || {}; return error; }
  function containsForbiddenKey(value) { return value && typeof value === 'object' && Object.keys(value).some(function (key) { return FORBIDDEN_KEYS.indexOf(key) !== -1 || containsForbiddenKey(value[key]); }); }

  function configure(options) {
    options = options || {};
    var next = {
      endpoint: String(options.endpoint || '').replace(/\/$/, ''),
      getIdToken: options.getIdToken,
      fetchImpl: options.fetchImpl || (typeof fetch === 'function' ? fetch : null),
      now: options.now || function () { return Date.now(); },
      maxAgeMs: Number(options.maxAgeMs || 15 * 60 * 1000),
      cacheMs: Number(options.cacheMs == null ? 10 * 1000 : options.cacheMs)
    };
    var changed = !state.config || state.config.endpoint !== next.endpoint || state.config.getIdToken !== next.getIdToken || state.config.fetchImpl !== next.fetchImpl;
    state.config = next;
    if (changed) { state.cache = {}; state.cacheAt = {}; }
    return api;
  }
  function requireConfig() {
    if (!state.config || !state.config.endpoint || typeof state.config.getIdToken !== 'function' || typeof state.config.fetchImpl !== 'function') throw adapterError('data_source_not_configured', 'ยังไม่เชื่อมต่อแหล่งข้อมูล');
    return state.config;
  }
  function readRoot(scope) {
    scope = scope || 'root';
    if (!SCOPE_PATHS[scope]) return Promise.reject(adapterError('unknown_read_scope', 'ไม่รู้จักขอบเขตการอ่าน: ' + scope));
    var config;
    try { config = requireConfig(); } catch (error) { return Promise.reject(error); }
    var currentTime = config.now();
    if (state.cache[scope] && config.cacheMs > 0 && currentTime - state.cacheAt[scope] < config.cacheMs) return Promise.resolve(state.cache[scope]);
    return Promise.resolve(config.getIdToken()).then(function (token) {
      if (!token) throw adapterError('token_required', 'ยังไม่เชื่อมต่อแหล่งข้อมูล');
      return config.fetchImpl(config.endpoint + '?scope=' + encodeURIComponent(scope), { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    }).then(function (response) {
      if (!response || !response.ok) throw adapterError(response && response.status === 403 ? 'forbidden' : 'endpoint_error', 'อ่านข้อมูลไม่สำเร็จ', { status: response && response.status });
      return response.json();
    }).then(function (payload) {
      var root = object(payload && payload.erpDataCenter);
      if (payload && payload.path && payload.path !== SCOPE_PATHS[scope]) throw adapterError('invalid_source_path', 'แหล่งข้อมูลไม่ใช่ขอบเขตที่ร้องขอ');
      if (containsForbiddenKey(root)) throw adapterError('forbidden_data_scope', 'ข้อมูลอยู่นอกขอบเขต Admin ERP');
      var generatedAt = Number(payload && payload.generatedAt || 0);
      var reported = [STATUS.partial, STATUS.empty, STATUS.stale].indexOf(String(payload && payload.status || '')) !== -1 ? String(payload.status) : null;
      var snapshot = { root: root, generatedAt: generatedAt || null, status: reported || (generatedAt && config.now() - generatedAt > config.maxAgeMs ? STATUS.stale : STATUS.ready), permissions: payload && payload.permissions || null, version: payload && payload.version || null };
      state.cache[scope] = snapshot;
      state.cacheAt[scope] = config.now();
      return snapshot;
    }).catch(function (error) {
      if (error && error.code) throw error;
      throw adapterError('endpoint_error', 'อ่านข้อมูลไม่สำเร็จ', { cause: error && error.message });
    });
  }
  function toResult(status, path, rows, snapshot, error) { return { status: status, path: path, rows: Array.isArray(rows) ? rows : values(rows), count: Array.isArray(rows) ? rows.length : Object.keys(object(rows)).length, source: 'admin-erp-read-endpoint', version: snapshot && snapshot.version || null, lastUpdated: snapshot && snapshot.generatedAt || null, permissions: snapshot && snapshot.permissions || null, error: error || null }; }
  function getCatalog(entity, query) {
    query = query || {};
    if (!ENTITY_PATHS[entity]) return Promise.reject(adapterError('unknown_entity', 'ไม่รู้จักหมวดข้อมูล: ' + entity));
    return readRoot(ENTITY_SCOPES[entity]).then(function (snapshot) {
      var rows = values(pathValue(snapshot.root, ENTITY_DATA_PATHS[entity]));
      if (query.search) rows = rows.filter(function (row) { return JSON.stringify(row).toLowerCase().indexOf(String(query.search).toLowerCase()) !== -1; });
      if (query.limit != null) rows = rows.slice(0, Math.max(0, Number(query.limit)));
      return toResult(snapshot.status === STATUS.ready && !rows.length ? STATUS.empty : snapshot.status, PATHS[ENTITY_SCOPES[entity]], rows, snapshot);
    });
  }
  function getWorkbookSource(sheet, query) {
    var key = sheet ? (sheet === 'routeFareRows' || sheet === 'scheduleRows' || sheet === 'manifest' || sheet === 'reconciliation' ? sheet : null) : 'workbookSource';
    if (!key) return Promise.reject(adapterError('unknown_workbook_sheet', 'ไม่รู้จักชุดข้อมูล workbook: ' + sheet));
    return readRoot(key === 'workbookSource' ? 'workbookSource' : key).then(function (snapshot) {
      var rows = pathValue(snapshot.root, key === 'workbookSource' ? key : 'workbookSource/' + key);
      if (key === 'workbookSource') return toResult(snapshot.status, PATHS.workbookSource, rows, snapshot);
      rows = values(rows);
      if (query && query.search) rows = rows.filter(function (row) { return JSON.stringify(row).toLowerCase().indexOf(String(query.search).toLowerCase()) !== -1; });
      return toResult(snapshot.status === STATUS.ready && !rows.length ? STATUS.empty : snapshot.status, PATHS[key], rows, snapshot);
    });
  }
  function getRecord(entity, recordId) { return getCatalog(entity).then(function (result) { return Object.assign(result, { record: result.rows.find(function (row) { return row.id === recordId || row[entity + 'Id'] === recordId || row.stopKey === recordId; }) || null }); }); }
  function now() { return state.config && typeof state.config.now === 'function' ? state.config.now() : Date.now(); }
  function audit(draft, action, details) {
    var entry = Object.assign({ auditId: 'audit_local_' + (++state.sequence), draftId: draft && draft.draftId || null, action: action, actor: 'current-authenticated-user', createdAt: now(), productionWrite: false, localOnly: true }, details || {});
    state.audits.push(entry);
    if (draft) draft.auditIds = (draft.auditIds || []).concat(entry.auditId);
    return entry;
  }
  function versionEntries(version) {
    var output = {};
    Object.keys(object(version)).forEach(function (entity) {
      var collection = version[entity];
      if (Array.isArray(collection)) collection.forEach(function (row, index) { var record = object(row); var rule = DRAFT_RULES[entity]; var id = rule && hasValue(record, rule.id) ? record[rule.id] : record.id || index; output[entity + '/' + id] = record; });
      else if (collection && typeof collection === 'object') Object.keys(collection).forEach(function (key) { output[entity + '/' + key] = object(collection[key]); });
    });
    return output;
  }
  function compareVersions(left, right) {
    var before = versionEntries(left), after = versionEntries(right), added = [], changed = [], removed = [], unchanged = [];
    Object.keys(after).forEach(function (key) { if (!(key in before)) added.push(key); else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key); else unchanged.push(key); });
    Object.keys(before).forEach(function (key) { if (!(key in after)) removed.push(key); });
    return { added: added, changed: changed, removed: removed, unchanged: unchanged, counts: { added: added.length, changed: changed.length, removed: removed.length, unchanged: unchanged.length }, total: Object.keys(after).length, totalBefore: Object.keys(before).length, totalAfter: Object.keys(after).length };
  }
  function findDraftByReview(reviewId) { return Object.keys(state.drafts).map(function (id) { return state.drafts[id]; }).find(function (draft) { return draft.reviewId === reviewId; }); }
  function createDraft(input) {
    var id = 'draft_local_' + (++state.sequence);
    state.drafts[id] = { draftId: id, status: 'draft', createdAt: now(), updatedAt: now(), base: clone(input && input.base || {}), records: clone(input && input.records || {}), validation: null, reviewId: null, ownerApproved: false, localOnly: true, auditIds: [] };
    audit(state.drafts[id], 'create_draft');
    return Promise.resolve(clone(state.drafts[id]));
  }
  function updateDraft(draftId, changes) {
    if (!state.drafts[draftId]) return Promise.reject(adapterError('draft_not_found', 'ไม่พบฉบับร่าง'));
    var draft = state.drafts[draftId];
    if (['in_review', 'approved', 'published'].indexOf(draft.status) !== -1) return Promise.reject(adapterError('draft_locked', 'ฉบับร่างอยู่ระหว่างการตรวจสอบหรือเผยแพร่แล้ว'));
    draft.records = Object.assign({}, draft.records, clone(changes || {})); draft.updatedAt = now(); draft.status = 'draft'; draft.validation = null;
    audit(draft, 'update_draft', { changedEntities: Object.keys(changes || {}) });
    return Promise.resolve(clone(draft));
  }
  var DRAFT_RULES = {
    stops: { id: 'stopKey', required: ['stopKey'] },
    routes: { id: 'routeId', required: ['routeId', 'fromStopKey', 'toStopKey'] },
    trips: { id: 'tripId', required: ['tripId', 'routeId'] },
    stopTimes: { id: 'stopTimeId', required: ['tripId', 'stopKey', 'time'] },
    fares: { id: 'fareId', alternatives: [['fareId', 'sourceRowId']], required: ['routeId', 'amount'] },
    vehicles: { id: 'vehicleId', required: ['vehicleId'] },
    queues: { id: 'queueId', required: ['queueId'] },
    serviceGroups: { id: 'serviceGroupId', required: ['serviceGroupId'] }
  };

  function draftRows(collection) {
    if (Array.isArray(collection)) return collection.map(function (row) { return object(row); });
    return Object.keys(object(collection)).map(function (key) { var row = object(collection[key]); return Object.assign({ _recordKey: key }, row); });
  }

  function hasValue(row, field) { return row[field] !== undefined && row[field] !== null && row[field] !== ''; }
  function stableId(row, rule) { return hasValue(row, rule.id) ? String(row[rule.id]) : hasValue(row, '_recordKey') ? String(row._recordKey) : ''; }
  function ids(records, entity, rule) { return draftRows(records[entity]).map(function (row) { return stableId(row, rule); }).filter(Boolean); }
  function hasId(records, entity, value) { return value !== undefined && value !== null && ids(records, entity, DRAFT_RULES[entity] || { id: 'id' }).indexOf(String(value)) !== -1; }

  function validateDraft(draftId) {
    var draft = state.drafts[draftId];
    if (!draft) return Promise.reject(adapterError('draft_not_found', 'ไม่พบฉบับร่าง'));
    var records = object(draft.records);
    var issues = [];
    Object.keys(records).forEach(function (entity) {
      var rule = DRAFT_RULES[entity];
      var rows = draftRows(records[entity]);
      var seen = {};
      rows.forEach(function (row, index) {
        if (!row || typeof row !== 'object') { issues.push({ code: 'invalid_type', entity: entity, index: index }); return; }
        var id = rule ? stableId(row, rule) : row._recordKey || row.id;
        if (!id) issues.push({ code: 'missing_stable_id', entity: entity, index: index });
        if (id && seen[id]) issues.push({ code: 'duplicate_id', entity: entity, id: id, indexes: [seen[id] - 1, index] });
        if (id) seen[id] = index + 1;
        if (rule) {
          rule.required.forEach(function (field) { if (!hasValue(row, field)) issues.push({ code: 'missing_required_field', entity: entity, id: id || index, field: field }); });
          (rule.alternatives || []).forEach(function (fields) { if (!fields.some(function (field) { return hasValue(row, field); })) issues.push({ code: 'missing_stable_id', entity: entity, id: id || index, alternatives: fields }); });
        }
        if (row.lat !== undefined && typeof row.lat !== 'number') issues.push({ code: 'invalid_type', entity: entity, id: id || index, field: 'lat' });
        if (row.lng !== undefined && typeof row.lng !== 'number') issues.push({ code: 'invalid_type', entity: entity, id: id || index, field: 'lng' });
        if (row.amount !== undefined && typeof row.amount !== 'number') issues.push({ code: 'invalid_type', entity: entity, id: id || index, field: 'amount' });
      });
    });
    draftRows(records.routes).forEach(function (row, index) {
      if (!hasId(records, 'stops', row.fromStopKey)) issues.push({ code: 'invalid_foreign_key', entity: 'routes', field: 'fromStopKey', value: row.fromStopKey, index: index });
      if (!hasId(records, 'stops', row.toStopKey)) issues.push({ code: 'invalid_foreign_key', entity: 'routes', field: 'toStopKey', value: row.toStopKey, index: index });
    });
    draftRows(records.trips).forEach(function (row, index) {
      if (!hasId(records, 'routes', row.routeId)) issues.push({ code: 'invalid_foreign_key', entity: 'trips', field: 'routeId', value: row.routeId, index: index });
    });
    draftRows(records.stopTimes).forEach(function (row, index) {
      if (!hasId(records, 'trips', row.tripId)) issues.push({ code: 'invalid_foreign_key', entity: 'stopTimes', field: 'tripId', value: row.tripId, index: index });
      if (!hasId(records, 'stops', row.stopKey)) issues.push({ code: 'invalid_foreign_key', entity: 'stopTimes', field: 'stopKey', value: row.stopKey, index: index });
    });
    draftRows(records.fares).forEach(function (row, index) {
      if (!hasId(records, 'routes', row.routeId)) issues.push({ code: 'invalid_foreign_key', entity: 'fares', field: 'routeId', value: row.routeId, index: index });
    });
    draft.validation = { valid: !issues.length, issues: clone(issues), checkedAt: now() };
    draft.status = issues.length ? 'draft' : 'validated';
    var validationAudit = audit(draft, 'validate_draft', { issueCount: issues.length });
    return Promise.resolve({ status: issues.length ? STATUS.error : STATUS.ready, draftId: draftId, valid: !issues.length, issues: issues, diff: compareVersions(draft.base, draft.records), auditPreview: validationAudit, localOnly: true, productionWrite: false });
  }
  function submitForReview(draftId) {
    var draft = state.drafts[draftId];
    if (!draft) return Promise.reject(adapterError('draft_not_found', 'ไม่พบฉบับร่าง'));
    if (!draft.validation || !draft.validation.valid || draft.status !== 'validated') return Promise.reject(adapterError('validation_required', 'ต้องตรวจสอบฉบับร่างให้ผ่านก่อนส่งตรวจสอบ'));
    draft.status = 'in_review'; draft.reviewId = 'review_local_' + (++state.sequence); draft.updatedAt = now(); draft.ownerApproved = false;
    var entry = audit(draft, 'submit_for_review', { reviewId: draft.reviewId });
    return Promise.resolve({ reviewId: draft.reviewId, draftId: draftId, status: draft.status, auditPreview: entry, localOnly: true, productionWrite: false });
  }
  function approveReview(reviewId, approval) {
    var draft = findDraftByReview(reviewId);
    if (!draft) return Promise.reject(adapterError('review_not_found', 'ไม่พบรายการรอตรวจสอบ'));
    if (!approval || approval.localOnly !== true || approval.ownerApproved !== true || approval.role !== 'owner') return Promise.reject(adapterError('owner_approval_required', 'ต้องมีการอนุมัติจาก Owner ในสภาพแวดล้อมจำลอง'));
    draft.status = 'approved'; draft.ownerApproved = true; draft.updatedAt = now();
    var entry = audit(draft, 'owner_approval', { reviewId: reviewId, approvalMode: 'emulator-only' });
    return Promise.resolve({ reviewId: reviewId, draftId: draft.draftId, status: draft.status, auditPreview: entry, localOnly: true, productionWrite: false });
  }
  function publish(reviewId) {
    var draft = findDraftByReview(reviewId);
    if (!draft) return Promise.reject(adapterError('review_not_found', 'ไม่พบรายการรอตรวจสอบ'));
    if (draft.status !== 'approved' || draft.ownerApproved !== true) return Promise.reject(adapterError('owner_approval_required', 'ยังไม่มี Owner approval'));
    var versionId = 'version_local_' + (++state.sequence);
    state.versions[versionId] = { versionId: versionId, draftId: draft.draftId, before: clone(draft.base), after: clone(draft.records), createdAt: now(), localOnly: true };
    draft.status = 'published'; draft.updatedAt = now(); draft.publishedVersionId = versionId;
    var entry = audit(draft, 'publish_preview', { reviewId: reviewId, versionId: versionId });
    return Promise.resolve({ reviewId: reviewId, draftId: draft.draftId, versionId: versionId, status: draft.status, diff: compareVersions(draft.base, draft.records), auditPreview: entry, localOnly: true, productionWrite: false });
  }
  function getAuditHistory(entity, recordId) {
    var rows = state.audits.filter(function (entry) { return !entity || entry.entity === entity || entry.changedEntities && entry.changedEntities.indexOf(entity) !== -1; }).filter(function (entry) { return !recordId || entry.recordId === recordId; });
    return Promise.resolve({ status: rows.length ? STATUS.ready : STATUS.empty, source: 'local-draft', rows: clone(rows), count: rows.length, localOnly: true, productionWrite: false });
  }
  function rollback(versionId) {
    var version = state.versions[versionId];
    if (!version) return Promise.reject(adapterError('version_not_found', 'ไม่พบเวอร์ชันจำลอง'));
    var draft = state.drafts[version.draftId];
    if (!draft) return Promise.reject(adapterError('draft_not_found', 'ไม่พบฉบับร่างของเวอร์ชันจำลอง'));
    draft.records = clone(version.before); draft.base = clone(version.before); draft.status = 'rolled_back'; draft.ownerApproved = false; draft.updatedAt = now();
    var entry = audit(draft, 'rollback_preview', { versionId: versionId });
    return Promise.resolve({ versionId: versionId, draftId: draft.draftId, status: draft.status, auditPreview: entry, localOnly: true, productionWrite: false });
  }
  function clearReadCache(scope) { if (scope) { delete state.cache[scope]; delete state.cacheAt[scope]; } else { state.cache = {}; state.cacheAt = {}; } return api; }
  function resetLocalState() { state.drafts = {}; state.versions = {}; state.audits = []; state.sequence = 0; clearReadCache(); return api; }
  function getDataCenter() { return readRoot('root'); }
  function getAccess() { return readRoot('access').then(function (snapshot) { return { status: snapshot.status, path: SCOPE_PATHS.access, permissions: snapshot.permissions || [], roles: snapshot.roles || [], generatedAt: snapshot.generatedAt }; }); }
  var api = { STATUS: STATUS, PATHS: PATHS, ENTITY_PATHS: ENTITY_PATHS, ENTITY_SCOPES: ENTITY_SCOPES, configure: configure, clearReadCache: clearReadCache, getAccess: getAccess, getDataCenter: getDataCenter, getCatalog: getCatalog, getWorkbookSource: getWorkbookSource, getRecord: getRecord, createDraft: createDraft, updateDraft: updateDraft, validateDraft: validateDraft, compareVersions: compareVersions, submitForReview: submitForReview, approveReview: approveReview, getAuditHistory: getAuditHistory, publish: publish, rollback: rollback, resetLocalState: resetLocalState };
  global.AdminErpDataSource = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
