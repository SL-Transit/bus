(function(global) {
  'use strict';

  var SCHEMA_VERSION = 'erp/backbone-v1';

  var PATHS = {
    settings: 'data/settings',
    catalog: 'data/catalog',
    catalogStops: 'data/catalog/stops',
    catalogGroups: 'data/catalog/groups',
    catalogRoutes: 'data/catalog/routes',
    catalogTrips: 'data/catalog/trips',
    catalogFares: 'data/catalog/fares',
    catalogServices: 'data/catalog/services',
    catalogStopTimes: 'data/catalog/stopTimes',
    catalogCapacities: 'data/catalog/capacities',
    catalogClosures: 'data/catalog/closures',
    fleet: 'data/fleet',
    fleetVehicles: 'data/fleet/vehicles',
    fleetQueues: 'data/fleet/queues',
    fleetQueueOwners: 'data/fleet/queueOwners',
    finance: 'data/finance',
    financeTransactions: 'data/finance/transactions',
    operations: 'operations',
    operationsBookings: 'operations/bookings',
    operationsPassengers: 'operations/passengers',
    operationsLiveVehicles: 'operations/liveVehicles',
    operationsAuditLogs: 'operations/auditLogs'
  };

  var REQUIRED_COLLECTIONS = [
    'data/settings',
    'data/catalog/stops',
    'data/catalog/routes',
    'data/catalog/trips',
    'data/fleet/vehicles',
    'data/fleet/queues',
    'operations/liveVehicles'
  ];

  var OPTIONAL_COLLECTIONS = [
    'data/catalog/groups',
    'data/catalog/fares',
    'data/catalog/services',
    'data/catalog/stopTimes',
    'data/catalog/capacities',
    'data/catalog/closures',
    'data/fleet/queueOwners',
    'data/finance/transactions',
    'operations/bookings',
    'operations/passengers',
    'operations/auditLogs'
  ];

  var RECORD_REQUIREMENTS = {
    stop: ['stopKey', 'nameTh', 'order'],
    route: ['id', 'fromStopKey', 'toStopKey'],
    trip: ['id', 'routeId', 'departTime'],
    vehicle: ['vehicleId', 'status'],
    queue: ['queueId', 'groupId']
  };

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function pathOf(key) {
    return PATHS[key] || '';
  }

  function readPath(root, path) {
    return String(path || '').split('/').filter(Boolean).reduce(function(node, part) {
      if (!node || typeof node !== 'object') return undefined;
      return node[part];
    }, root || {});
  }

  function hasCollection(root, path) {
    var value = readPath(root, path);
    return !!(value && typeof value === 'object' && Object.keys(value).length);
  }

  function missingFields(record, fields) {
    record = valueOrEmpty(record);
    return fields.filter(function(field) {
      return record[field] == null || record[field] === '';
    });
  }

  function scanMap(root, path, type, issues) {
    var map = valueOrEmpty(readPath(root, path));
    var fields = RECORD_REQUIREMENTS[type] || [];
    Object.keys(map).forEach(function(key) {
      var missing = missingFields(map[key], fields);
      if (missing.length) {
        issues.push({ level: 'warning', code: 'missing-required-fields', path: path + '/' + key, type: type, fields: missing });
      }
    });
  }

  function validateSnapshot(snapshot) {
    var root = valueOrEmpty(snapshot);
    var missingCollections = REQUIRED_COLLECTIONS.filter(function(path) { return !hasCollection(root, path); });
    var warnings = [];
    var blockers = [];

    missingCollections.forEach(function(path) {
      blockers.push({ level: 'blocker', code: 'missing-required-collection', path: path });
    });

    scanMap(root, PATHS.catalogStops, 'stop', warnings);
    scanMap(root, PATHS.catalogRoutes, 'route', warnings);
    scanMap(root, PATHS.catalogTrips, 'trip', warnings);
    scanMap(root, PATHS.fleetVehicles, 'vehicle', warnings);
    scanMap(root, PATHS.fleetQueues, 'queue', warnings);

    return {
      dryRun: true,
      schemaVersion: SCHEMA_VERSION,
      readyForBackboneReview: blockers.length === 0,
      readyForSwitch: false,
      requiredCollections: REQUIRED_COLLECTIONS.slice(),
      optionalCollections: OPTIONAL_COLLECTIONS.slice(),
      missingCollections: missingCollections,
      blockers: blockers,
      warnings: warnings
    };
  }

  function buildSeedSkeleton() {
    return {
      dryRun: true,
      schemaVersion: SCHEMA_VERSION,
      data: {
        settings: {},
        catalog: {
          stops: {},
          groups: {},
          routes: {},
          trips: {},
          fares: {},
          services: {},
          stopTimes: {},
          capacities: {},
          closures: {}
        },
        fleet: {
          vehicles: {},
          queues: {},
          queueOwners: {}
        },
        finance: {
          transactions: {}
        }
      },
      operations: {
        bookings: {},
        passengers: {},
        liveVehicles: {},
        auditLogs: {}
      }
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PATHS: Object.assign({}, PATHS),
    REQUIRED_COLLECTIONS: REQUIRED_COLLECTIONS.slice(),
    OPTIONAL_COLLECTIONS: OPTIONAL_COLLECTIONS.slice(),
    RECORD_REQUIREMENTS: Object.assign({}, RECORD_REQUIREMENTS),
    pathOf: pathOf,
    readPath: readPath,
    validateSnapshot: validateSnapshot,
    buildSeedSkeleton: buildSeedSkeleton
  };

  global.SLTransitSchema = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.schema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);