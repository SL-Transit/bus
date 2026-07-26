(function(global) {
  'use strict';

  var GPS_STALE_MS = 5 * 60 * 1000;
  var SOURCE_CONTRACTS = {
    booking: {
      status: 'proposed',
      path: 'operations/bookings',
      canonicalIdFields: ['bookingId', 'code', 'id'],
      serviceDateFields: ['serviceDate', 'date'],
      statusFields: ['status', 'bookingStatus'],
      timestampFields: ['createdAt', 'updatedAt']
    },
    payment: { status: 'unresolved' },
    refund: { status: 'unresolved' },
    vehicleRuntime: {
      status: 'proposed',
      paths: ['operations/liveVehicles', 'operations/driverWorkByServiceDate/{serviceDate}'],
      canonicalIdFields: ['vehicleId', 'id'],
      timestampFields: ['gpsTimestamp', 'locationUpdatedAt', 'updatedAt', 'lastSeenAt']
    },
    incident: { status: 'unresolved' },
    systemHealth: { status: 'unresolved' },
    recentActivity: {
      status: 'proposed',
      paths: ['operations/notificationEvents', 'data/erpDataCenter/meta/audit']
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
    var value = firstField(item, SOURCE_CONTRACTS.booking.serviceDateFields);
    return String(value || '').slice(0, 10);
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
    return String(item.vehicleId || item.id || item.__key || '').trim();
  }
  function workVehicleIdOf(item) {
    return String(item.vehicleId || item.erpVehicleId || item.id || item.__key || '').trim();
  }
  function hasActiveWork(work) {
    var status = String(work.status || work.workState || '').toLowerCase();
    return !!(work.activeTripId || work.currentTrip || work.tripId || status === 'active' || status === 'running' || status === 'in_service');
  }
  function normalizeBookings(snapshot, serviceDate) {
    var byId = {};
    valuesWithKey(snapshot).forEach(function(item) {
      var id = canonicalBookingId(item);
      if (!id || serviceDateOf(item) !== serviceDate) return;
      var current = byId[id];
      if (!current || stampMs(item.updatedAt || item.createdAt) >= stampMs(current.updatedAt || current.createdAt)) byId[id] = item;
    });
    var items = keys(byId).map(function(id) { return Object.assign({ bookingId: id }, byId[id]); });
    var byStatus = {};
    items.forEach(function(item) {
      var status = statusOf(item);
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return { status: items.length ? 'resolved' : 'empty', items: items, count: items.length, byStatus: byStatus };
  }
  function normalizeRefunds(bookings, contract) {
    if (!contract || contract.confirmed !== true) return { status: 'unresolved', items: [], count: 0 };
    var pending = contract.pendingStatuses || [];
    var field = contract.statusField;
    var items = bookings.items.filter(function(item) { return pending.indexOf(String(item[field] || '')) >= 0; });
    return { status: items.length ? 'resolved' : 'empty', items: items, count: items.length };
  }
  function normalizeRevenue(bookings, contract) {
    if (!contract || contract.confirmed !== true) return { status: 'unresolved', amount: null, hourly: [], proportions: [] };
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
    return { status: total ? 'resolved' : 'empty', amount: total, hourly: keys(buckets).sort().map(function(hour) { return { hour: hour, amount: buckets[hour] }; }) };
  }
  function normalizeFleet(liveSnapshot, workSnapshot, nowMs) {
    var workByVehicle = {};
    valuesWithKey(workSnapshot).forEach(function(work) { workByVehicle[workVehicleIdOf(work)] = work; });
    var vehicles = valuesWithKey(liveSnapshot).map(function(vehicle) {
      var id = vehicleIdOf(vehicle), work = workByVehicle[id] || {}, point = pointOf(vehicle);
      var gpsAt = stampMs(firstField(vehicle, SOURCE_CONTRACTS.vehicleRuntime.timestampFields));
      var stale = !gpsAt || (nowMs - gpsAt) > GPS_STALE_MS;
      var active = !!(point && !stale && hasActiveWork(work));
      var status = active ? 'running' : (!point ? 'missing_gps' : (stale ? 'stale_gps' : 'inactive'));
      return { vehicleId: id, point: point, gpsAt: gpsAt, stale: stale, active: active, status: status, raw: vehicle, work: work };
    });
    var byStatus = { running: 0, inactive: 0, stale_gps: 0, missing_gps: 0 };
    vehicles.forEach(function(vehicle) { byStatus[vehicle.status] = (byStatus[vehicle.status] || 0) + 1; });
    return { status: vehicles.length ? 'resolved' : 'empty', vehicles: vehicles, byStatus: byStatus, runningCount: byStatus.running || 0 };
  }
  function normalizeActivities(sources) {
    var events = valuesWithKey(sources.notificationEvents).concat(valuesWithKey(sources.erpAudit)).map(function(item) {
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
      Booking: sources.bookingsError ? 'อ่านข้อมูลไม่ได้' : 'เชื่อมต่อบางส่วน',
      GPS: sources.liveVehiclesError ? 'อ่านข้อมูลไม่ได้' : (keys(sources.liveVehicles).length ? 'เชื่อมต่อบางส่วน' : 'ไม่มีข้อมูล'),
      Notification: sources.notificationEventsError ? 'อ่านข้อมูลไม่ได้' : (keys(sources.notificationEvents).length ? 'เชื่อมต่อบางส่วน' : 'ไม่มีข้อมูล'),
      ERP: 'เชื่อมต่อบางส่วน',
      DriverApp: sources.driverWorkError ? 'อ่านข้อมูลไม่ได้' : (keys(sources.driverWork).length ? 'เชื่อมต่อบางส่วน' : 'ไม่มีข้อมูล')
    };
  }
  function build(raw, options) {
    raw = raw || {};
    options = options || {};
    var serviceDate = options.serviceDate || '';
    var nowMs = options.nowMs || Date.now();
    var bookings = normalizeBookings(raw.bookings, serviceDate);
    var refunds = normalizeRefunds(bookings, options.refundContract);
    var revenue = normalizeRevenue(bookings, options.paymentContract);
    var fleet = normalizeFleet(raw.liveVehicles, raw.driverWork, nowMs);
    var activities = normalizeActivities(raw);
    return {
      status: 'resolved_partial',
      serviceDate: serviceDate,
      sourceContracts: SOURCE_CONTRACTS,
      bookings: bookings,
      refunds: refunds,
      revenue: revenue,
      incidents: { status: 'unresolved', items: [], count: 0 },
      fleet: fleet,
      health: options.healthContract && options.healthContract.confirmed ? options.healthContract.values : healthFromSources(raw),
      activities: activities,
      unresolved: ['payment', 'refund', 'incident', 'systemHealth'].filter(function(name) { return SOURCE_CONTRACTS[name] && SOURCE_CONTRACTS[name].status === 'unresolved'; }),
      chartProportions: {
        bookings: proportions(bookings.byStatus),
        fleet: proportions(fleet.byStatus)
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
  function readValue(db, path) {
    return db.ref(path).once('value').then(function(snap) { return snap.val() || {}; });
  }
  function readSources(db, serviceDate) {
    var paths = {
      bookings: 'operations/bookings',
      liveVehicles: 'operations/liveVehicles',
      driverWork: 'operations/driverWorkByServiceDate/' + serviceDate,
      driverTickets: 'operations/driverTicketsByServiceDate/' + serviceDate,
      notificationEvents: 'operations/notificationEvents',
      erpAudit: 'data/erpDataCenter/meta/audit'
    };
    var output = {};
    return Promise.all(keys(paths).map(function(key) {
      return readValue(db, paths[key]).then(function(value) {
        output[key] = value;
      }).catch(function(err) {
        output[key] = {};
        output[key + 'Error'] = err.message || String(err);
      });
    })).then(function() {
      output.paths = paths;
      return output;
    });
  }
  function load(db, options) {
    options = options || {};
    if (!db) return Promise.resolve(build({}, options));
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
      proportions: proportions
    }
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.screen01ReadModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
