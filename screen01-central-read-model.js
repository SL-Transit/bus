(function(global) {
  'use strict';

  var DEFAULT_GPS_STALE_MS = 5 * 60 * 1000;
  var NOT_CONNECTED = 'ยังไม่ได้เชื่อมต่อ';
  var NO_DATA = 'ไม่มีข้อมูล';
  var PARTIAL = 'เชื่อมต่อบางส่วน';
  var STALE = 'ข้อมูลล้าสมัย';
  var READ_FAILED = 'อ่านข้อมูลไม่ได้';

  var SOURCE_CONTRACTS = {
    booking: {
      status: 'proposed',
      path: 'operations/bookings',
      query: "orderByChild('date').equalTo(serviceDate)",
      canonicalIdFields: ['bookingId', 'code', 'id'],
      serviceDateFields: ['date', 'serviceDate'],
      statusFields: ['status', 'bookingStatus'],
      timestampFields: ['updatedAt', 'createdAt', 'reservedAt'],
      evidence: [
        "erp-data-adapter.js watchBookings(date) queries operations/bookings by child 'date'",
        "database.rules.json declares operations/bookings .indexOn ['date', 'originKey', 'destKey', 'status']"
      ],
      approvalRequired: 'Owner must confirm that date is the service-date field for Dashboard reporting'
    },
    payment: { status: 'unresolved' },
    refund: { status: 'unresolved' },
    vehicleRuntime: {
      status: 'proposed',
      paths: ['operations/liveVehicles', 'operations/driverWorkByServiceDate/{serviceDate}'],
      canonicalIdFields: ['vehicleId', 'id', 'runtimeVehicleId'],
      timestampFields: ['gpsTimestamp', 'locationUpdatedAt', 'updatedAt', 'lastSeenAt'],
      operationalStates: ['active_service', 'inactive', 'unknown'],
      telemetryStates: ['live_gps', 'stale_gps', 'missing_gps'],
      gpsFreshness: {
        status: 'proposed',
        source: 'runtime options.gpsStaleMs',
        temporaryDefaultMs: DEFAULT_GPS_STALE_MS,
        note: 'Temporary fallback only for read-only review; not Owner-confirmed production rule'
      },
      evidence: [
        'functions/driver-work-auto-center.js writes operations/driverWorkByServiceDate/{serviceDate}/{vehicleId}',
        'erp-schema.js validates operations/liveVehicles lat/lng/serviceStatus/currentTripId',
        'database.rules.json restricts broad driverWorkByServiceDate reads; admin permission must be confirmed'
      ]
    },
    incident: { status: 'unresolved' },
    systemHealth: { status: 'unresolved' },
    recentActivity: {
      status: 'proposed',
      paths: ['operations/notificationEvents', 'data/erpDataCenter/meta/audit'],
      limits: { notificationEvents: 50, erpAudit: 50 }
    },
    legacyBookings: {
      status: 'legacy',
      path: 'bookings',
      rejected: true,
      reason: 'Do not use as automatic Dashboard fallback'
    }
  };

  function obj(value) { return value && typeof value === 'object' ? value : {}; }
  function keys(value) { return Object.keys(obj(value)); }
  function sourceOk(source) { return !!source && source.status !== 'error' && source.status !== 'unavailable'; }
  function sourceError(source) { return source && source.status === 'error' ? source.error : null; }
  function valuesWithKey(value) {
    if (Array.isArray(value)) return value.map(function(item, index) { return Object.assign({ __key: String(index) }, obj(item)); });
    return keys(value).map(function(key) { return Object.assign({ __key: key }, obj(value[key])); });
  }
  function firstField(item, fields) {
    for (var i = 0; i < fields.length; i++) {
      if (item[fields[i]] != null && item[fields[i]] !== '') return item[fields[i]];
    }
    return null;
  }
  function canonicalBookingId(item) {
    return String(firstField(item, SOURCE_CONTRACTS.booking.canonicalIdFields) || item.__key || '').trim();
  }
  function serviceDateOf(item) {
    return String(firstField(item, SOURCE_CONTRACTS.booking.serviceDateFields) || '').slice(0, 10);
  }
  function statusOf(item) {
    return String(firstField(item, SOURCE_CONTRACTS.booking.statusFields) || 'unknown');
  }
  function stampMs(value) {
    if (typeof value === 'number') return value;
    var parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function numberValue(value) {
    if (value === '' || value == null) return null;
    var parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  function pointOf(item) {
    var source = item && (item.location || item.gps || item.position || item);
    var lat = Number(source && (source.lat != null ? source.lat : source.latitude));
    var lng = Number(source && (source.lng != null ? source.lng : source.longitude));
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat, lng: lng } : null;
  }
  function vehicleIdOf(item) {
    return String(item.vehicleId || item.runtimeVehicleId || item.id || item.__key || '').trim();
  }
  function workVehicleIdOf(item) {
    return String(item.vehicleId || item.runtimeVehicleId || item.erpVehicleId || item.id || item.__key || '').trim();
  }
  function hasActiveWork(work) {
    var status = String(work.status || work.workState || work.serviceState || '').toLowerCase();
    return !!(
      work.activeTripId ||
      work.currentTripId ||
      work.currentTrip ||
      work.tripId ||
      status === 'active' ||
      status === 'active_service' ||
      status === 'running' ||
      status === 'in_service' ||
      status === 'ready'
    );
  }
  function source(status, path, value, error) {
    return { status: status, path: path || '', value: value || {}, error: error || null };
  }
  function normalizeSource(raw, key, path) {
    if (raw && raw.sources && raw.sources[key]) return raw.sources[key];
    if (raw && raw[key + 'Error']) return source('error', path, {}, raw[key + 'Error']);
    if (raw && raw[key] != null) return source(keys(raw[key]).length ? 'proposed' : 'empty', path, raw[key], null);
    return source('unavailable', path, {}, null);
  }
  function sourceItems(sourceModel) {
    return sourceOk(sourceModel) ? valuesWithKey(sourceModel.value) : [];
  }
  function normalizeBookings(snapshotSource, serviceDate) {
    if (!snapshotSource || snapshotSource.status === 'unavailable') return { status: 'unavailable', contractStatus: 'proposed', items: [], count: null, byStatus: {}, error: null };
    if (snapshotSource.status === 'error') return { status: 'error', contractStatus: 'proposed', items: [], count: null, byStatus: {}, error: snapshotSource.error };

    var byId = {};
    sourceItems(snapshotSource).forEach(function(item) {
      var id = canonicalBookingId(item);
      if (!id || serviceDateOf(item) !== serviceDate) return;
      var current = byId[id];
      if (!current || stampMs(item.updatedAt || item.createdAt || item.reservedAt) >= stampMs(current.updatedAt || current.createdAt || current.reservedAt)) byId[id] = item;
    });
    var items = keys(byId).map(function(id) { return Object.assign({ bookingId: id }, byId[id]); });
    var byStatus = {};
    items.forEach(function(item) {
      var status = statusOf(item);
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return { status: items.length ? 'proposed' : 'empty', contractStatus: 'proposed', items: items, count: items.length, byStatus: byStatus, error: null };
  }
  function normalizeRefunds(bookings, contract) {
    if (!contract || contract.confirmed !== true) return { status: 'unresolved', items: [], count: null };
    if (bookings.status === 'error' || bookings.status === 'unavailable') return { status: bookings.status, items: [], count: null, error: bookings.error || null };
    var pending = contract.pendingStatuses || [];
    var field = contract.statusField;
    var items = bookings.items.filter(function(item) { return pending.indexOf(String(item[field] || '')) >= 0; });
    return { status: items.length ? 'confirmed' : 'empty', items: items, count: items.length };
  }
  function normalizeRevenue(bookings, contract) {
    if (!contract || contract.confirmed !== true) return { status: 'unresolved', amount: null, hourly: [], proportions: [] };
    if (bookings.status === 'error' || bookings.status === 'unavailable') return { status: bookings.status, amount: null, hourly: [], error: bookings.error || null };
    var paid = contract.paidStatuses || [], cancelled = contract.cancelledStatuses || [], completedRefund = contract.completedRefundStatuses || [], amountField = contract.amountField;
    var paymentField = contract.paymentStatusField, bookingStatusField = contract.bookingStatusField || 'status';
    var refundField = contract.refundStatusField, refundAmountField = contract.refundAmountField;
    var total = 0, buckets = {};
    bookings.items.forEach(function(item) {
      if (paid.indexOf(String(item[paymentField] || '')) < 0) return;
      if (cancelled.indexOf(String(item[bookingStatusField] || '')) >= 0) return;
      if (refundField && completedRefund.indexOf(String(item[refundField] || '')) >= 0) return;
      var amount = numberValue(item[amountField]);
      if (amount == null) return;
      var refundAmount = refundAmountField ? numberValue(item[refundAmountField]) : null;
      if (refundAmount != null) amount = Math.max(0, amount - refundAmount);
      total += amount;
      var hour = String(item.paidAt || item.updatedAt || item.createdAt || '').slice(11, 13) || 'unknown';
      buckets[hour] = (buckets[hour] || 0) + amount;
    });
    return { status: total ? 'confirmed' : 'empty', amount: total, hourly: keys(buckets).sort().map(function(hour) { return { hour: hour, amount: buckets[hour] }; }) };
  }
  function normalizeFleet(liveSource, workSource, options) {
    options = options || {};
    if (!liveSource || liveSource.status === 'unavailable' || !workSource || workSource.status === 'unavailable') {
      return emptyFleet('unavailable', null, liveSource, workSource, options);
    }
    if (liveSource.status === 'error' || workSource.status === 'error') {
      return emptyFleet('error', sourceError(liveSource) || sourceError(workSource), liveSource, workSource, options);
    }

    var nowMs = options.nowMs || Date.now();
    var gpsStaleMs = Number(options.gpsStaleMs);
    var gpsFreshness = options.gpsFreshness || {};
    var threshold = Number.isFinite(gpsStaleMs) ? gpsStaleMs : DEFAULT_GPS_STALE_MS;
    var thresholdStatus = gpsFreshness.confirmed === true ? 'confirmed' : 'proposed';
    var liveByVehicle = {}, workByVehicle = {}, ids = {};

    sourceItems(liveSource).forEach(function(live) {
      var id = vehicleIdOf(live);
      if (!id) return;
      liveByVehicle[id] = live;
      ids[id] = true;
    });
    sourceItems(workSource).forEach(function(work) {
      var id = workVehicleIdOf(work);
      if (!id) return;
      workByVehicle[id] = work;
      ids[id] = true;
    });

    var vehicles = keys(ids).sort().map(function(id) {
      var live = liveByVehicle[id] || {};
      var work = workByVehicle[id] || {};
      var point = pointOf(live);
      var gpsAt = stampMs(firstField(live, SOURCE_CONTRACTS.vehicleRuntime.timestampFields));
      var telemetryState = !point ? 'missing_gps' : (!gpsAt || (nowMs - gpsAt) > threshold ? 'stale_gps' : 'live_gps');
      var operationalState = hasActiveWork(work) ? 'active_service' : (workByVehicle[id] ? 'inactive' : 'unknown');
      return {
        vehicleId: id,
        point: point,
        gpsAt: gpsAt,
        operationalState: operationalState,
        telemetryState: telemetryState,
        gpsFreshnessStatus: thresholdStatus,
        status: operationalState,
        raw: live,
        work: work
      };
    });

    var operational = { active_service: 0, inactive: 0, unknown: 0 };
    var telemetry = { live_gps: 0, stale_gps: 0, missing_gps: 0 };
    vehicles.forEach(function(vehicle) {
      operational[vehicle.operationalState] = (operational[vehicle.operationalState] || 0) + 1;
      telemetry[vehicle.telemetryState] = (telemetry[vehicle.telemetryState] || 0) + 1;
    });
    return {
      status: vehicles.length ? 'proposed' : 'empty',
      contractStatus: 'proposed',
      vehicles: vehicles,
      byStatus: Object.assign({}, operational, telemetry),
      operational: operational,
      telemetry: telemetry,
      activeServiceCount: operational.active_service || 0,
      runningCount: operational.active_service || 0,
      gpsFreshness: {
        status: thresholdStatus,
        thresholdMs: threshold,
        source: gpsFreshness.source || (thresholdStatus === 'confirmed' ? 'runtime contract' : 'temporary proposed default')
      }
    };
  }
  function emptyFleet(status, error, liveSource, workSource, options) {
    var threshold = Number.isFinite(Number(options && options.gpsStaleMs)) ? Number(options.gpsStaleMs) : DEFAULT_GPS_STALE_MS;
    return {
      status: status,
      contractStatus: 'proposed',
      vehicles: [],
      byStatus: { active_service: 0, inactive: 0, unknown: 0, live_gps: 0, stale_gps: 0, missing_gps: 0 },
      operational: { active_service: 0, inactive: 0, unknown: 0 },
      telemetry: { live_gps: 0, stale_gps: 0, missing_gps: 0 },
      activeServiceCount: status === 'empty' ? 0 : null,
      runningCount: status === 'empty' ? 0 : null,
      error: error || null,
      gpsFreshness: { status: 'proposed', thresholdMs: threshold, source: 'temporary proposed default' }
    };
  }
  function normalizeActivities(notificationSource, auditSource) {
    if ((!notificationSource || notificationSource.status === 'unavailable') && (!auditSource || auditSource.status === 'unavailable')) return [];
    var events = sourceItems(notificationSource).concat(sourceItems(auditSource)).map(function(item) {
      var time = item.createdAt || item.updatedAt || item.timestamp || item.at || '';
      return {
        time: time,
        type: item.event || item.type || item.status || 'record',
        description: item.message || item.details || item.id || item.__key || 'read-only record',
        actor: item.actor || item.actorId || item.user || 'ระบบ',
        sort: stampMs(time)
      };
    }).sort(function(a, b) { return b.sort - a.sort; });
    return events;
  }
  function healthFromSources(sources) {
    return {
      Booking: sources.bookings.status === 'error' ? READ_FAILED : (sources.bookings.status === 'unavailable' ? NOT_CONNECTED : PARTIAL),
      GPS: sources.liveVehicles.status === 'error' || sources.driverWork.status === 'error' ? READ_FAILED : ((sources.liveVehicles.status === 'empty' && sources.driverWork.status === 'empty') ? NO_DATA : PARTIAL),
      Notification: sources.notificationEvents.status === 'error' ? READ_FAILED : (sources.notificationEvents.status === 'empty' ? NO_DATA : PARTIAL),
      ERP: sources.erpAudit.status === 'error' ? READ_FAILED : (sources.erpAudit.status === 'empty' ? NO_DATA : PARTIAL),
      DriverApp: sources.driverWork.status === 'error' ? READ_FAILED : (sources.driverWork.status === 'empty' ? NO_DATA : PARTIAL)
    };
  }
  function build(raw, options) {
    raw = raw || {};
    options = options || {};
    var serviceDate = options.serviceDate || '';
    var sourcePaths = raw.paths || {};
    var sources = {
      bookings: normalizeSource(raw, 'bookings', sourcePaths.bookings || 'operations/bookings'),
      liveVehicles: normalizeSource(raw, 'liveVehicles', sourcePaths.liveVehicles || 'operations/liveVehicles'),
      driverWork: normalizeSource(raw, 'driverWork', sourcePaths.driverWork || ('operations/driverWorkByServiceDate/' + serviceDate)),
      notificationEvents: normalizeSource(raw, 'notificationEvents', sourcePaths.notificationEvents || 'operations/notificationEvents'),
      erpAudit: normalizeSource(raw, 'erpAudit', sourcePaths.erpAudit || 'data/erpDataCenter/meta/audit')
    };
    var bookings = normalizeBookings(sources.bookings, serviceDate);
    var refunds = normalizeRefunds(bookings, options.refundContract);
    var revenue = normalizeRevenue(bookings, options.paymentContract);
    var fleet = normalizeFleet(sources.liveVehicles, sources.driverWork, options);
    var activities = normalizeActivities(sources.notificationEvents, sources.erpAudit);
    var modelStatus = keys(sources).some(function(key) { return sources[key].status === 'error'; }) ? 'error_partial' : 'proposed_partial';
    return {
      status: modelStatus,
      serviceDate: serviceDate,
      sourceContracts: SOURCE_CONTRACTS,
      sources: sources,
      bookings: bookings,
      refunds: refunds,
      revenue: revenue,
      incidents: { status: 'unresolved', items: [], count: null },
      fleet: fleet,
      health: options.healthContract && options.healthContract.confirmed ? options.healthContract.values : healthFromSources(sources),
      activities: activities,
      unresolved: ['payment', 'refund', 'incident', 'systemHealth'].filter(function(name) { return SOURCE_CONTRACTS[name] && SOURCE_CONTRACTS[name].status === 'unresolved'; }),
      chartProportions: {
        bookings: proportions(bookings.byStatus),
        fleet: proportions(fleet.operational),
        gps: proportions(fleet.telemetry)
      },
      legacyRejected: ['bookings']
    };
  }
  function proportions(counts) {
    var total = keys(counts).reduce(function(sum, key) { return sum + Number(counts[key] || 0); }, 0);
    return keys(counts).sort().map(function(key) {
      return { key: key, count: counts[key], percent: total ? Math.round((counts[key] / total) * 1000) / 10 : 0 };
    });
  }
  function readValue(ref) {
    return ref.once('value').then(function(snap) { return snap.val() || {}; });
  }
  function safeRead(output, key, path, refFactory) {
    return readValue(refFactory()).then(function(value) {
      output[key] = value;
    }).catch(function(err) {
      output[key + 'Error'] = err.message || String(err);
    });
  }
  function readSources(db, serviceDate) {
    var paths = {
      bookings: 'operations/bookings',
      liveVehicles: 'operations/liveVehicles',
      driverWork: 'operations/driverWorkByServiceDate/' + serviceDate,
      notificationEvents: 'operations/notificationEvents',
      erpAudit: 'data/erpDataCenter/meta/audit'
    };
    var limits = SOURCE_CONTRACTS.recentActivity.limits;
    var output = { paths: paths, queryPlan: {
      bookings: "operations/bookings.orderByChild('date').equalTo(serviceDate)",
      notificationEvents: 'limitToLast(' + limits.notificationEvents + ')',
      erpAudit: 'limitToLast(' + limits.erpAudit + ')',
      driverTickets: 'not read: no documented Dashboard use'
    } };
    return Promise.all([
      safeRead(output, 'bookings', paths.bookings, function() { return db.ref(paths.bookings).orderByChild('date').equalTo(serviceDate); }),
      safeRead(output, 'liveVehicles', paths.liveVehicles, function() { return db.ref(paths.liveVehicles); }),
      safeRead(output, 'driverWork', paths.driverWork, function() { return db.ref(paths.driverWork); }),
      safeRead(output, 'notificationEvents', paths.notificationEvents, function() { return db.ref(paths.notificationEvents).limitToLast(limits.notificationEvents); }),
      safeRead(output, 'erpAudit', paths.erpAudit, function() { return db.ref(paths.erpAudit).limitToLast(limits.erpAudit); })
    ]).then(function() {
      return output;
    });
  }
  function load(db, options) {
    options = options || {};
    if (!db) return Promise.resolve(build({ sources: {
      bookings: source('unavailable', 'operations/bookings', {}, null),
      liveVehicles: source('unavailable', 'operations/liveVehicles', {}, null),
      driverWork: source('unavailable', 'operations/driverWorkByServiceDate/' + (options.serviceDate || ''), {}, null),
      notificationEvents: source('unavailable', 'operations/notificationEvents', {}, null),
      erpAudit: source('unavailable', 'data/erpDataCenter/meta/audit', {}, null)
    } }, options));
    return readSources(db, options.serviceDate || '').then(function(raw) {
      return build(raw, options);
    });
  }

  var api = {
    SOURCE_CONTRACTS: SOURCE_CONTRACTS,
    build: build,
    load: load,
    _test: {
      normalizeBookings: normalizeBookings,
      normalizeRefunds: normalizeRefunds,
      normalizeRevenue: normalizeRevenue,
      normalizeFleet: normalizeFleet,
      proportions: proportions,
      readSources: readSources
    }
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.screen01ReadModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
