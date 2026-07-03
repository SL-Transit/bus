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
    services: {}
  };
  var _fleet = {
    vehicles: {},
    queues: {},
    queueOwners: {}
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

  function requireDb() {
    if (!_db) throw new Error('SLTransit.db is not initialized');
    return _db;
  }

  function getDatabaseFromApp(firebaseApp) {
    if (firebaseApp && typeof firebaseApp.database === 'function') return firebaseApp.database();
    if (global.firebase && typeof global.firebase.database === 'function') return global.firebase.database();
    throw new Error('Firebase database is not available');
  }

  function read(path) {
    return requireDb().ref(path).once('value').then(function(snap) {
      return snap.val();
    });
  }

  function refreshCatalog() {
    return read('data/catalog').then(function(catalog) {
      _catalog = Object.assign({
        stops: {},
        groups: {},
        routes: {},
        trips: {},
        fares: {},
        services: {}
      }, valueOrEmpty(catalog));
      global.SLTransit = global.SLTransit || {};
      global.SLTransit._stopsCache = _catalog.stops || {};
      return _catalog;
    });
  }

  function refreshFleet() {
    return read('data/fleet').then(function(fleet) {
      _fleet = Object.assign({ vehicles: {}, queues: {}, queueOwners: {} }, valueOrEmpty(fleet));
      return _fleet;
    });
  }

  function refreshSettings() {
    return read('data/settings').then(function(settings) {
      _settings = valueOrEmpty(settings);
      return _settings;
    });
  }

  function init(firebaseApp) {
    _db = getDatabaseFromApp(firebaseApp);
    return Promise.all([refreshCatalog(), refreshFleet(), refreshSettings()]).then(function() {
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

  function reorderStops(orderedKeys) {
    if (!Array.isArray(orderedKeys) || !orderedKeys.length) {
      return Promise.reject(new Error('orderedKeys must be a non-empty array'));
    }
    var updates = {};
    orderedKeys.forEach(function(key, index) {
      updates['data/catalog/stops/' + key + '/order'] = index + 1;
    });
    return requireDb().ref().update(updates).then(refreshCatalog);
  }

  function watchBookings(date, cb) {
    var ref = requireDb().ref('operations/bookings');
    var query = date ? ref.orderByChild('date').equalTo(date) : ref;
    query.on('value', cb);
    return function unsubscribe() { query.off('value', cb); };
  }

  function watchLiveVehicles(cb) {
    var ref = requireDb().ref('operations/liveVehicles');
    ref.on('value', cb);
    return function unsubscribe() { ref.off('value', cb); };
  }

  function saveStop(stopKey, data) {
    return requireDb().ref('data/catalog/stops/' + stopKey).update(data || {}).then(refreshCatalog);
  }

  function saveRoute(routeId, data) {
    return requireDb().ref('data/catalog/routes/' + routeId).update(data || {}).then(refreshCatalog);
  }

  function saveTrip(tripId, data) {
    return requireDb().ref('data/catalog/trips/' + tripId).update(data || {}).then(refreshCatalog);
  }

  function saveFare(originKey, destKey, data) {
    return requireDb().ref('data/catalog/fares/' + originKey + '/' + destKey).update(data || {}).then(refreshCatalog);
  }

  function saveVehicle(vehicleId, data) {
    return requireDb().ref('data/fleet/vehicles/' + vehicleId).update(data || {}).then(refreshFleet);
  }

  function saveQueue(queueId, data) {
    return requireDb().ref('data/fleet/queues/' + queueId).update(data || {}).then(refreshFleet);
  }

  function saveQueueOwner(ownerId, data) {
    return requireDb().ref('data/fleet/queueOwners/' + ownerId).update(data || {}).then(refreshFleet);
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
    var bookingId = 'BK-' + todayStamp() + '-' + randomCode(6);
    var payload = Object.assign({}, data || {}, {
      bookingId: bookingId,
      createdAt: Date.now(),
      status: (data && data.status) || 'awaiting_payment'
    });
    if (VALID_BOOKING_STATUS.indexOf(payload.status) === -1) {
      return Promise.reject(new Error('invalid status: ' + payload.status));
    }
    return requireDb().ref('operations/bookings/' + bookingId).set(payload).then(function() {
      return bookingId;
    });
  }

  function updateBookingStatus(bookingId, status) {
    if (VALID_BOOKING_STATUS.indexOf(status) === -1) {
      return Promise.reject(new Error('invalid status: ' + status));
    }
    return requireDb().ref('operations/bookings/' + bookingId).update({
      status: status,
      updatedAt: Date.now()
    });
  }

  function logTransaction(data) {
    var txId = 'TX-' + Date.now() + '-' + randomCode(4);
    var payload = Object.assign({}, data || {}, { transactionId: txId, createdAt: Date.now() });
    return requireDb().ref('data/finance/transactions/' + txId).set(payload).then(function() {
      return txId;
    });
  }

  function createPassenger(hashedId, data) {
    var passengerId = String(hashedId || '');
    if (passengerId.indexOf('PSG_') !== 0) passengerId = 'PSG_' + passengerId;
    return requireDb().ref('operations/passengers/' + passengerId).update(data || {}).then(function() {
      return passengerId;
    });
  }

  var api = {
    init: init,
    isReady: isReady,
    refreshCatalog: refreshCatalog,
    getStops: getStops,
    getStop: getStop,
    getRoute: getRoute,
    getTrip: getTrip,
    getFare: getFare,
    getGroup: getGroup,
    getService: getService,
    getSettings: getSettings,
    getFinanceTransactions: getFinanceTransactions,
    getVehicles: getVehicles,
    getQueues: getQueues,
    getQueueOwners: getQueueOwners,
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