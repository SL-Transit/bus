(function(global) {
  'use strict';

  var BASE_DATE = '2026-06-12';
  var ROTATING_VEHICLES = ['car1', 'car2', 'car3', 'car4'];
  var BASE_CAR_QUEUE = { car1: 3, car2: 1, car3: 2, car4: 4 };

  var STOP_ALIASES = {
    'klonghat': 'klonghat', 'คลองหาด': 'klonghat',
    'siyaekkhonom': 'siyaekkhonom', 'สี่แยกโคนม': 'siyaekkhonom',
    'thoengkabintr': 'thoengkabintr', 'ทุ่งกบินทร์': 'thoengkabintr',
    'phaijit': 'phaijit', 'ไพจิตร': 'phaijit',
    'nongruea': 'nongruea', 'หนองเรือ': 'nongruea',
    'khlongtakien': 'khlongtakien', 'คลองตะเคียน': 'khlongtakien',
    'nongkhok': 'nongkhok', 'หนองคอก': 'nongkhok',
    'tatakiab': 'tatakiab', 'ท่าตะเกียบ': 'tatakiab',
    'sanamchai': 'sanamchai', 'สนามชัยเขต': 'sanamchai', 'ท่ารถสนามชัยเขต': 'sanamchai',
    'phanom': 'phanom', 'พนมสารคาม': 'phanom',
    'chachoengsao': 'chachoengsao', 'แปดริ้ว': 'chachoengsao', 'ฉะเชิงเทราแปดริ้ว': 'chachoengsao', 'ฉะเชิงเทรา(แปดริ้ว)': 'chachoengsao', 'ฉะเชิงเทรา (แปดริ้ว)': 'chachoengsao'
  };

  var MAIN_STOP_KEYS = ['klonghat','siyaekkhonom','thoengkabintr','phaijit','nongruea','khlongtakien','nongkhok','tatakiab','sanamchai','phanom','chachoengsao'];
  var STOP_NAMES = {
    klonghat: 'คลองหาด', siyaekkhonom: 'สี่แยกโคนม', thoengkabintr: 'ทุ่งกบินทร์', phaijit: 'ไพจิตร',
    nongruea: 'หนองเรือ', khlongtakien: 'คลองตะเคียน', nongkhok: 'หนองคอก', tatakiab: 'ท่าตะเกียบ',
    sanamchai: 'ท่ารถสนามชัยเขต', phanom: 'พนมสารคาม', chachoengsao: 'ฉะเชิงเทรา (แปดริ้ว)'
  };

  var QUEUE_TRIPS = [
    { queueNo: 1, tripIndex: 1, departTime: '09:00', from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao' },
    { queueNo: 1, tripIndex: 2, departTime: '11:20', from: 'chachoengsao', to: 'klonghat', direction: 'from_chachoengsao' },
    { queueNo: 2, tripIndex: 1, departTime: '08:00', from: 'klonghat', to: 'chachoengsao', direction: 'to_chachoengsao' },
    { queueNo: 2, tripIndex: 2, departTime: '12:20', from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao' },
    { queueNo: 2, tripIndex: 3, departTime: '13:40', from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao' },
    { queueNo: 2, tripIndex: 4, departTime: '15:20', from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao' },
    { queueNo: 3, tripIndex: 1, departTime: '06:20', from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao' },
    { queueNo: 3, tripIndex: 2, departTime: '09:40', from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao' },
    { queueNo: 3, tripIndex: 3, departTime: '12:10', from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao', stopTimes: { sanamchai: '12:10', phanom: '12:30', chachoengsao: '13:00' } },
    { queueNo: 3, tripIndex: 4, departTime: '14:00', from: 'chachoengsao', to: 'klonghat', direction: 'from_chachoengsao' },
    { queueNo: 4, tripIndex: 1, departTime: '11:30', from: 'klonghat', to: 'chachoengsao', direction: 'to_chachoengsao' },
    { queueNo: 4, tripIndex: 2, departTime: '16:20', from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao' }
  ];

  var STOP_TIME_OVERRIDES = [
    {
      from: 'chachoengsao',
      to: 'phanom',
      bookingTimes: ['12:20', '12:30'],
      queueNo: 3,
      tripIndex: 3,
      departTime: '12:10',
      pickupTime: '12:30',
      pickupStop: 'phanom',
      direction: 'to_chachoengsao',
      routeStops: ['sanamchai', 'phanom', 'chachoengsao'],
      assignmentSource: 'schedule_engine_stop_time_override'
    }
  ];

  function cleanStop(value) {
    return String(value || '').replace(/\s+/g, '').toLowerCase();
  }

  function normalizeStopKey(value) {
    var raw = String(value || '');
    return STOP_ALIASES[raw] || STOP_ALIASES[cleanStop(raw)] || raw;
  }

  function mainStopIndex(value) {
    return MAIN_STOP_KEYS.indexOf(normalizeStopKey(value));
  }

  function daysBetween(dateText, baseText) {
    var match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var base = String(baseText || BASE_DATE).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || !base) return 0;
    var d = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    var b = Date.UTC(Number(base[1]), Number(base[2]) - 1, Number(base[3]));
    return Math.floor((d - b) / 86400000);
  }

  function rotateQueueNo(queueNo, offsetDays) {
    queueNo = Number(queueNo || 0);
    if (!queueNo) return 0;
    return ((queueNo - 1 + Number(offsetDays || 0)) % 4 + 4) % 4 + 1;
  }

  function queueForVehicleOnDate(vehicleId, serviceDate) {
    var baseQueue = BASE_CAR_QUEUE[String(vehicleId || '')];
    return rotateQueueNo(baseQueue, daysBetween(serviceDate, BASE_DATE));
  }

  function vehicleIdForQueueOnDate(queueNo, serviceDate) {
    queueNo = Number(queueNo || 0);
    for (var i = 0; i < ROTATING_VEHICLES.length; i++) {
      var vehicleId = ROTATING_VEHICLES[i];
      if (queueForVehicleOnDate(vehicleId, serviceDate) === queueNo) return vehicleId;
    }
    return '';
  }

  function routeDirection(originKey, destKey) {
    var originIdx = mainStopIndex(originKey);
    var destIdx = mainStopIndex(destKey);
    if (originIdx < 0 || destIdx < 0 || originIdx === destIdx) return '';
    return originIdx < destIdx ? 'to_chachoengsao' : 'from_chachoengsao';
  }

  function tripCovers(trip, originKey, destKey) {
    var originIdx = mainStopIndex(originKey);
    var destIdx = mainStopIndex(destKey);
    var fromIdx = mainStopIndex(trip.from);
    var toIdx = mainStopIndex(trip.to);
    if (originIdx < 0 || destIdx < 0 || fromIdx < 0 || toIdx < 0) return false;
    if (trip.direction === 'to_chachoengsao') return fromIdx <= originIdx && destIdx <= toIdx;
    return fromIdx >= originIdx && destIdx >= toIdx;
  }

  function routeStopsForTrip(trip) {
    var fromIdx = mainStopIndex(trip.from);
    var toIdx = mainStopIndex(trip.to);
    if (fromIdx < 0 || toIdx < 0) return [];
    var stops = MAIN_STOP_KEYS.slice(Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx) + 1);
    return fromIdx > toIdx ? stops.reverse() : stops;
  }

  function decorateAssignment(data, serviceDate) {
    var queueNo = Number(data.queueNo || 0);
    var pickupStopKey = normalizeStopKey(data.pickupStop || data.pickupStopKey || data.origin || data.from || '');
    var routeStops = (data.routeStops && data.routeStops.length ? data.routeStops : routeStopsForTrip(data)).map(normalizeStopKey);
    return {
      serviceDate: serviceDate,
      queueNo: queueNo,
      plannedVehicleId: vehicleIdForQueueOnDate(queueNo, serviceDate),
      tripIndex: data.tripIndex,
      departTime: data.departTime,
      pickupTime: data.pickupTime || (data.stopTimes && data.stopTimes[pickupStopKey]) || data.departTime,
      pickupStopKey: pickupStopKey,
      pickupStopName: STOP_NAMES[pickupStopKey] || pickupStopKey,
      routeDirection: data.direction,
      routeStops: routeStops,
      routeStopNames: routeStops.map(function(key) { return STOP_NAMES[key] || key; }),
      assignmentSource: data.assignmentSource || 'schedule_engine'
    };
  }

  function findStopTimeOverride(origin, target, departTime) {
    for (var i = 0; i < STOP_TIME_OVERRIDES.length; i++) {
      var item = STOP_TIME_OVERRIDES[i];
      if (normalizeStopKey(item.from) !== origin || normalizeStopKey(item.to) !== target) continue;
      if (item.bookingTimes.indexOf(departTime) === -1) continue;
      return item;
    }
    return null;
  }

  function resolveTripAssignment(input) {
    input = input || {};
    var serviceDate = input.serviceDate || input.date || '';
    var origin = normalizeStopKey(input.origin || input.from);
    var destination = normalizeStopKey(input.destination || input.to);
    var transferKey = normalizeStopKey(input.transferPoint || 'chachoengsao');
    var requiresTransfer = !!input.requiresTransfer;
    var target = requiresTransfer ? transferKey : destination;
    var departTime = String(input.departTime || input.time || input.leg1Time || '').slice(0, 5);
    var direction = routeDirection(origin, target);
    if (!origin || !target || !departTime) return null;

    var override = findStopTimeOverride(origin, target, departTime);
    if (override) return decorateAssignment(override, serviceDate);

    if (!direction) return null;

    for (var i = 0; i < QUEUE_TRIPS.length; i++) {
      var trip = QUEUE_TRIPS[i];
      var originPickupTime = trip.stopTimes && trip.stopTimes[origin];
      var timeMatches = trip.departTime === departTime || originPickupTime === departTime;
      if (!timeMatches || trip.direction !== direction) continue;
      if (!tripCovers(trip, origin, target)) continue;
      return decorateAssignment(Object.assign({}, trip, {
        pickupStop: origin,
        pickupTime: originPickupTime || trip.departTime
      }), serviceDate);
    }
    return null;
  }

  global.SLTransitSchedule = {
    baseDate: BASE_DATE,
    rotatingVehicles: ROTATING_VEHICLES.slice(),
    queueTrips: QUEUE_TRIPS.slice(),
    stopTimeOverrides: STOP_TIME_OVERRIDES.slice(),
    normalizeStopKey: normalizeStopKey,
    mainStopIndex: mainStopIndex,
    rotateQueueNo: rotateQueueNo,
    queueForVehicleOnDate: queueForVehicleOnDate,
    vehicleIdForQueueOnDate: vehicleIdForQueueOnDate,
    resolveTripAssignment: resolveTripAssignment
  };
})(window);