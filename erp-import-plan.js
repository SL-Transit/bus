(function(global) {
  'use strict';

  var PLAN_VERSION = 'erp/import-plan-v1';
  var PRIVATE_PATHS = ['operations/bookings', 'operations/passengers'];
  var ALLOWED_ROOTS = ['data/settings', 'data/catalog', 'data/fleet', 'data/finance', 'operations/liveVehicles', 'operations/auditLogs'];

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function schemaApi() {
    return global.SLTransit && global.SLTransit.schema || global.SLTransitSchema || null;
  }

  function startsWithPath(path, prefix) {
    return path === prefix || path.indexOf(prefix + '/') === 0;
  }

  function isPrivatePath(path) {
    return PRIVATE_PATHS.some(function(prefix) { return startsWithPath(path, prefix); });
  }

  function isAllowedPath(path) {
    return ALLOWED_ROOTS.some(function(prefix) { return startsWithPath(path, prefix); });
  }

  function writePath(root, path, value) {
    var parts = String(path || '').split('/').filter(Boolean);
    if (!parts.length) return;
    var node = root;
    parts.forEach(function(part, index) {
      if (index === parts.length - 1) {
        node[part] = value && typeof value === 'object' ? value : {};
        return;
      }
      node[part] = valueOrEmpty(node[part]);
      node = node[part];
    });
  }

  function flattenUpdates(updates) {
    updates = valueOrEmpty(updates);
    return Object.keys(updates).map(function(path) {
      return { path: path, value: updates[path] };
    });
  }

  function snapshotFromPlan(plan) {
    plan = valueOrEmpty(plan);
    if (plan.snapshot && typeof plan.snapshot === 'object') return plan.snapshot;
    if (plan.data || plan.operations) return { data: valueOrEmpty(plan.data), operations: valueOrEmpty(plan.operations) };
    var root = { data: {}, operations: {} };
    flattenUpdates(plan.updates).forEach(function(entry) { writePath(root, entry.path, entry.value); });
    return root;
  }

  function issue(list, level, code, path, message) {
    list.push({ level: level, code: code, path: path || '', message: message || '' });
  }

  function inspectUpdatePaths(plan, blockers, warnings) {
    flattenUpdates(plan.updates).forEach(function(entry) {
      if (isPrivatePath(entry.path)) issue(blockers, 'blocker', 'private-path-update', entry.path, 'Import plan must not include passenger or booking private paths.');
      if (!isAllowedPath(entry.path)) issue(warnings, 'warning', 'unknown-import-path', entry.path, 'Path is outside the current backbone import allowlist.');
    });
  }

  function validateImportPlan(plan) {
    plan = valueOrEmpty(plan);
    var schema = schemaApi();
    var blockers = [];
    var warnings = [];

    if (plan.dryRun !== true) issue(blockers, 'blocker', 'not-dry-run', '', 'Import plan must set dryRun: true.');
    if (plan.writesEnabled !== false) issue(blockers, 'blocker', 'writes-enabled-not-false', '', 'Import plan must set writesEnabled: false.');
    if (!schema || typeof schema.validateSnapshot !== 'function') issue(blockers, 'blocker', 'schema-validator-missing', '', 'SLTransit schema validator is not loaded.');

    inspectUpdatePaths(plan, blockers, warnings);

    var snapshot = snapshotFromPlan(plan);
    PRIVATE_PATHS.forEach(function(path) {
      var privateValue = schema && schema.readPath ? schema.readPath(snapshot, path) : null;
      if (privateValue && typeof privateValue === 'object' && Object.keys(privateValue).length) {
        issue(blockers, 'blocker', 'private-snapshot-data', path, 'Import plan snapshot must not include private passenger or booking data.');
      }
    });

    var schemaValidation = schema && typeof schema.validateSnapshot === 'function' ? schema.validateSnapshot(snapshot) : null;
    if (schemaValidation) {
      (schemaValidation.blockers || []).forEach(function(item) { blockers.push(item); });
      (schemaValidation.warnings || []).forEach(function(item) { warnings.push(item); });
    }

    return {
      dryRun: true,
      planVersion: PLAN_VERSION,
      readyForReview: blockers.length === 0,
      readyForApply: false,
      writesEnabled: false,
      privatePathsBlocked: PRIVATE_PATHS.slice(),
      allowedRoots: ALLOWED_ROOTS.slice(),
      snapshot: snapshot,
      schemaValidation: schemaValidation,
      blockers: blockers,
      warnings: warnings
    };
  }

  function buildEmptyImportPlan() {
    return {
      dryRun: true,
      writesEnabled: false,
      planVersion: PLAN_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'manual-dry-run',
      data: {
        settings: {},
        catalog: { stops: {}, groups: {}, routes: {}, trips: {}, fares: {}, services: {}, stopTimes: {}, capacities: {}, closures: {} },
        fleet: { vehicles: {}, queues: {}, queueOwners: {} },
        finance: {}
      },
      operations: { liveVehicles: {}, auditLogs: {} }
    };
  }

  var api = {
    PLAN_VERSION: PLAN_VERSION,
    PRIVATE_PATHS: PRIVATE_PATHS.slice(),
    ALLOWED_ROOTS: ALLOWED_ROOTS.slice(),
    validateImportPlan: validateImportPlan,
    buildEmptyImportPlan: buildEmptyImportPlan,
    snapshotFromPlan: snapshotFromPlan
  };

  global.SLTransitImportPlan = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.importPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);