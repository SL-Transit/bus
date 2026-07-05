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
    'data/fleet/queues'
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
    'operations/liveVehicles',
    'operations/bookings',
    'operations/passengers',
    'operations/auditLogs'
  ];

  var RECORD_REQUIREMENTS = {
    stop: ['stopKey', 'nameTh', 'order'],
    route: ['id', 'fromStopKey', 'toStopKey'],
    trip: ['id', 'routeId', 'departTime'],
    vehicle: ['vehicleId', 'status'],
    queue: ['queueId', 'groupId'],
    liveVehicle: ['vehicleId', 'lat', 'lng', 'updatedAt', 'serviceStatus']
  };

  var VALID_LIVE_VEHICLE_STATUS = ['active', 'moving', 'idle', 'standby', 'off_duty', 'offline'];

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
  function hasRecord(map, id) {
    return id != null && id !== '' && !!valueOrEmpty(map)[id];
  }

  function addReferenceIssue(issues, path, field, targetPath, targetId, code) {
    issues.push({
      level: 'warning',
      code: code || 'missing-reference',
      path: path,
      field: field,
      targetPath: targetPath,
      targetId: targetId
    });
  }


  function addValidationIssue(issues, path, field, code, value) {
    issues.push({
      level: 'warning',
      code: code,
      path: path,
      field: field,
      value: value
    });
  }

  function isFiniteNumber(value) {
    return value !== null && value !== '' && isFinite(Number(value));
  }

  function isValidLatitude(value) {
    var n = Number(value);
    return isFiniteNumber(value) && n >= -90 && n <= 90;
  }

  function isValidLongitude(value) {
    var n = Number(value);
    return isFiniteNumber(value) && n >= -180 && n <= 180;
  }

  function scanLiveVehicleRecords(root, issues) {
    var liveVehicles = valueOrEmpty(readPath(root, PATHS.operationsLiveVehicles));
    var vehicles = valueOrEmpty(readPath(root, PATHS.fleetVehicles));
    var queues = valueOrEmpty(readPath(root, PATHS.fleetQueues));
    var trips = valueOrEmpty(readPath(root, PATHS.catalogTrips));

    Object.keys(liveVehicles).forEach(function(key) {
      var live = valueOrEmpty(liveVehicles[key]);
      var path = PATHS.operationsLiveVehicles + '/' + key;
      if (live.lat != null && !isValidLatitude(live.lat)) addValidationIssue(issues, path, 'lat', 'invalid-latitude', live.lat);
      if (live.lng != null && !isValidLongitude(live.lng)) addValidationIssue(issues, path, 'lng', 'invalid-longitude', live.lng);
      if (live.speed != null && !isFiniteNumber(live.speed)) addValidationIssue(issues, path, 'speed', 'invalid-number', live.speed);
      if (live.heading != null && (!isFiniteNumber(live.heading) || Number(live.heading) < 0 || Number(live.heading) > 360)) addValidationIssue(issues, path, 'heading', 'invalid-heading', live.heading);
      if (live.serviceStatus && VALID_LIVE_VEHICLE_STATUS.indexOf(String(live.serviceStatus)) === -1) addValidationIssue(issues, path, 'serviceStatus', 'invalid-live-vehicle-status', live.serviceStatus);
      if (live.vehicleId && !hasRecord(vehicles, live.vehicleId)) addReferenceIssue(issues, path, 'vehicleId', PATHS.fleetVehicles, live.vehicleId);
      if (live.queueId && !hasRecord(queues, live.queueId)) addReferenceIssue(issues, path, 'queueId', PATHS.fleetQueues, live.queueId);
      if (live.currentTripId && !hasRecord(trips, live.currentTripId)) addReferenceIssue(issues, path, 'currentTripId', PATHS.catalogTrips, live.currentTripId);
    });
  }

  function scanReferences(root, issues) {
    var stops = valueOrEmpty(readPath(root, PATHS.catalogStops));
    var routes = valueOrEmpty(readPath(root, PATHS.catalogRoutes));
    var trips = valueOrEmpty(readPath(root, PATHS.catalogTrips));
    var fares = valueOrEmpty(readPath(root, PATHS.catalogFares));
    var vehicles = valueOrEmpty(readPath(root, PATHS.fleetVehicles));
    var queues = valueOrEmpty(readPath(root, PATHS.fleetQueues));
    var queueOwners = valueOrEmpty(readPath(root, PATHS.fleetQueueOwners));

    Object.keys(routes).forEach(function(key) {
      var route = valueOrEmpty(routes[key]);
      if (route.fromStopKey && !hasRecord(stops, route.fromStopKey)) addReferenceIssue(issues, PATHS.catalogRoutes + '/' + key, 'fromStopKey', PATHS.catalogStops, route.fromStopKey);
      if (route.toStopKey && !hasRecord(stops, route.toStopKey)) addReferenceIssue(issues, PATHS.catalogRoutes + '/' + key, 'toStopKey', PATHS.catalogStops, route.toStopKey);
    });

    Object.keys(trips).forEach(function(key) {
      var trip = valueOrEmpty(trips[key]);
      if (trip.routeId && !hasRecord(routes, trip.routeId)) addReferenceIssue(issues, PATHS.catalogTrips + '/' + key, 'routeId', PATHS.catalogRoutes, trip.routeId);
      if (trip.vehicleId && !hasRecord(vehicles, trip.vehicleId)) addReferenceIssue(issues, PATHS.catalogTrips + '/' + key, 'vehicleId', PATHS.fleetVehicles, trip.vehicleId);
      (Array.isArray(trip.stopTimes) ? trip.stopTimes : []).forEach(function(stopTime, index) {
        var stopKey = valueOrEmpty(stopTime).stopKey;
        if (stopKey && !hasRecord(stops, stopKey)) addReferenceIssue(issues, PATHS.catalogTrips + '/' + key + '/stopTimes/' + index, 'stopKey', PATHS.catalogStops, stopKey);
      });
    });

    Object.keys(fares).forEach(function(originKey) {
      if (!hasRecord(stops, originKey)) addReferenceIssue(issues, PATHS.catalogFares + '/' + originKey, 'originKey', PATHS.catalogStops, originKey);
      Object.keys(valueOrEmpty(fares[originKey])).forEach(function(destKey) {
        if (!hasRecord(stops, destKey)) addReferenceIssue(issues, PATHS.catalogFares + '/' + originKey + '/' + destKey, 'destKey', PATHS.catalogStops, destKey);
      });
    });

    Object.keys(vehicles).forEach(function(key) {
      var vehicle = valueOrEmpty(vehicles[key]);
      if (vehicle.queueId && !hasRecord(queues, vehicle.queueId)) addReferenceIssue(issues, PATHS.fleetVehicles + '/' + key, 'queueId', PATHS.fleetQueues, vehicle.queueId);
    });

    Object.keys(queues).forEach(function(key) {
      var queue = valueOrEmpty(queues[key]);
      if (queue.vehicleId && !hasRecord(vehicles, queue.vehicleId)) addReferenceIssue(issues, PATHS.fleetQueues + '/' + key, 'vehicleId', PATHS.fleetVehicles, queue.vehicleId);
      if (queue.ownerId && !hasRecord(queueOwners, queue.ownerId)) addReferenceIssue(issues, PATHS.fleetQueues + '/' + key, 'ownerId', PATHS.fleetQueueOwners, queue.ownerId);
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
    scanMap(root, PATHS.operationsLiveVehicles, 'liveVehicle', warnings);
    if (!hasCollection(root, PATHS.operationsLiveVehicles)) {
      warnings.push({
        level: 'warning',
        code: 'empty-operational-state',
        path: PATHS.operationsLiveVehicles,
        message: 'No live vehicles are present; allowed for dry-run import because live vehicles are operational state.'
      });
    }
    scanReferences(root, warnings);
    scanLiveVehicleRecords(root, warnings);
    var readinessGate = {
      dryRun: true,
      readyForBackboneReview: blockers.length === 0,
      readyForSwitch: false,
      blockers: blockers.slice(),
      warnings: warnings.slice(),
      requiredNextChecks: [
        'data-import-dry-run-approved',
        'feature-bridge-parity-verified',
        'github-actions-pages-live-verified',
        'private-collections-not-read-by-default'
      ]
    };
    return {
      dryRun: true,
      schemaVersion: SCHEMA_VERSION,
      readyForBackboneReview: blockers.length === 0,
      readyForSwitch: false,
      readinessGate: readinessGate,
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
    scanReferences: scanReferences,
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