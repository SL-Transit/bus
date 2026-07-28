(function(global) {
  'use strict';

  var DEFAULT_GPS_STALE_MS = 5 * 60 * 1000;
  var SITE_ANALYTICS_ENDPOINT = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readSiteAnalytics';
  var ANALYTICS_PRIVATE_FIELDS = /visitorHash|sessionHash|visitorState|visitorSeen|firstWriteToken|rawVisitor|rawSession|userAgent|ip|pagePath|pageCategory|privateMarker|secret|hmac/i;
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
    webAnalytics: {
      status: 'confirmed',
      path: SITE_ANALYTICS_ENDPOINT,
      contractVersion: 'web_analytics_v1',
      metrics: ['visits', 'estimatedVisitors'],
      legacyExcluded: 'analytics/mainWeb'
    },
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
  function integerAtLeastZero(value) {
    return Number.isInteger(value) && value >= 0;
  }
  function hasPrivateField(value) {
    if (!value || typeof value !== 'object') return false;
    return keys(value).some(function(key) {
      return ANALYTICS_PRIVATE_FIELDS.test(key) || hasPrivateField(value[key]);
    });
  }
  function pad2(value) { return String(value).padStart(2, '0'); }
  function dateFromYmd(ymd) {
    var parts = String(ymd || '').split('-').map(Number);
    return new Date(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1));
  }
  function formatYmd(date) {
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }
  function addDays(ymd, amount) {
    var date = dateFromYmd(ymd);
    date.setUTCDate(date.getUTCDate() + amount);
    return formatYmd(date);
  }
  function addMonths(ym, amount) {
    var parts = String(ym || '').split('-').map(Number);
    var date = new Date(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1 + amount, 1));
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1);
  }
  function isoWeekKey(ymd) {
    var date = dateFromYmd(ymd);
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + pad2(week);
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
    return driverWorkOperationalState(work) === 'active_service';
  }
  function driverWorkOperationalState(work) {
    if (!work || !keys(work).length) return 'unknown';
    if (work.contractVersion !== 'driver_work_v1') return 'unknown';
    var status = String(work.status || '').toLowerCase();
    if (status === 'assigned') return work.currentTrip ? 'active_service' : 'inactive';
    if (status === 'service_complete' || status === 'unassigned') return 'inactive';
    return 'unknown';
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
  function analyticsBucketPlan(range, serviceDate) {
    var day = serviceDate || formatYmd(new Date());
    var month = day.slice(0, 7);
    if (range === 'hourly') {
      return {
        granularity: 'hourly',
        buckets: Array.from({ length: 24 }, function(_, hour) {
          var key = day + 'T' + pad2(hour);
          return { key: key, label: pad2(hour) + ':00' };
        })
      };
    }
    if (range === 'weekly') {
      return {
        granularity: 'weekly',
        buckets: Array.from({ length: 12 }, function(_, index) {
          var key = isoWeekKey(addDays(day, (index - 11) * 7));
          return { key: key, label: key.replace('-', ' ') };
        })
      };
    }
    if (range === 'monthly') {
      return {
        granularity: 'monthly',
        buckets: Array.from({ length: 12 }, function(_, index) {
          var key = addMonths(month, index - 11);
          return { key: key, label: key.slice(5) + '/' + key.slice(2, 4) };
        })
      };
    }
    if (range === 'yearly') {
      var year = Number(day.slice(0, 4)) || new Date().getUTCFullYear();
      return {
        granularity: 'yearly',
        buckets: Array.from({ length: 5 }, function(_, index) {
          var key = String(year - 4 + index);
          return { key: key, label: key };
        })
      };
    }
    return {
      granularity: 'daily',
      buckets: Array.from({ length: 30 }, function(_, index) {
        var key = addDays(day, index - 29);
        return { key: key, label: key.slice(5) };
      })
    };
  }
  function normalizeVisits(snapshotSource, range, serviceDate) {
    var plan = analyticsBucketPlan(range || 'daily', serviceDate);
    if (!snapshotSource || snapshotSource.status === 'unavailable') {
      return {
        status: 'unavailable',
        contractStatus: 'confirmed',
        range: range || 'daily',
        granularity: plan.granularity,
        buckets: plan.buckets.map(function(item) { return Object.assign({}, item, { visits: 0, pageViews: 0, visitorsApprox: 0, sessions: 0 }); }),
        visitCount: null,
        approximateVisitorCount: null,
        sessionCount: null,
        legacyExcluded: 'analytics/mainWeb'
      };
    }
    if (snapshotSource.status === 'error') {
      return {
        status: 'error',
        contractStatus: 'confirmed',
        range: range || 'daily',
        granularity: plan.granularity,
        buckets: [],
        visitCount: null,
        approximateVisitorCount: null,
        sessionCount: null,
        error: snapshotSource.error,
        legacyExcluded: 'analytics/mainWeb'
      };
    }
    if (snapshotSource.status === 'ready' || snapshotSource.status === 'empty') {
      var response = obj(snapshotSource.value);
      var points = Array.isArray(response.points) ? response.points : [];
      var expected = plan.buckets.length;
      if (response.range !== (range || 'daily') || points.length !== expected || hasPrivateField(response)) {
        return {
          status: 'error',
          contractStatus: 'confirmed',
          range: range || 'daily',
          granularity: plan.granularity,
          buckets: [],
          points: [],
          visitCount: null,
          approximateVisitorCount: null,
          sessionCount: null,
          error: 'invalid analytics response',
          legacyExcluded: 'analytics/mainWeb'
        };
      }
      var total = { visits: 0, estimatedVisitors: 0 };
      var valid = points.every(function(point, index) {
        if (!point || point.key !== plan.buckets[index].key) return false;
        if (!integerAtLeastZero(point.visits) || !integerAtLeastZero(point.estimatedVisitors)) return false;
        total.visits += point.visits;
        total.estimatedVisitors += point.estimatedVisitors;
        return true;
      });
      if (!valid || (response.status !== 'ready' && response.status !== 'empty')) {
        return {
          status: 'error',
          contractStatus: 'confirmed',
          range: range || 'daily',
          granularity: plan.granularity,
          buckets: [],
          points: [],
          visitCount: null,
          approximateVisitorCount: null,
          sessionCount: null,
          error: 'invalid analytics response',
          legacyExcluded: 'analytics/mainWeb'
        };
      }
      return {
        status: response.status,
        contractStatus: 'confirmed',
        range: range || 'daily',
        granularity: plan.granularity,
        buckets: points.map(function(point) {
          return { key: point.key, label: point.label, visits: point.visits, pageViews: 0, visitorsApprox: point.estimatedVisitors, sessions: 0 };
        }),
        points: points.map(function(point) {
          return { key: point.key, label: point.label, visits: point.visits, estimatedVisitors: point.estimatedVisitors };
        }),
        visitCount: total.visits,
        pageViewCount: null,
        approximateVisitorCount: total.estimatedVisitors,
        sessionCount: null,
        legacyExcluded: 'analytics/mainWeb'
      };
    }
    var data = obj(snapshotSource.value);
    var totals = { visits: 0, pageViews: 0, visitorsApprox: 0, sessions: 0 };
    var buckets = plan.buckets.map(function(bucket) {
      var row = obj(data[bucket.key]);
      var pageViews = Number(row.pageViews || 0);
      var visits = Number(row.visits != null ? row.visits : row.sessions || 0);
      var visitorsApprox = Number(row.visitorsApprox || 0);
      var sessions = Number(row.sessions || 0);
      totals.visits += visits;
      totals.pageViews += pageViews;
      totals.visitorsApprox += visitorsApprox;
      totals.sessions += sessions;
      return Object.assign({}, bucket, { visits: visits, pageViews: pageViews, visitorsApprox: visitorsApprox, sessions: sessions });
    });
    return {
      status: totals.visits || totals.visitorsApprox ? 'ready' : 'empty',
      contractStatus: 'confirmed',
      range: range || 'daily',
      granularity: plan.granularity,
      buckets: buckets,
      points: buckets.map(function(bucket) { return { key: bucket.key, label: bucket.label, visits: bucket.visits, estimatedVisitors: bucket.visitorsApprox }; }),
      visitCount: totals.visits,
      pageViewCount: totals.pageViews,
      approximateVisitorCount: totals.visitorsApprox,
      sessionCount: totals.sessions,
      legacyExcluded: 'analytics/mainWeb'
    };
  }
  function normalizeFleet(liveSource, workSource, options) {
    options = options || {};
    var nowMs = options.nowMs || Date.now();
    var gpsStaleMs = Number(options.gpsStaleMs);
    var gpsFreshness = options.gpsFreshness || {};
    var threshold = Number.isFinite(gpsStaleMs) ? gpsStaleMs : DEFAULT_GPS_STALE_MS;
    var thresholdStatus = gpsFreshness.confirmed === true ? 'confirmed' : 'proposed';
    var liveByVehicle = {}, workByVehicle = {}, ids = {};
    var operationalStatus = fleetPartStatus(workSource);
    var telemetryStatus = fleetPartStatus(liveSource);
    var operationalError = sourceError(workSource);
    var telemetryError = sourceError(liveSource);

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
      var telemetryState = telemetryStatus === 'error' || telemetryStatus === 'unavailable' ? 'missing_gps' : (!point ? 'missing_gps' : (!gpsAt || (nowMs - gpsAt) > threshold ? 'stale_gps' : 'live_gps'));
      var operationalState = operationalStatus === 'error' || operationalStatus === 'unavailable' ? 'unknown' : (workByVehicle[id] ? driverWorkOperationalState(work) : 'unknown');
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
      if (telemetryStatus !== 'error' && telemetryStatus !== 'unavailable') telemetry[vehicle.telemetryState] = (telemetry[vehicle.telemetryState] || 0) + 1;
    });
    operational.status = operationalStatus;
    operational.activeServiceCount = operationalStatus === 'error' || operationalStatus === 'unavailable' ? null : (operational.active_service || 0);
    operational.error = operationalError;
    telemetry.status = telemetryStatus;
    telemetry.vehicles = vehicles.filter(function(vehicle) { return !!vehicle.point; });
    telemetry.error = telemetryError;
    return {
      status: combinePairStatus(operationalStatus, telemetryStatus),
      contractStatus: 'proposed',
      vehicles: vehicles,
      byStatus: Object.assign({}, operational, telemetry),
      operational: operational,
      telemetry: telemetry,
      activeServiceCount: operational.activeServiceCount,
      runningCount: operational.activeServiceCount,
      error: operationalError || telemetryError || null,
      gpsFreshness: {
        status: thresholdStatus,
        thresholdMs: threshold,
        source: gpsFreshness.source || (thresholdStatus === 'confirmed' ? 'runtime contract' : 'temporary proposed default')
      }
    };
  }
  function fleetPartStatus(sourceModel) {
    if (!sourceModel || sourceModel.status === 'unavailable') return 'unavailable';
    if (sourceModel.status === 'error') return 'error';
    if (sourceModel.status === 'empty') return 'empty';
    return 'proposed';
  }
  function combinePairStatus(a, b) {
    if (a === 'error' && b === 'error') return 'error';
    if (a === 'error' || b === 'error') return 'error_partial';
    if (a === 'unavailable' && b === 'unavailable') return 'unavailable';
    if (a === 'unavailable' || b === 'unavailable') return 'unavailable_partial';
    if (a === 'empty' && b === 'empty') return 'empty';
    return 'proposed';
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
    var sources = { notificationEvents: notificationSource, erpAudit: auditSource };
    var sourceList = [notificationSource, auditSource].filter(Boolean);
    var errors = sourceList.filter(function(item) { return item.status === 'error'; }).map(function(item) { return { path: item.path, error: item.error }; });
    var items = sourceItems(notificationSource).concat(sourceItems(auditSource)).map(function(item) {
      var time = item.createdAt || item.updatedAt || item.timestamp || item.at || '';
      return {
        time: time,
        type: item.event || item.type || item.status || 'record',
        description: item.message || item.details || item.id || item.__key || 'read-only record',
        actor: item.actor || item.actorId || item.user || 'ระบบ',
        sort: stampMs(time)
      };
    }).sort(function(a, b) { return b.sort - a.sort; });
    var status = 'unavailable';
    if (errors.length && items.length) status = 'error_partial';
    else if (errors.length) status = 'error';
    else if (sourceList.every(function(item) { return item.status === 'unavailable'; })) status = 'unavailable';
    else if (sourceList.some(function(item) { return item.status === 'unavailable'; })) status = 'unavailable_partial';
    else if (items.length) status = 'proposed';
    else if (sourceList.every(function(item) { return item.status === 'empty'; })) status = 'empty';
    else if (sourceList.some(function(item) { return item.status === 'proposed'; })) status = 'proposed';
    else status = 'empty';
    return { status: status, items: items, errors: errors, sources: sources };
  }
  function connectionLabel(sourceModel) {
    if (!sourceModel || sourceModel.status === 'unavailable') return NOT_CONNECTED;
    if (sourceModel.status === 'error') return READ_FAILED;
    if (sourceModel.status === 'empty') return NO_DATA;
    if (sourceModel.status === 'proposed') return PARTIAL;
    return PARTIAL;
  }
  function healthFromSources(sources) {
    return {
      Booking: connectionLabel(sources.bookings),
      GPS: connectionLabel(sources.liveVehicles),
      Notification: connectionLabel(sources.notificationEvents),
      ERP: connectionLabel(sources.erpAudit),
      DriverApp: connectionLabel(sources.driverWork)
    };
  }
  function topLevelStatus(sources) {
    var list = keys(sources).map(function(key) { return sources[key].status; });
    if (list.every(function(status) { return status === 'unavailable'; })) return 'unavailable';
    if (list.every(function(status) { return status === 'empty'; })) return 'empty';
    if (list.some(function(status) { return status === 'error'; })) {
      return list.every(function(status) { return status === 'error' || status === 'unavailable'; }) ? 'error' : 'error_partial';
    }
    if (list.some(function(status) { return status === 'unavailable'; })) return 'unavailable_partial';
    if (list.some(function(status) { return status === 'proposed'; })) return 'proposed_partial';
    return 'empty';
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
      erpAudit: normalizeSource(raw, 'erpAudit', sourcePaths.erpAudit || 'data/erpDataCenter/meta/audit'),
      webAnalytics: normalizeSource(raw, 'webAnalytics', sourcePaths.webAnalytics || SITE_ANALYTICS_ENDPOINT)
    };
    var bookings = normalizeBookings(sources.bookings, serviceDate);
    var visits = normalizeVisits(sources.webAnalytics, options.range || 'daily', serviceDate);
    var refunds = normalizeRefunds(bookings, options.refundContract);
    var revenue = normalizeRevenue(bookings, options.paymentContract);
    var fleet = normalizeFleet(sources.liveVehicles, sources.driverWork, options);
    var activities = normalizeActivities(sources.notificationEvents, sources.erpAudit);
    var modelStatus = topLevelStatus(sources);
    return {
      status: modelStatus,
      serviceDate: serviceDate,
      sourceContracts: SOURCE_CONTRACTS,
      sources: sources,
      visits: visits,
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
        fleet: proportions({ active_service: fleet.operational.active_service || 0, inactive: fleet.operational.inactive || 0, unknown: fleet.operational.unknown || 0 }),
        gps: proportions({ live_gps: fleet.telemetry.live_gps || 0, stale_gps: fleet.telemetry.stale_gps || 0, missing_gps: fleet.telemetry.missing_gps || 0 })
      },
      legacyRejected: ['bookings', 'analytics/mainWeb']
    };
  }
  function proportions(counts) {
    var numericKeys = keys(counts).filter(function(key) { return typeof counts[key] === 'number'; });
    var total = numericKeys.reduce(function(sum, key) { return sum + Number(counts[key] || 0); }, 0);
    return numericKeys.sort().map(function(key) {
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
  function readSources(db, serviceDate, options) {
    options = options || {};
    var paths = {
      bookings: 'operations/bookings',
      liveVehicles: 'operations/liveVehicles',
      driverWork: 'operations/driverWorkByServiceDate/' + serviceDate,
      notificationEvents: 'operations/notificationEvents',
      erpAudit: 'data/erpDataCenter/meta/audit',
      webAnalytics: SITE_ANALYTICS_ENDPOINT
    };
    var analyticsPlan = analyticsBucketPlan(options && options.range || 'daily', serviceDate);
    var limits = SOURCE_CONTRACTS.recentActivity.limits;
    var output = { paths: paths, queryPlan: {
      bookings: "operations/bookings.orderByChild('date').equalTo(serviceDate)",
      notificationEvents: 'limitToLast(' + limits.notificationEvents + ')',
      erpAudit: 'limitToLast(' + limits.erpAudit + ')',
      webAnalytics: 'readSiteAnalytics HTTPS Function range=' + (options.range || 'daily'),
      driverTickets: 'not read: no documented Dashboard use'
    } };
    return Promise.all([
      safeRead(output, 'bookings', paths.bookings, function() { return db.ref(paths.bookings).orderByChild('date').equalTo(serviceDate); }),
      safeRead(output, 'liveVehicles', paths.liveVehicles, function() { return db.ref(paths.liveVehicles); }),
      safeRead(output, 'driverWork', paths.driverWork, function() { return db.ref(paths.driverWork); }),
      safeRead(output, 'notificationEvents', paths.notificationEvents, function() { return db.ref(paths.notificationEvents).limitToLast(limits.notificationEvents); }),
      safeRead(output, 'erpAudit', paths.erpAudit, function() { return db.ref(paths.erpAudit).limitToLast(limits.erpAudit); }),
      readAnalyticsSource(serviceDate, options).then(function(model) { output.sources = Object.assign(output.sources || {}, { webAnalytics: model }); })
    ]).then(function() {
      return output;
    });
  }
  function analyticsFetchUrl(serviceDate, options) {
    var range = options && options.range || 'daily';
    var anchor = serviceDate || formatYmd(new Date());
    return SITE_ANALYTICS_ENDPOINT + '?range=' + encodeURIComponent(range) + '&anchor=' + encodeURIComponent(anchor);
  }
  function readAnalyticsSource(serviceDate, options) {
    if (typeof fetch !== 'function') return Promise.resolve(source('unavailable', SITE_ANALYTICS_ENDPOINT, {}, null));
    return fetch(analyticsFetchUrl(serviceDate, options), { method: 'GET', credentials: 'omit', cache: 'no-store' }).then(function(res) {
      if (!res.ok) throw new Error('readSiteAnalytics HTTP ' + res.status);
      return res.json();
    }).then(function(payload) {
      return source(payload.status || 'empty', SITE_ANALYTICS_ENDPOINT, payload, null);
    }).catch(function(err) {
      return source('error', SITE_ANALYTICS_ENDPOINT, {}, err.message || String(err));
    });
  }
  function load(db, options) {
    options = options || {};
    if (!db) return readAnalyticsSource(options.serviceDate || '', options).then(function(analyticsSource) {
      return build({ sources: {
        bookings: source('unavailable', 'operations/bookings', {}, null),
        liveVehicles: source('unavailable', 'operations/liveVehicles', {}, null),
        driverWork: source('unavailable', 'operations/driverWorkByServiceDate/' + (options.serviceDate || ''), {}, null),
        notificationEvents: source('unavailable', 'operations/notificationEvents', {}, null),
        erpAudit: source('unavailable', 'data/erpDataCenter/meta/audit', {}, null),
        webAnalytics: analyticsSource
      } }, options);
    });
    return readSources(db, options.serviceDate || '', options).then(function(raw) {
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
      driverWorkOperationalState: driverWorkOperationalState,
      healthFromSources: healthFromSources,
      proportions: proportions,
      readSources: readSources,
      readAnalyticsSource: readAnalyticsSource,
      analyticsFetchUrl: analyticsFetchUrl,
      analyticsBucketPlan: analyticsBucketPlan
    }
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.screen01ReadModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
