(function(global) {
  'use strict';

  var VALID_BOOKING_STATUS = [
    'awaiting_payment',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled',
    'refunded',
    'expired',
    'no_show'
  ];

  var _db = null;
  var _catalog = {
    stops: {},
    groups: {},
    routes: {},
    trips: {},
    fares: {},
    services: {},
    stopTimes: {},
    capacities: {},
    closures: {}
  };
  var _fleet = {
    vehicles: {},
    queues: {},
    assignmentRules: {},
    drivers: {},
    queueOwners: {},
    vehicleLoginIndex: {}
  };
  var _master = {
    destinations: {},
    stops: {},
    boardingPoints: {},
    terminals: {},
    providers: {},
    serviceGroups: {},
    routes: {},
    routeStopSequences: {},
    trips: {},
    stopTimes: {},
    fares: {},
    fareSegments: {},
    transferRules: {},
    paymentOwnership: {},
    temporaryClosures: {},
    serviceFees: {},
    settlementRecipients: {},
    meta: { versions: {}, audit: {} }
  };
  var _settings = {};
  var _ready = false;

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function valuesSortedByOrder(map) {
    return Object.keys(valueOrEmpty(map)).map(function(key) {
      var item = Object.assign({}, map[key] || {});
      if (item.id == null && item.stopKey == null && item.key == null) item.key = key;
      return item;
    }).sort(function(a, b) {
      var ao = Number(a.order == null ? 999999 : a.order);
      var bo = Number(b.order == null ? 999999 : b.order);
      if (ao !== bo) return ao - bo;
      return String(a.stopKey || a.id || a.key || '').localeCompare(String(b.stopKey || b.id || b.key || ''));
    });
  }


  function valuesWithId(map, idField) {
    return Object.keys(valueOrEmpty(map)).map(function(key) {
      var item = Object.assign({}, map[key] || {});
      if (item[idField] == null || item[idField] === '') item[idField] = key;
      if (item.id == null || item.id === '') item.id = key;
      return item;
    }).sort(function(a, b) {
      var ao = Number(a.sortOrder == null ? (a.order == null ? 999999 : a.order) : a.sortOrder);
      var bo = Number(b.sortOrder == null ? (b.order == null ? 999999 : b.order) : b.sortOrder);
      if (ao !== bo) return ao - bo;
      var at = String(a.departTime || a.time || '');
      var bt = String(b.departTime || b.time || '');
      if (at !== bt) return at.localeCompare(bt);
      return String(a[idField] || a.id || '').localeCompare(String(b[idField] || b.id || ''));
    });
  }

  function requireDb() {
    if (!_db) throw new Error('SLTransit.db is not initialized');
    return _db;
  }

  function runtimeWriteDisabled(operation, path) {
    return Promise.reject(new Error('ERP Data Center guard blocks ' + operation + ' writes to private/runtime path: ' + path));
  }

  function getDatabaseFromApp(firebaseApp) {
    if (firebaseApp && typeof firebaseApp.database === 'function') return firebaseApp.database();
    if (global.firebase && typeof global.firebase.database === 'function') return global.firebase.database();
    throw new Error('Firebase database is not available');
  }

  function schemaPath(key, fallback) {
    var schema = global.SLTransit && global.SLTransit.schema || global.SLTransitSchema;
    if (schema && typeof schema.pathOf === 'function') return schema.pathOf(key) || fallback;
    return fallback;
  }

  function joinPath() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join('/');
  }

  function read(path) {
    return requireDb().ref(path).once('value').then(function(snap) {
      return snap.val();
    });
  }

  function refreshCatalog() {
    return read(schemaPath('catalog', 'data/erpDataCenter/catalog')).then(function(catalog) {
      _catalog = Object.assign({
        stops: {},
        groups: {},
        routes: {},
        trips: {},
        fares: {},
        services: {},
        stopTimes: {},
        capacities: {},
        closures: {}
      }, valueOrEmpty(catalog));
      global.SLTransit = global.SLTransit || {};
      global.SLTransit._stopsCache = _catalog.stops || {};
      return _catalog;
    });
  }

  function refreshFleet() {
    return read(schemaPath('fleet', 'data/erpDataCenter/fleet')).then(function(fleet) {
      _fleet = Object.assign({ vehicles: {}, queues: {}, assignmentRules: {}, drivers: {}, queueOwners: {}, vehicleLoginIndex: {} }, valueOrEmpty(fleet));
      return _fleet;
    });
  }

  function refreshMasterData() {
    return read(schemaPath('erpDataCenter', 'data/erpDataCenter')).then(function(root) {
      root = valueOrEmpty(root);
      _master = Object.assign({
        destinations: {},
        stops: {},
        boardingPoints: {},
        terminals: {},
        providers: {},
        serviceGroups: {},
        routes: {},
        routeStopSequences: {},
        trips: {},
        stopTimes: {},
        fares: {},
        fareSegments: {},
        transferRules: {},
        paymentOwnership: {},
        temporaryClosures: {},
        serviceFees: {},
        settlementRecipients: {},
        meta: { versions: {}, audit: {} }
      }, root);
      return _master;
    });
  }

  function refreshSettings() {
    return read(schemaPath('settings', 'data/erpDataCenter/settings')).then(function(settings) {
      _settings = valueOrEmpty(settings);
      return _settings;
    });
  }

  function init(firebaseApp) {
    _db = getDatabaseFromApp(firebaseApp);
    return Promise.all([refreshCatalog(), refreshFleet(), refreshSettings(), refreshMasterData()]).then(function() {
      _ready = true;
      return api;
    });
  }

  function isReady() { return _ready; }

  function getStops() {
    return Promise.resolve(valuesSortedByOrder(_catalog.stops));
  }

  function getStop(stopKey) {
    return Promise.resolve((_catalog.stops || {})[stopKey] || null);
  }

  function getRoute(routeId) {
    return Promise.resolve((_catalog.routes || {})[routeId] || null);
  }

  function getTrip(tripId) {
    return Promise.resolve((_catalog.trips || {})[tripId] || null);
  }


  function getRoutes() {
    return Promise.resolve(valuesWithId(_catalog.routes, 'routeId'));
  }

  function getTrips(routeId) {
    var trips = valuesWithId(_catalog.trips, 'tripId');
    if (routeId) {
      trips = trips.filter(function(trip) { return trip.routeId === routeId; });
    }
    return Promise.resolve(trips);
  }

  function getFares() {
    var fares = [];
    Object.keys(valueOrEmpty(_catalog.fares)).forEach(function(originKey) {
      Object.keys(valueOrEmpty(_catalog.fares[originKey])).forEach(function(destKey) {
        fares.push(Object.assign({ originKey: originKey, destKey: destKey }, _catalog.fares[originKey][destKey] || {}));
      });
    });
    return Promise.resolve(fares);
  }

  function getCapacities() {
    return Promise.resolve(valuesWithId(_catalog.capacities, 'capacityId'));
  }

  function getFare(originKey, destKey) {
    var byOrigin = (_catalog.fares || {})[originKey] || {};
    return Promise.resolve(byOrigin[destKey] || null);
  }

  function getGroup(groupId) {
    return Promise.resolve((_catalog.groups || {})[groupId] || null);
  }

  function getService(serviceId) {
    return Promise.resolve((_catalog.services || {})[serviceId] || null);
  }

  function getSettings() {
    return Promise.resolve(Object.assign({}, _settings));
  }

  function validateBackboneSnapshot(snapshot) {
    var schema = global.SLTransit && global.SLTransit.schema || global.SLTransitSchema;
    if (!schema || typeof schema.validateSnapshot !== 'function') {
      return Promise.reject(new Error('SLTransit schema validator is not loaded'));
    }
    return Promise.resolve(schema.validateSnapshot(snapshot || {}));
  }

  function getBackboneSnapshot(options) {
    options = options || {};
    var snapshot = { data: {}, operations: {} };
    var reads = [
      read(schemaPath('erpDataCenter', 'data/erpDataCenter')).then(function(value) { snapshot.data.erpDataCenter = valueOrEmpty(value); })
    ];
    if (options.includeBookings === true) {
      reads.push(read(schemaPath('operationsBookings', 'operations/bookings')).then(function(value) { snapshot.operations.bookings = valueOrEmpty(value); }));
    }
    if (options.includePassengers === true) {
      reads.push(read(schemaPath('operationsPassengers', 'operations/passengers')).then(function(value) { snapshot.operations.passengers = valueOrEmpty(value); }));
    }
    return Promise.all(reads).then(function() {
      snapshot.dryRun = true;
      snapshot.skippedPrivateCollections = [];
      if (options.includeBookings !== true) snapshot.skippedPrivateCollections.push(schemaPath('operationsBookings', 'operations/bookings'));
      if (options.includePassengers !== true) snapshot.skippedPrivateCollections.push(schemaPath('operationsPassengers', 'operations/passengers'));
      return snapshot;
    });
  }

  function assessBackbone(options) {
    return getBackboneSnapshot(options).then(function(snapshot) {
      return validateBackboneSnapshot(snapshot).then(function(validation) {
        return { dryRun: true, snapshot: snapshot, validation: validation };
      });
    });
  }
  function getSchemaApi() {
    return global.SLTransit && global.SLTransit.schema || global.SLTransitSchema || null;
  }

  function isPrivateBackbonePath(path) {
    return path === schemaPath('operationsBookings', 'operations/bookings') ||
      path === schemaPath('operationsPassengers', 'operations/passengers') ||
      path === schemaPath('operationsLiveVehicles', 'operations/liveVehicles') ||
      path === schemaPath('operationsDailyAssignments', 'operations/dailyAssignments') ||
      path === schemaPath('operationsVehicleSessions', 'operations/vehicleSessions') ||
      path === schemaPath('operationsNotificationEvents', 'operations/notificationEvents') ||
      path === schemaPath('operationsNotificationDeliveries', 'operations/notificationDeliveries');
  }

  function buildBackboneSeedPlan(input) {
    var schema = getSchemaApi();
    if (!schema || typeof schema.validateSnapshot !== 'function') {
      return Promise.reject(new Error('SLTransit schema validator is not loaded'));
    }
    var snapshot = input && input.snapshot ? input.snapshot : (input || {});
    var validation = input && input.validation ? input.validation : schema.validateSnapshot(snapshot);
    var skeleton = typeof schema.buildSeedSkeleton === 'function' ? schema.buildSeedSkeleton() : { data: {}, operations: {} };
    var required = (validation.requiredCollections || schema.REQUIRED_COLLECTIONS || []).filter(function(path) { return !isPrivateBackbonePath(path); });
    var optional = (validation.optionalCollections || schema.OPTIONAL_COLLECTIONS || []).filter(function(path) { return !isPrivateBackbonePath(path); });
    var missing = validation.missingCollections || [];
    var updates = {};
    var collections = required.concat(optional).map(function(path) {
      var seed = schema.readPath && schema.readPath(skeleton, path) || {};
      var missingCollection = missing.indexOf(path) >= 0;
      if (missingCollection) updates[path] = seed;
      return {
        path: path,
        required: required.indexOf(path) >= 0,
        missing: missingCollection,
        seed: seed
      };
    });
    return Promise.resolve({
      dryRun: true,
      schemaVersion: validation.schemaVersion || schema.SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'erp-data-adapter buildBackboneSeedPlan',
      action: 'review-only',
      writesEnabled: false,
      privateCollectionsExcluded: [
        schemaPath('operationsBookings', 'operations/bookings'),
        schemaPath('operationsPassengers', 'operations/passengers'),
        schemaPath('operationsLiveVehicles', 'operations/liveVehicles'),
        schemaPath('operationsDailyAssignments', 'operations/dailyAssignments'),
        schemaPath('operationsVehicleSessions', 'operations/vehicleSessions'),
        schemaPath('operationsNotificationEvents', 'operations/notificationEvents'),
        schemaPath('operationsNotificationDeliveries', 'operations/notificationDeliveries')
      ],
      missingCollections: missing.filter(function(path) { return !isPrivateBackbonePath(path); }),
      updates: updates,
      collections: collections,
      validation: validation
    });
  }

  function getFinanceTransactions(monthKey) {
    return read(schemaPath('financeTransactions', 'data/erpDataCenter/finance/transactions')).then(function(transactions) {
      return Object.keys(valueOrEmpty(transactions)).map(function(key) {
        return Object.assign({ id: key }, transactions[key] || {});
      }).filter(function(tx) {
        if (!monthKey) return true;
        var stamp = String(tx.monthKey || tx.date || tx.createdAt || tx.timestamp || '');
        return stamp.indexOf(monthKey) === 0;
      }).sort(function(a, b) {
        return String(b.createdAt || b.timestamp || b.date || '').localeCompare(String(a.createdAt || a.timestamp || a.date || ''));
      });
    });
  }

  function getVehicles() {
    return Promise.resolve(Object.keys(valueOrEmpty(_fleet.vehicles)).map(function(key) {
      return Object.assign({ vehicleId: key }, _fleet.vehicles[key] || {});
    }));
  }

  function getQueues() {
    return Promise.resolve(Object.keys(valueOrEmpty(_fleet.queues)).map(function(key) {
      return Object.assign({ queueId: key }, _fleet.queues[key] || {});
    }));
  }

  function getQueueOwners() {
    return Promise.resolve(Object.keys(valueOrEmpty(_fleet.queueOwners)).map(function(key) {
      return Object.assign({ ownerId: key }, _fleet.queueOwners[key] || {});
    }));
  }

  function masterValues(map, idField) {
    return valuesWithId(map, idField);
  }

  function getDestinations() { return Promise.resolve(masterValues(_master.destinations, 'destinationId')); }
  function getBoardingPoints() { return Promise.resolve(masterValues(_master.boardingPoints, 'boardingPointId')); }
  function getTerminals() { return Promise.resolve(masterValues(_master.terminals, 'terminalId')); }
  function getProviders() { return Promise.resolve(masterValues(_master.providers, 'providerId')); }
  function getServiceGroups() { return Promise.resolve(masterValues(_master.serviceGroups, 'serviceGroupId')); }
  function getMasterRoutes() { return Promise.resolve(masterValues(_master.routes, 'routeId')); }
  function getDrivers() { return Promise.resolve(masterValues(_fleet.drivers || _master.fleet && _master.fleet.drivers || {}, 'driverId')); }
  function getSettlementRecipients() { return Promise.resolve(masterValues(_master.settlementRecipients, 'settlementRecipientId')); }
  function getServiceFees() { return Promise.resolve(masterValues(_master.serviceFees, 'serviceFeeId')); }

  function getAdminMasterDataCatalog() {
    return Promise.resolve({
      destinations: valueOrEmpty(_master.destinations),
      stops: valueOrEmpty(_master.stops),
      boardingPoints: valueOrEmpty(_master.boardingPoints),
      terminals: valueOrEmpty(_master.terminals),
      providers: valueOrEmpty(_master.providers),
      serviceGroups: valueOrEmpty(_master.serviceGroups),
      routes: valueOrEmpty(_master.routes),
      vehicles: valueOrEmpty(_fleet.vehicles),
      drivers: valueOrEmpty(_fleet.drivers),
      queues: valueOrEmpty(_fleet.queues),
      settlementRecipients: valueOrEmpty(_master.settlementRecipients),
      serviceFees: valueOrEmpty(_master.serviceFees)
    });
  }

  function validateMasterDataChange(change) {
    var guard = global.SLTransit && global.SLTransit.adminMasterData;
    if (!guard || typeof guard.validateMasterDataChange !== 'function') {
      return Promise.reject(new Error('SLTransit admin master-data guard is not loaded'));
    }
    return Promise.resolve(guard.validateMasterDataChange(change || {}));
  }

  function buildMasterDataPlan(change) {
    var guard = global.SLTransit && global.SLTransit.adminMasterData;
    if (!guard || typeof guard.buildMasterDataPlan !== 'function') {
      return Promise.reject(new Error('SLTransit admin master-data guard is not loaded'));
    }
    return Promise.resolve(guard.buildMasterDataPlan(change || {}));
  }

  function reorderStops(orderedKeys) {
    if (!Array.isArray(orderedKeys) || !orderedKeys.length) {
      return Promise.reject(new Error('orderedKeys must be a non-empty array'));
    }
    var updates = {};
    orderedKeys.forEach(function(key, index) {
      updates[joinPath(schemaPath('catalogStops', 'data/erpDataCenter/catalog/stops'), key, 'order')] = index + 1;
    });
    return requireDb().ref().update(updates).then(refreshCatalog);
  }

  function watchBookings(date, cb) {
    var ref = requireDb().ref(schemaPath('operationsBookings', 'operations/bookings'));
    var query = date ? ref.orderByChild('date').equalTo(date) : ref;
    query.on('value', cb);
    return function unsubscribe() { query.off('value', cb); };
  }

  function watchLiveVehicles(cb) {
    var ref = requireDb().ref(schemaPath('operationsLiveVehicles', 'operations/liveVehicles'));
    ref.on('value', cb);
    return function unsubscribe() { ref.off('value', cb); };
  }

  function saveStop(stopKey, data) {
    return requireDb().ref(joinPath(schemaPath('catalogStops', 'data/erpDataCenter/catalog/stops'), stopKey)).update(data || {}).then(refreshCatalog);
  }

  function saveRoute(routeId, data) {
    return requireDb().ref(joinPath(schemaPath('catalogRoutes', 'data/erpDataCenter/catalog/routes'), routeId)).update(data || {}).then(refreshCatalog);
  }

  function saveTrip(tripId, data) {
    return requireDb().ref(joinPath(schemaPath('catalogTrips', 'data/erpDataCenter/catalog/trips'), tripId)).update(data || {}).then(refreshCatalog);
  }

  function saveFare(originKey, destKey, data) {
    return requireDb().ref(joinPath(schemaPath('catalogFares', 'data/erpDataCenter/catalog/fares'), originKey, destKey)).update(data || {}).then(refreshCatalog);
  }

  function saveVehicle(vehicleId, data) {
    return requireDb().ref(joinPath(schemaPath('fleetVehicles', 'data/erpDataCenter/fleet/vehicles'), vehicleId)).update(data || {}).then(refreshFleet);
  }

  function saveQueue(queueId, data) {
    return requireDb().ref(joinPath(schemaPath('fleetQueues', 'data/erpDataCenter/fleet/queues'), queueId)).update(data || {}).then(refreshFleet);
  }

  function saveQueueOwner(ownerId, data) {
    return requireDb().ref(joinPath(schemaPath('fleetQueueOwners', 'data/erpDataCenter/fleet/queueOwners'), ownerId)).update(data || {}).then(refreshFleet);
  }

  function nextIdFromMap(map, prefix, width) {
    var max = 0;
    Object.keys(valueOrEmpty(map)).forEach(function(key) {
      if (key.indexOf(prefix) !== 0) return;
      var raw = key.slice(prefix.length);
      var num = parseInt(raw, 10);
      if (!isNaN(num) && num > max) max = num;
    });
    return prefix + String(max + 1).padStart(width, '0');
  }

  function nextRouteId(groupId) {
    return Promise.resolve(nextIdFromMap(_catalog.routes, groupId + '_R', 3));
  }

  function nextTripId(groupId) {
    return Promise.resolve(nextIdFromMap(_catalog.trips, groupId + '_T', 3));
  }

  function nextVehicleId() {
    return Promise.resolve(nextIdFromMap(_fleet.vehicles, 'VH', 3));
  }

  function nextQueueId() {
    return Promise.resolve(nextIdFromMap(_fleet.queues, 'Q', 3));
  }

  function randomCode(length) {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var out = '';
    for (var i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function todayStamp() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  function createBooking(data) {
    return runtimeWriteDisabled('createBooking', schemaPath('operationsBookings', 'operations/bookings'));
    var bookingId = 'BK-' + todayStamp() + '-' + randomCode(6);
    var payload = Object.assign({}, data || {}, {
      bookingId: bookingId,
      createdAt: Date.now(),
      status: (data && data.status) || 'awaiting_payment'
    });
    if (VALID_BOOKING_STATUS.indexOf(payload.status) === -1) {
      return Promise.reject(new Error('invalid status: ' + payload.status));
    }
    return requireDb().ref(joinPath(schemaPath('operationsBookings', 'operations/bookings'), bookingId)).set(payload).then(function() {
      return bookingId;
    });
  }

  function updateBookingStatus(bookingId, status) {
    return runtimeWriteDisabled('updateBookingStatus', schemaPath('operationsBookings', 'operations/bookings'));
    if (VALID_BOOKING_STATUS.indexOf(status) === -1) {
      return Promise.reject(new Error('invalid status: ' + status));
    }
    return requireDb().ref(joinPath(schemaPath('operationsBookings', 'operations/bookings'), bookingId)).update({
      status: status,
      updatedAt: Date.now()
    });
  }

  function logTransaction(data) {
    var txId = 'TX-' + Date.now() + '-' + randomCode(4);
    var payload = Object.assign({}, data || {}, { transactionId: txId, createdAt: Date.now() });
    return requireDb().ref(joinPath(schemaPath('financeTransactions', 'data/erpDataCenter/finance/transactions'), txId)).set(payload).then(function() {
      return txId;
    });
  }

  function createPassenger(hashedId, data) {
    return runtimeWriteDisabled('createPassenger', schemaPath('operationsPassengers', 'operations/passengers'));
    var passengerId = String(hashedId || '');
    if (passengerId.indexOf('PSG_') !== 0) passengerId = 'PSG_' + passengerId;
    return requireDb().ref(joinPath(schemaPath('operationsPassengers', 'operations/passengers'), passengerId)).update(data || {}).then(function() {
      return passengerId;
    });
  }

  var api = {
    init: init,
    isReady: isReady,
    refreshCatalog: refreshCatalog,
    refreshMasterData: refreshMasterData,
    getStops: getStops,
    getStop: getStop,
    getRoute: getRoute,
    getRoutes: getRoutes,
    getTrip: getTrip,
    getTrips: getTrips,
    getFare: getFare,
    getFares: getFares,
    getCapacities: getCapacities,
    getGroup: getGroup,
    getService: getService,
    getSettings: getSettings,
    validateBackboneSnapshot: validateBackboneSnapshot,
    getBackboneSnapshot: getBackboneSnapshot,
    assessBackbone: assessBackbone,
    buildBackboneSeedPlan: buildBackboneSeedPlan,
    getFinanceTransactions: getFinanceTransactions,
    getVehicles: getVehicles,
    getQueues: getQueues,
    getQueueOwners: getQueueOwners,
    getDestinations: getDestinations,
    getBoardingPoints: getBoardingPoints,
    getTerminals: getTerminals,
    getProviders: getProviders,
    getServiceGroups: getServiceGroups,
    getMasterRoutes: getMasterRoutes,
    getDrivers: getDrivers,
    getSettlementRecipients: getSettlementRecipients,
    getServiceFees: getServiceFees,
    getAdminMasterDataCatalog: getAdminMasterDataCatalog,
    validateMasterDataChange: validateMasterDataChange,
    buildMasterDataPlan: buildMasterDataPlan,
    reorderStops: reorderStops,
    watchBookings: watchBookings,
    watchLiveVehicles: watchLiveVehicles,
    saveStop: saveStop,
    saveRoute: saveRoute,
    saveTrip: saveTrip,
    saveFare: saveFare,
    saveVehicle: saveVehicle,
    saveQueue: saveQueue,
    saveQueueOwner: saveQueueOwner,
    nextRouteId: nextRouteId,
    nextTripId: nextTripId,
    nextVehicleId: nextVehicleId,
    nextQueueId: nextQueueId,
    createBooking: createBooking,
    updateBookingStatus: updateBookingStatus,
    logTransaction: logTransaction,
    createPassenger: createPassenger,
    VALID_BOOKING_STATUS: VALID_BOOKING_STATUS.slice()
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.db = api;
})(typeof window !== 'undefined' ? window : globalThis);
