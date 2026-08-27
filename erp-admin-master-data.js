(function(global) {
  'use strict';

  var MODULE_VERSION = 'erp/admin-master-data-v1';
  var OWNER_ADMIN_ID = 'owner_admin';
  var ERP_ROOT = 'data/erpDataCenter';
  var AUDIT_ROOT = 'data/erpDataCenter/meta/audit';

  var ENTITY_DEFINITIONS = {
    destination: { path: 'data/erpDataCenter/destinations', idField: 'destinationId' },
    stop: { path: 'data/erpDataCenter/stops', idField: 'stopKey' },
    boardingPoint: { path: 'data/erpDataCenter/boardingPoints', idField: 'boardingPointId' },
    terminal: { path: 'data/erpDataCenter/terminals', idField: 'terminalId' },
    queue: { path: 'data/erpDataCenter/fleet/queues', idField: 'queueId' },
    provider: { path: 'data/erpDataCenter/providers', idField: 'providerId' },
    serviceGroup: { path: 'data/erpDataCenter/serviceGroups', idField: 'serviceGroupId' },
    route: { path: 'data/erpDataCenter/routes', idField: 'routeId' },
    vehicle: { path: 'data/erpDataCenter/fleet/vehicles', idField: 'vehicleId' },
    driver: { path: 'data/erpDataCenter/fleet/drivers', idField: 'driverId' },
    settlementRecipient: { path: 'data/erpDataCenter/settlementRecipients', idField: 'settlementRecipientId' },
    serviceFee: { path: 'data/erpDataCenter/serviceFees', idField: 'serviceFeeId' }
  };
  var SERVICE_FEE_POLICY = {
    currency: 'THB',
    defaultStandardFee: 5,
    defaultTrialEffectiveFee: 0,
    appliesTo: 'all_service_groups',
    includesExternalPayGroups: true
  };

  var FORBIDDEN_ENTITY_TYPES = {
    booking: true,
    testBooking: true,
    passenger: true,
    ticket: true,
    checkIn: true,
    driverLog: true,
    paymentRecord: true,
    notificationRecord: true,
    liveVehicle: true
  };

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function stableStringify(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }

  function hashPayload(value) {
    var text = stableStringify(value);
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function joinPath() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join('/');
  }

  function safeAuditId(change) {
    var base = [
      change.requestId || '',
      change.entityType || '',
      change.entityId || '',
      change.action || '',
      change.requestedAt || change.createdAt || ''
    ].join('|');
    return 'audit_' + hashPayload(base);
  }

  function issue(list, level, code, path, message, extra) {
    list.push(Object.assign({ level: level, code: code, path: path || '', message: message || '' }, extra || {}));
  }

  function isOwnerAdmin(change) {
    return String(change.actorId || '') === OWNER_ADMIN_ID && String(change.actorRole || '') === OWNER_ADMIN_ID;
  }

  function hasForbiddenField(record) {
    var found = '';
    function scan(value, path) {
      if (found || !value || typeof value !== 'object') return;
      Object.keys(value).forEach(function(key) {
        var next = path ? path + '.' + key : key;
        if (/booking|testBooking|passenger|ticket|checkin|checkIn|driverLog|paymentRecord|notification|line|liveVehicle|gps/i.test(key)) found = next;
        if (/password|passcode|pin|otp|secret|token/i.test(key)) found = next;
        if (/bankAccount|promptpay|nationalId|taxId/i.test(key)) found = next;
        scan(value[key], next);
      });
    }
    scan(record, '');
    return found;
  }

  function isNonNegativeFiniteMoney(value) {
    return value !== null && value !== '' && isFinite(Number(value)) && Number(value) >= 0;
  }

  function serviceFeeStandardAmount(record) {
    record = valueOrEmpty(record);
    if (record.standardFee != null) return record.standardFee;
    if (record.standardAmount != null) return record.standardAmount;
    if (record.amount != null) return record.amount;
    return null;
  }

  function isTrialEnabled(record) {
    record = valueOrEmpty(record);
    return record.trialEnabled === true || record.promotionEnabled === true || String(record.activePromotion || '') === 'free_trial';
  }

  function serviceFeeEffectiveAmount(record) {
    record = valueOrEmpty(record);
    if (record.effectiveFee != null) return record.effectiveFee;
    if (record.effectiveAmount != null) return record.effectiveAmount;
    if (record.trialEffectiveFee != null) return record.trialEffectiveFee;
    if (record.trialEffectiveAmount != null) return record.trialEffectiveAmount;
    return isTrialEnabled(record) ? 0 : serviceFeeStandardAmount(record);
  }

  function validateMasterDataChange(change) {
    change = valueOrEmpty(change);
    var blockers = [];
    var warnings = [];
    var entityType = String(change.entityType || '');
    var def = ENTITY_DEFINITIONS[entityType];
    var entityId = String(change.entityId || '');
    var action = String(change.action || '');
    var after = valueOrEmpty(change.after);
    var before = valueOrEmpty(change.before);
    var targetPath = def && entityId ? joinPath(def.path, entityId) : '';

    if (FORBIDDEN_ENTITY_TYPES[entityType]) issue(blockers, 'blocker', 'forbidden-operational-entity-type', targetPath, 'Admin master-data changes must not target operational/private entity types.');
    if (!def) issue(blockers, 'blocker', 'unknown-master-data-entity', '', 'Unknown master-data entity type.', { entityType: entityType });
    if (!isOwnerAdmin(change)) issue(blockers, 'blocker', 'owner-admin-required', targetPath, 'Batch 1 only allows owner_admin master-data changes.');
    if (!entityId) issue(blockers, 'blocker', 'missing-entity-id', targetPath, 'Stable entityId is required.');
    if (['create', 'update', 'deactivate', 'reactivate'].indexOf(action) === -1) issue(blockers, 'blocker', 'invalid-master-data-action', targetPath, 'Unsupported master-data action.', { action: action });
    if (change.writesEnabled === true) issue(blockers, 'blocker', 'writes-enabled-not-allowed', targetPath, 'Admin master-data foundation is dry-run only in Batch 1.');
    if (change.readyForApply === true) issue(blockers, 'blocker', 'ready-for-apply-not-allowed', targetPath, 'readyForApply must remain false.');

    if (def) {
      if (after[def.idField] != null && String(after[def.idField]) !== entityId) issue(blockers, 'blocker', 'stable-id-rewrite', targetPath, 'Stable ID field must match the immutable map key.', { field: def.idField });
      if (before[def.idField] != null && String(before[def.idField]) !== entityId) issue(blockers, 'blocker', 'before-stable-id-mismatch', targetPath, 'Before snapshot stable ID must match the immutable map key.', { field: def.idField });
      if (after.previousId || after.newId || after.renameToId || after.idChanged === true) issue(blockers, 'blocker', 'stable-id-rewrite-request', targetPath, 'Admin must not rewrite stable IDs.');
    }

    if (entityType === 'vehicle') {
      var aliases = Array.isArray(after.legacyAliases) ? after.legacyAliases.map(String) : Array.isArray(after.aliases) ? after.aliases.map(String) : [];
      if (/^car[1-5]$/.test(entityId)) issue(blockers, 'blocker', 'legacy-alias-used-as-vehicle-id', targetPath, 'Vehicle identity must use veh_001-style stable IDs; car1-car5 are aliases only.');
      if ((entityId === 'veh_005' || aliases.indexOf('car5') !== -1) && after.productionReady === true && (!after.registrationNo || !after.loginIndexReady)) issue(blockers, 'blocker', 'veh-005-production-ready-without-login-data', targetPath, 'veh_005 must remain productionReady=false until real registration and login data exist.');
    }

    if (entityType === 'serviceFee' && (after.fareAmount != null || after.baseFare != null || after.originStopKey != null || after.destStopKey != null)) {
      issue(blockers, 'blocker', 'fare-mixed-with-service-fee', targetPath, 'Service fee configuration must stay separate from fare configuration.');
    }
    if (entityType === 'serviceFee') {
      var standardAmount = serviceFeeStandardAmount(after);
      var effectiveAmount = serviceFeeEffectiveAmount(after);
      var appliesTo = String(after.appliesTo || after.appliesToServiceGroups || '');
      if (after.currency && String(after.currency) !== SERVICE_FEE_POLICY.currency) issue(blockers, 'blocker', 'service-fee-currency-not-thb', targetPath, 'Standard platform service fee must be THB.');
      if (standardAmount == null || !isNonNegativeFiniteMoney(standardAmount)) issue(blockers, 'blocker', 'invalid-standard-service-fee', targetPath, 'standardFee must be a finite number >= 0.');
      if (effectiveAmount == null || !isNonNegativeFiniteMoney(effectiveAmount)) issue(blockers, 'blocker', 'invalid-effective-service-fee', targetPath, 'effectiveFee must be derived as a finite number >= 0.');
      if (isTrialEnabled(after) && isNonNegativeFiniteMoney(effectiveAmount) && Number(effectiveAmount) !== 0) issue(blockers, 'blocker', 'trial-effective-service-fee-not-zero', targetPath, 'Current free-trial effective fee must be THB 0.');
      if (!isTrialEnabled(after) && isNonNegativeFiniteMoney(standardAmount) && isNonNegativeFiniteMoney(effectiveAmount) && Number(effectiveAmount) !== Number(standardAmount)) issue(blockers, 'blocker', 'effective-fee-not-derived-from-standard-fee', targetPath, 'When free trial is off, effectiveFee must follow configured standardFee.');
      if (appliesTo && appliesTo !== SERVICE_FEE_POLICY.appliesTo && appliesTo !== 'all') issue(blockers, 'blocker', 'service-fee-not-all-groups', targetPath, 'Platform service fee applies to every service group, including train.');
      if (after.includesExternalPayGroups === false || after.includeTrain === false) issue(blockers, 'blocker', 'service-fee-excludes-train', targetPath, 'Platform service fee must apply to train/external_pay service groups too.');
    }

    if ((after.status === 'test' || after.environmentStatus === 'test') && after.productionReady === true) {
      issue(blockers, 'blocker', 'test-identity-marked-production-ready', targetPath, 'Test identities must not be exposed as production-ready.');
    }

    var forbiddenField = hasForbiddenField(after);
    if (forbiddenField) issue(blockers, 'blocker', 'forbidden-master-data-field', targetPath, 'Master data must not contain operational, credential, personal, or financial fields.', { field: forbiddenField });

    return {
      dryRun: true,
      moduleVersion: MODULE_VERSION,
      readyForReview: blockers.length === 0,
      readyForApply: false,
      writesEnabled: false,
      targetPath: targetPath,
      blockers: blockers,
      warnings: warnings
    };
  }

  function buildAuditEntry(change) {
    change = valueOrEmpty(change);
    return {
      auditId: safeAuditId(change),
      auditMode: 'append_only',
      actorId: change.actorId || '',
      actorRole: change.actorRole || '',
      action: change.action || '',
      entityType: change.entityType || '',
      entityId: change.entityId || '',
      targetPath: change.targetPath || '',
      requestedAt: change.requestedAt || change.createdAt || new Date().toISOString(),
      reason: change.reason || '',
      beforeHash: hashPayload(change.before || null),
      afterHash: hashPayload(change.after || null),
      writesEnabled: false
    };
  }

  function buildMasterDataPlan(change) {
    change = clone(change);
    var validation = validateMasterDataChange(change);
    var audit = buildAuditEntry(Object.assign({}, change, { targetPath: validation.targetPath }));
    var updates = {};
    if (validation.targetPath) updates[validation.targetPath] = Object.assign({}, valueOrEmpty(change.after), {
      updatedAt: change.requestedAt || change.createdAt || new Date().toISOString(),
      updatedBy: change.actorId || '',
      auditId: audit.auditId
    });
    updates[joinPath(AUDIT_ROOT, audit.auditId)] = audit;
    return {
      dryRun: true,
      writesEnabled: false,
      readyForReview: validation.readyForReview,
      readyForApply: false,
      moduleVersion: MODULE_VERSION,
      erpDataCenterRoot: ERP_ROOT,
      validation: validation,
      audit: audit,
      updates: updates
    };
  }

  var api = {
    MODULE_VERSION: MODULE_VERSION,
    OWNER_ADMIN_ID: OWNER_ADMIN_ID,
    ENTITY_DEFINITIONS: JSON.parse(JSON.stringify(ENTITY_DEFINITIONS)),
    SERVICE_FEE_POLICY: Object.assign({}, SERVICE_FEE_POLICY),
    validateMasterDataChange: validateMasterDataChange,
    buildAuditEntry: buildAuditEntry,
    buildMasterDataPlan: buildMasterDataPlan,
    hashPayload: hashPayload
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.adminMasterData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
