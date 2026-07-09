(function(global) {
  'use strict';

  var PLAN_VERSION = 'erp/import-plan-v1';
  var ERP_DATA_CENTER_ROOT = 'data/erpDataCenter';
  var ALLOWED_ROOTS = [ERP_DATA_CENTER_ROOT];
  var LEGACY_SOURCE_PATHS = ['data/settings', 'data/catalog', 'data/fleet', 'data/finance', 'publishedCatalog', 'routeData', 'settings/routes'];
  var RUNTIME_CONTRACT_PATHS = [
    'operations/dailyAssignments',
    'operations/vehicleSessions',
    'operations/liveVehicles',
    'operations/notificationEvents',
    'operations/notificationDeliveries'
  ];
  var PRIVATE_RUNTIME_PATHS = [
    'bookings',
    'testBookings',
    'operations/bookings',
    'passengers',
    'operations/passengers',
    'tickets',
    'ticketRecords',
    'checkins',
    'checkIns',
    'operations/tickets',
    'operations/checkins',
    'operations/checkIns',
    'driverLogs',
    'operations/driverLogs',
    'line_sent',
    'lineLogs',
    'test_line_logs',
    'mockLogs/checkTicketNotifications',
    'liveVehicles',
    'bus',
    'operations/liveVehicles'
  ];
  var BLOCKED_IMPORT_PATHS = LEGACY_SOURCE_PATHS.concat(RUNTIME_CONTRACT_PATHS, PRIVATE_RUNTIME_PATHS);
  var FORBIDDEN_ERP_DESCENDANT_NAMES = [
    'bookings',
    'testBookings',
    'passengers',
    'tickets',
    'ticketRecords',
    'ticketAccess',
    'checkIns',
    'driverLogs',
    'lineLogs'
  ];
  var FORBIDDEN_ERP_OPERATIONS_SUBTREES = [
    'data/erpDataCenter/operations/bookings',
    'data/erpDataCenter/operations/passengers',
    'data/erpDataCenter/operations/liveVehicles',
    'data/erpDataCenter/operations/notificationEvents',
    'data/erpDataCenter/operations/notificationDeliveries',
    'data/erpDataCenter/operations/vehicleSessions',
    'data/erpDataCenter/operations/dailyAssignments'
  ];

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function schemaApi() {
    return global.SLTransit && global.SLTransit.schema || global.SLTransitSchema || null;
  }

  function startsWithPath(path, prefix) {
    return path === prefix || path.indexOf(prefix + '/') === 0;
  }

  function readPath(root, path) {
    return String(path || '').split('/').filter(Boolean).reduce(function(node, part) {
      if (!node || typeof node !== 'object') return undefined;
      return node[part];
    }, root || {});
  }

  function isBlockedPath(path) {
    return BLOCKED_IMPORT_PATHS.some(function(prefix) { return startsWithPath(path, prefix); });
  }

  function isForbiddenErpOperationsPath(path) {
    return FORBIDDEN_ERP_OPERATIONS_SUBTREES.some(function(prefix) { return startsWithPath(path, prefix); });
  }

  function forbiddenErpDescendantName(path) {
    if (!startsWithPath(path, ERP_DATA_CENTER_ROOT)) return '';
    var parts = String(path || '').split('/').filter(Boolean);
    for (var i = 2; i < parts.length; i++) {
      if (FORBIDDEN_ERP_DESCENDANT_NAMES.indexOf(parts[i]) !== -1) return parts[i];
    }
    return '';
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

  function inspectErpDataCenterPath(path, blockers) {
    if (isForbiddenErpOperationsPath(path)) {
      issue(blockers, 'blocker', 'forbidden-erp-operations-subtree', path, 'Runtime/private operations subtrees must not be nested under data/erpDataCenter.');
      return;
    }
    var forbiddenName = forbiddenErpDescendantName(path);
    if (forbiddenName) {
      issue(blockers, 'blocker', 'forbidden-erp-descendant-name', path, 'Forbidden private/runtime descendant name under data/erpDataCenter: ' + forbiddenName + '.');
    }
  }

  function walkSnapshotPaths(node, basePath, callback) {
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function(key) {
      var path = basePath ? basePath + '/' + key : key;
      callback(path, node[key]);
      walkSnapshotPaths(node[key], path, callback);
    });
  }

  function inspectSnapshotPaths(snapshot, blockers) {
    BLOCKED_IMPORT_PATHS.forEach(function(path) {
      var value = readPath(snapshot, path);
      if (value && typeof value === 'object' && Object.keys(value).length) {
        issue(blockers, 'blocker', 'blocked-snapshot-path', path, 'Import plan must not seed legacy, private, or runtime contract paths.');
      }
    });
    walkSnapshotPaths(snapshot, '', function(path) {
      inspectErpDataCenterPath(path, blockers);
    });
  }

  function inspectUpdatePaths(plan, blockers, warnings) {
    flattenUpdates(plan.updates).forEach(function(entry) {
      if (isBlockedPath(entry.path)) issue(blockers, 'blocker', 'blocked-import-path', entry.path, 'Import plan must not target legacy, private, or runtime contract paths.');
      inspectErpDataCenterPath(entry.path, blockers);
      if (!isAllowedPath(entry.path)) issue(blockers, 'blocker', 'non-erp-data-center-target', entry.path, 'Seed/import targets must be under data/erpDataCenter/* only.');
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
    inspectSnapshotPaths(snapshot, blockers);

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
      erpDataCenterRoot: ERP_DATA_CENTER_ROOT,
      blockedImportPaths: BLOCKED_IMPORT_PATHS.slice(),
      forbiddenErpDescendantNames: FORBIDDEN_ERP_DESCENDANT_NAMES.slice(),
      forbiddenErpOperationsSubtrees: FORBIDDEN_ERP_OPERATIONS_SUBTREES.slice(),
      runtimeContractPaths: RUNTIME_CONTRACT_PATHS.slice(),
      legacySourcePaths: LEGACY_SOURCE_PATHS.slice(),
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
        erpDataCenter: {
          settings: {},
          catalog: { stops: {}, groups: {}, routes: {}, trips: {}, fares: {}, fareSegments: {}, services: {}, stopTimes: {}, capacities: {}, closures: {} },
          fleet: { vehicles: {}, queues: {}, queueOwners: {}, vehicleLoginIndex: {} },
          finance: {},
          providerRegistry: {}
        }
      }
    };
  }

  var api = {
    PLAN_VERSION: PLAN_VERSION,
    ERP_DATA_CENTER_ROOT: ERP_DATA_CENTER_ROOT,
    BLOCKED_IMPORT_PATHS: BLOCKED_IMPORT_PATHS.slice(),
    FORBIDDEN_ERP_DESCENDANT_NAMES: FORBIDDEN_ERP_DESCENDANT_NAMES.slice(),
    FORBIDDEN_ERP_OPERATIONS_SUBTREES: FORBIDDEN_ERP_OPERATIONS_SUBTREES.slice(),
    RUNTIME_CONTRACT_PATHS: RUNTIME_CONTRACT_PATHS.slice(),
    LEGACY_SOURCE_PATHS: LEGACY_SOURCE_PATHS.slice(),
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
