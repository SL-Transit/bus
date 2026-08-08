(function(root){
  'use strict';

  var SCHEMA_VERSION = 2;
  var DEFAULT_POLICY = { minTransferMinutes: 15, maxPreferredWaitMinutes: 60, idealWaitMinutes: 30, minReliabilityScore: 0 };
  var OPERATION_MODES = ['integrated', 'schedule_only'];
  var BOOKING_MODES = ['bookable', 'reference_only', 'external_redirect'];

  function num(v, fallback) { var n = Number(v); return isFinite(n) ? n : fallback; }
  function clean(v) { return String(v == null ? '' : v).trim(); }
  function timeToMinutes(v) { var m = clean(v).match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; var h = Number(m[1]), n = Number(m[2]); return h >= 0 && h < 24 && n >= 0 && n < 60 ? h * 60 + n : null; }
  function serviceDays(value) {
    if (Array.isArray(value)) return value.map(function(x) { return clean(x).toUpperCase(); }).filter(Boolean);
    return clean(value).split(/[\s,|/]+/).map(function(x) { return x.toUpperCase(); }).filter(Boolean);
  }
  function forwardDiff(from, to) { if (from === null || to === null) return null; var d = to - from; return d < 0 ? d + 1440 : d; }
  function stopOrder(stops) { return Object.keys(stops || {}).filter(function(k) { var s = stops[k] || {}; return s.bookingEnabled !== false && (s.networkRole === 'main' || s.stopType === 'main' || s.stopType === 'transfer_hub'); }).sort(function(a, b) { return num(stops[a] && stops[a].order, 999999) - num(stops[b] && stops[b].order, 999999) || a.localeCompare(b); }); }
  function groupType(g) { var t = clean(g && g.connectionType).toLowerCase(); return t === 'transfer' || t === 'branch' ? 'branch' : 'main'; }
  function hubKey(g) { return clean(g && (g.branchHubStopKey || g.transferHubStopKey)); }
  function operationMode(record) {
    record = record || {};
    var explicit = clean(record.operationMode || record.fleetMode || record.providerMode).toLowerCase();
    if (explicit === 'schedule-only' || explicit === 'schedule_only' || explicit === 'external_schedule_only') return 'schedule_only';
    if (explicit === 'integrated') return 'integrated';
    if (record.scheduleOnly === true || record.noLiveTracking === true || record.hasFleet === false) return 'schedule_only';
    return 'integrated';
  }
  function capabilities(record) {
    record = record || {};
    var mode = operationMode(record);
    return {
      operationMode: mode,
      hasFleet: mode === 'integrated' && record.hasFleet !== false,
      hasLiveLocation: mode === 'integrated' && record.hasLiveLocation !== false && record.liveTracking !== false,
      hasQueue: mode === 'integrated' && record.hasQueue !== false,
      canBook: mode === 'integrated' ? record.canBook !== false : false,
      bookingMode: clean(record.bookingMode) || (mode === 'integrated' && record.canBook !== false ? 'bookable' : 'reference_only'),
      trackingMode: mode === 'integrated' && record.hasLiveLocation !== false && record.liveTracking !== false ? 'live' : 'schedule_only'
    };
  }
  function groupPolicy(g, base) { base = Object.assign({}, DEFAULT_POLICY, base || {}); return { minTransferMinutes: num(g && g.minTransferMinutes, base.minTransferMinutes), maxPreferredWaitMinutes: num(g && (g.maxWaitMinutes || g.maxPreferredWaitMinutes), base.maxPreferredWaitMinutes), idealWaitMinutes: num(g && g.idealWaitMinutes, base.idealWaitMinutes), reliabilityScore: num(g && (g.reliability || g.reliabilityScore), 100), priority: num(g && g.recommendationPriority, 100), passengerChoiceEnabled: g && g.passengerChoiceEnabled !== false }; }
  function normalizeGroups(groups) {
    return Object.keys(groups || {}).map(function(key) {
      var g = groups[key] || {}, id = clean(g.serviceGroupId || g.operatorId || g.providerId || g.id || key), caps = capabilities(g);
      return { key: key, id: id, operatorId: clean(g.operatorId || g.providerId || id), name: clean(g.displayNameTh || g.nameTh || g.name || key), type: groupType(g), hubStopKey: hubKey(g), isActive: g.isActive !== false && g.status !== 'inactive', operationMode: caps.operationMode, capabilities: caps, policy: groupPolicy(g), routes: Array.isArray(g.routes) ? g.routes : [] };
    });
  }
  function normalizeTrip(trip, group) {
    trip = trip || {}; group = group || {};
    var caps = capabilities(Object.assign({}, group, trip)), mode = caps.operationMode;
    return Object.assign({}, trip, { operatorId: clean(trip.operatorId || trip.providerId || group.operatorId || group.id), serviceGroupId: clean(trip.serviceGroupId || trip.groupId || group.id), operationMode: mode, bookingMode: mode === 'integrated' ? (clean(trip.bookingMode || group.bookingMode) || 'bookable') : 'reference_only', trackingMode: mode === 'integrated' && caps.hasLiveLocation ? 'live' : 'schedule_only', scheduleOnly: mode === 'schedule_only', noLiveTracking: mode === 'schedule_only', vehicleId: mode === 'integrated' ? clean(trip.vehicleId) : '' });
  }
  function validateAdminData(input) {
    input = input || {}; var stops = input.stops || {}, main = stopOrder(stops), groups = normalizeGroups(input.groups || input.routes || {}), errors = [], warnings = [], seen = {};
    groups.forEach(function(g) {
      if (seen[g.id]) errors.push('group_id ซ้ำ: ' + g.id); seen[g.id] = true;
      if (OPERATION_MODES.indexOf(g.operationMode) < 0) errors.push('operationMode ของ ' + g.name + ' ไม่ถูกต้อง');
      if (g.capabilities.bookingMode !== 'bookable' && g.capabilities.canBook) warnings.push('กลุ่ม ' + g.name + ' ระบุ canBook แต่ bookingMode ไม่ใช่ bookable');
      if (g.type === 'branch') { if (!g.hubStopKey) errors.push('กลุ่ม ' + g.name + ' ยังไม่ระบุรหัสจุดต่อรถ'); else if (main.indexOf(g.hubStopKey) === -1) errors.push('จุดต่อรถ ' + g.hubStopKey + ' ของกลุ่ม ' + g.name + ' ไม่อยู่ในเส้นทางหลัก'); if (g.policy.minTransferMinutes < 0) errors.push('เวลาเปลี่ยนรถขั้นต่ำของ ' + g.name + ' ไม่ถูกต้อง'); if (g.policy.maxPreferredWaitMinutes < g.policy.minTransferMinutes) errors.push('เวลารอสูงสุดของ ' + g.name + ' ต้องไม่น้อยกว่าเวลาเปลี่ยนรถขั้นต่ำ'); }
      g.routes.forEach(function(r) { if (r.isActive === false) return; if (!clean(r.toStopKey || r.to)) warnings.push('กลุ่ม ' + g.name + ' มีเส้นทางที่ยังไม่มีปลายทาง'); if (g.operationMode === 'schedule_only' && (r.vehicleId || r.queueId)) warnings.push('กลุ่ม schedule_only ' + g.name + ' มีข้อมูลรถ/คิวในเส้นทาง'); });
    });
    return { valid: errors.length === 0, schemaVersion: SCHEMA_VERSION, mainStopKeys: main, groups: groups, errors: errors, warnings: warnings };
  }
  function isJourneyAllowed(origin, destination, mainStopKeys, destinationGroups) { var main = {}; (mainStopKeys || []).forEach(function(k) { main[k] = true; }); var a = !!main[origin], b = !!main[destination]; if (a && b) return true; if (a && !b) return !!(destinationGroups && destinationGroups[destination] && destinationGroups[destination].length); return false; }
  function riskFor(wait, policy) { if (wait === null) return { level: 'unavailable', reason: 'missing_time' }; if (wait < 0) return { level: 'unavailable', reason: 'departed' }; if (wait < policy.minTransferMinutes) return { level: 'high', reason: 'short_transfer' }; if (wait > policy.maxPreferredWaitMinutes) return { level: 'long_wait', reason: 'long_wait' }; return { level: 'low', reason: 'safe_wait' }; }
  function rankTransferOptions(options, policy) { policy = Object.assign({}, DEFAULT_POLICY, policy || {}); return (options || []).map(function(raw) { var p = Object.assign({}, policy, raw.policy || {}), arr = timeToMinutes(raw.arrivalHubTime), dep = timeToMinutes(raw.leg2DepartureTime), fin = timeToMinutes(raw.finalArrivalTime), wait = forwardDiff(arr, dep), risk = riskFor(wait, p), available = raw.active !== false && raw.reachable !== false && risk.level !== 'unavailable', tier = !available ? 9 : risk.level === 'low' ? 0 : risk.level === 'long_wait' ? 1 : 2; return Object.assign({}, raw, { transferWaitMinutes: wait, riskLevel: risk.level, riskReason: risk.reason, available: available, _tier: tier, _final: fin === null ? 999999 : fin, _idealDistance: wait === null ? 999999 : Math.abs(wait - p.idealWaitMinutes), _reliability: num(raw.reliabilityScore, p.reliabilityScore), _priority: num(raw.recommendationPriority, p.priority), _hubArrival: arr === null ? 999999 : arr }); }).sort(function(a, b) { return a._tier - b._tier || a._final - b._final || b._reliability - a._reliability || a._idealDistance - b._idealDistance || a._hubArrival - b._hubArrival || a._priority - b._priority || String(a.groupId || '').localeCompare(String(b.groupId || '')); }).map(function(x, index) { var out = Object.assign({}, x); delete out._tier; delete out._final; delete out._idealDistance; delete out._reliability; delete out._priority; delete out._hubArrival; out.recommended = index === 0 && out.available && out.riskLevel !== 'high'; return out; }); }
  function buildTransferCandidates(input) { input = input || {}; var main = input.mainStopKeys || [], origin = clean(input.originStopKey), destination = clean(input.destinationStopKey), groups = input.destinationGroups || {}; if (!isJourneyAllowed(origin, destination, main, groups)) return []; var targetGroups = groups[destination] || [], leg1 = input.leg1Options || [], leg2 = input.leg2Options || [], out = []; targetGroups.forEach(function(g) { var hub = clean(g.hubStopKey), policy = groupPolicy(g, input.policy), groupId = clean(g.groupId || g.serviceGroupId || g.id), normalizedGroup = normalizeGroups({ group: Object.assign({}, g, { id: groupId }) })[0]; leg1.filter(function(a) { return clean(a.toStopKey) === hub && a.active !== false; }).forEach(function(a) { leg2.filter(function(b) { return clean(b.groupId || b.serviceGroupId || b.operatorId) === groupId && clean(b.fromStopKey) === hub && b.active !== false; }).forEach(function(b) { var second = normalizeTrip(b, normalizedGroup), first = normalizeTrip(a, input.originGroup || {}); out.push({ groupId: groupId, groupName: g.name || g.nameTh || g.displayNameTh || '', hubStopKey: hub, leg1TripId: a.tripId || '', leg2TripId: b.tripId || '', leg1OperatorId: first.operatorId, leg2OperatorId: second.operatorId, leg1OperationMode: first.operationMode, leg2OperationMode: second.operationMode, leg1TrackingMode: first.trackingMode, leg2TrackingMode: second.trackingMode, leg2BookingMode: second.bookingMode, arrivalHubTime: a.arrivalTime || '', leg2DepartureTime: b.departureTime || '', finalArrivalTime: b.arrivalTime || '', active: true, reachable: true, reliabilityScore: b.reliabilityScore, policy: policy, passengerChoiceEnabled: policy.passengerChoiceEnabled }); }); }); }); return rankTransferOptions(out, input.policy); }
  function journeyLeg(raw, index) {
    raw = raw || {};
    var mode = operationMode(raw), caps = capabilities(raw), bookingMode = clean(raw.bookingMode) || caps.bookingMode;
    return Object.assign({}, raw, {
      legIndex: index,
      tripId: clean(raw.tripId || raw.id || raw.scheduleOfferId),
      fromStopKey: clean(raw.fromStopKey || raw.originStopKey || raw.from),
      toStopKey: clean(raw.toStopKey || raw.destinationStopKey || raw.to),
      departureTime: clean(raw.departureTime || raw.departTime || raw.time),
      arrivalTime: clean(raw.arrivalTime || raw.arriveTime || raw.toTime),
      serviceDays: serviceDays(raw.serviceDays),
      networkLegReady: !!(clean(raw.fromStopKey || raw.originStopKey || raw.from) && clean(raw.toStopKey || raw.destinationStopKey || raw.to) && clean(raw.departureTime || raw.departTime || raw.time) && clean(raw.arrivalTime || raw.arriveTime || raw.toTime)),
      operatorId: clean(raw.operatorId || raw.providerId || raw.serviceGroupId || raw.groupId),
      serviceGroupId: clean(raw.serviceGroupId || raw.groupId || raw.operatorId || raw.providerId),
      operationMode: mode,
      bookingMode: bookingMode,
      trackingMode: clean(raw.trackingMode) || caps.trackingMode,
      scheduleOnly: mode === 'schedule_only',
      noLiveTracking: mode === 'schedule_only'
    });
  }
  function serviceDayMatches(leg, serviceDate) {
    if (!serviceDate || !Array.isArray(leg.serviceDays) || !leg.serviceDays.length) return true;
    var date = new Date(serviceDate + 'T00:00:00Z'), day = date.getUTCDay(), code = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day];
    return leg.serviceDays.indexOf(code) !== -1 || leg.serviceDays.indexOf('DAILY') !== -1 || leg.serviceDays.indexOf('ทุกวัน') !== -1;
  }
  function buildReadinessReport(input) {
    input = input || {};
    var groups = input.groups || input.serviceGroups || {}, legs = Array.isArray(input.legs) ? input.legs : [], vehicles = Array.isArray(input.vehicles) ? input.vehicles : [], byGroup = {};
    Object.keys(groups).forEach(function(key) { var g = groups[key] || {}, explicitMode = clean(g.operationMode || g.fleetMode || g.providerMode); byGroup[key] = { groupId: clean(g.serviceGroupId || g.operatorId || g.providerId || g.id || key), operationMode: operationMode(g), totalLegs: 0, readyLegs: 0, missingArrival: 0, missingServiceDays: 0, vehicleCount: 0, blockers: explicitMode ? [] : ['missing_operation_mode'] }; });
    legs.forEach(function(leg) { var key = clean(leg.serviceGroupId || leg.groupId || leg.operatorId); if (!byGroup[key]) byGroup[key] = { groupId: key, operationMode: operationMode(leg), totalLegs: 0, readyLegs: 0, missingArrival: 0, missingServiceDays: 0, vehicleCount: 0, blockers: clean(leg.operationMode || leg.fleetMode || leg.providerMode) ? [] : ['missing_operation_mode'] }; var r = byGroup[key]; r.totalLegs++; if (timeToMinutes(leg.arrivalTime || leg.arriveTime || leg.toTime) !== null) r.readyLegs++; else r.missingArrival++; if (!serviceDays(leg.serviceDays).length) r.missingServiceDays++; });
    vehicles.forEach(function(vehicle) { var key = clean(vehicle.serviceGroupId || vehicle.groupId || vehicle.operatorId); if (byGroup[key]) byGroup[key].vehicleCount++; });
    Object.keys(byGroup).forEach(function(key) { var r = byGroup[key]; if (r.operationMode === 'schedule_only' && r.vehicleCount) r.blockers.push('schedule_only_has_vehicle'); if (!r.totalLegs) r.blockers.push('no_timetable'); if (r.missingArrival) r.blockers.push('missing_arrival_time'); if (r.missingServiceDays) r.blockers.push('missing_service_days'); });
    var rows = Object.keys(byGroup).map(function(key) { return byGroup[key]; });
    return { ready: rows.length > 0 && rows.every(function(r) { return !r.blockers.length; }), groupCount: rows.length, totalLegs: legs.length, readyLegs: legs.filter(function(l) { return !!clean(l.arrivalTime || l.arriveTime || l.toTime); }).length, groups: rows, blockers: rows.reduce(function(all, r) { return all.concat(r.blockers.map(function(code) { return { code: code, groupId: r.groupId }; })); }, []) };
  }
  function buildJourneys(input) {
    input = input || {};
    var origin = clean(input.originStopKey), destination = clean(input.destinationStopKey), serviceDate = clean(input.serviceDate), maxLegs = Math.max(1, Math.min(4, Number(input.maxLegs) || 3));
    var policy = Object.assign({}, DEFAULT_POLICY, input.policy || {}), groupCatalog = input.groups || input.serviceGroups || {}, legs = (input.legs || []).map(function(raw) { raw = raw || {}; var groupKey = clean(raw.serviceGroupId || raw.groupId || raw.operatorId || raw.providerId), group = groupCatalog[groupKey] || {}; return journeyLeg(Object.assign({}, group, raw)); }).filter(function(leg) { return leg.active !== false && serviceDayMatches(leg, serviceDate); });
    var out = [], seen = {};
    function add(path) {
      var last = path[path.length - 1], first = path[0], waits = [], valid = true;
      for (var i = 1; i < path.length; i++) {
        var previousArrival = timeToMinutes(path[i - 1].arrivalTime), nextDeparture = timeToMinutes(path[i].departureTime), wait = forwardDiff(previousArrival, nextDeparture);
        if (wait === null || wait < policy.minTransferMinutes) { valid = false; break; }
        waits.push(wait);
      }
      if (!valid || clean(last.toStopKey) !== destination) return;
      var key = path.map(function(leg) { return leg.tripId || leg.fromStopKey + '-' + leg.departureTime; }).join('>');
      if (seen[key]) return; seen[key] = true;
      var departure = timeToMinutes(first.departureTime), arrival = timeToMinutes(last.arrivalTime), bookingReady = path.every(function(leg) { return leg.bookingMode === 'bookable'; });
      out.push({
        journeyId: 'journey:' + key,
        originStopKey: origin,
        destinationStopKey: destination,
        serviceDate: serviceDate,
        connectionStatus: path.length === 1 ? 'direct' : 'connected',
        transferCount: Math.max(0, path.length - 1),
        transferWaitMinutes: waits,
        totalDurationMinutes: departure === null || arrival === null ? null : forwardDiff(departure, arrival),
        bookingMode: bookingReady ? 'bookable' : 'reference_only',
        referenceOnly: !bookingReady,
        trackingMode: path.every(function(leg) { return leg.trackingMode === 'live'; }) ? 'live' : 'schedule_only',
        legs: path.slice()
      });
    }
    function walk(path) {
      var current = path[path.length - 1];
      if (clean(current.toStopKey) === destination) { add(path); return; }
      if (path.length >= maxLegs) return;
      legs.forEach(function(next) {
        if (path.some(function(existing) { return existing.tripId && existing.tripId === next.tripId; })) return;
        if (clean(next.fromStopKey) !== clean(current.toStopKey)) return;
        var arrival = timeToMinutes(current.arrivalTime), departure = timeToMinutes(next.departureTime);
        if (arrival === null || departure === null || forwardDiff(arrival, departure) < policy.minTransferMinutes) return;
        walk(path.concat([next]));
      });
    }
    legs.filter(function(leg) { return leg.fromStopKey === origin; }).forEach(function(leg) { walk([leg]); });
    out.sort(function(a, b) { return a.legs.length - b.legs.length || (a.totalDurationMinutes === null ? 999999 : a.totalDurationMinutes) - (b.totalDurationMinutes === null ? 999999 : b.totalDurationMinutes) || a.transferWaitMinutes.reduce(function(x, y) { return x + y; }, 0) - b.transferWaitMinutes.reduce(function(x, y) { return x + y; }, 0); });
    out.forEach(function(journey, index) { journey.recommended = index === 0; });
    return out;
  }
  var api = { schemaVersion: SCHEMA_VERSION, defaultPolicy: Object.assign({}, DEFAULT_POLICY), operationModes: OPERATION_MODES.slice(), bookingModes: BOOKING_MODES.slice(), stopOrder: stopOrder, capabilities: capabilities, normalizeGroups: normalizeGroups, normalizeTrip: normalizeTrip, validateAdminData: validateAdminData, isJourneyAllowed: isJourneyAllowed, rankTransferOptions: rankTransferOptions, buildTransferCandidates: buildTransferCandidates, buildJourneys: buildJourneys, buildReadinessReport: buildReadinessReport, timeToMinutes: timeToMinutes };
  root.SLTransitNetwork = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
