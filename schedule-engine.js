(function(global) {
  'use strict';

  // ===== ค่าคิวพื้นฐาน (fallback) — ใช้ถ้า Firebase ยังโหลดไม่เสร็จหรือขัดข้อง =====
  var BASE_DATE = '2026-06-14';
  var ROTATING_VEHICLES = ['car1', 'car2', 'car3', 'car4'];
  var BASE_CAR_QUEUE = { car1: 1, car2: 2, car3: 3, car4: 4 };
  var ROUTE_DATA_RAW = null;
  var ROUTE_DATA_TRIPS = [];
  var routeDataWatchStarted = false;

  // ===== โหลดค่าคิวจาก Firebase (settings/queueRotation) ถ้ามี — override ค่า fallback ด้านบน =====
  // เพื่อให้ admin แก้ไข base date / ลำดับคิวเริ่มต้นได้ในอนาคตโดยไม่ต้องแก้โค้ดไฟล์นี้
  function applyRotationConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.baseDate && /^\d{4}-\d{2}-\d{2}$/.test(cfg.baseDate)) {
      BASE_DATE = cfg.baseDate;
    }
    if (cfg.carQueueOnBaseDate && typeof cfg.carQueueOnBaseDate === 'object') {
      ROTATING_VEHICLES.forEach(function(carId) {
        var q = Number(cfg.carQueueOnBaseDate[carId]);
        if (q >= 1 && q <= 4) BASE_CAR_QUEUE[carId] = q;
      });
    }
  }

  function loadRotationConfigFromFirebase() {
    try {
      if (!global.firebase || !global.firebase.database) return;
      global.firebase.database().ref('settings/queueRotation').once('value')
        .then(function(snap) {
          applyRotationConfig(snap.val());
        })
        .catch(function() {
          // เงียบไว้ — ใช้ค่า fallback hardcode ต่อไปถ้าโหลดไม่ได้
        });
    } catch (e) {
      // เงียบไว้ — ใช้ค่า fallback hardcode ต่อไปถ้า firebase ยังไม่พร้อม
    }
  }

  loadRotationConfigFromFirebase();

  var STOP_ALIASES = {
    'klonghat': 'klonghat', 'khlonghat': 'klonghat', 'คลองหาด': 'klonghat',
    'wangnamyen': 'wangnamyen', 'วังน้ำเย็น': 'wangnamyen',
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

  var MAIN_STOP_KEYS = ['klonghat','wangnamyen','siyaekkhonom','thoengkabintr','phaijit','nongruea','khlongtakien','nongkhok','tatakiab','sanamchai','phanom','chachoengsao'];
  var STOP_NAMES = {
    klonghat: 'คลองหาด', wangnamyen: 'วังน้ำเย็น', siyaekkhonom: 'สี่แยกโคนม', thoengkabintr: 'ทุ่งกบินทร์', phaijit: 'ไพจิตร',
    nongruea: 'หนองเรือ', khlongtakien: 'คลองตะเคียน', nongkhok: 'หนองคอก', tatakiab: 'ท่าตะเกียบ',
    sanamchai: 'ท่ารถสนามชัยเขต', phanom: 'พนมสารคาม', chachoengsao: 'ฉะเชิงเทรา (แปดริ้ว)'
  };

  var MAIN_ROUTE_TO_CHACHOENGSAO = MAIN_STOP_KEYS.slice();
  var MAIN_ROUTE_FROM_CHACHOENGSAO = MAIN_STOP_KEYS.slice().reverse();

  var QUEUE_TRIPS = [
    {
      queueNo: 1, tripIndex: 1, serviceType: 'normal', departTime: '09:00',
      from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: ['sanamchai','phanom','chachoengsao'],
      stopTimes: { sanamchai: '09:00', phanom: '09:20' }
    },
    {
      queueNo: 1, tripIndex: 2, serviceType: 'normal', departTime: '11:20',
      from: 'chachoengsao', to: 'klonghat', direction: 'from_chachoengsao',
      routeStops: MAIN_ROUTE_FROM_CHACHOENGSAO,
      stopTimes: {
        chachoengsao: '11:20', phanom: '12:00', sanamchai: '12:20', tatakiab: '12:50',
        nongkhok: '13:05', nongruea: '13:35', khlongtakien: '13:35',
        phaijit: '13:37', thoengkabintr: '13:43', siyaekkhonom: '13:53'
      }
    },
    {
      queueNo: 2, tripIndex: 1, serviceType: 'normal', departTime: '08:00',
      from: 'klonghat', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: MAIN_ROUTE_TO_CHACHOENGSAO,
      stopTimes: {
        klonghat: '08:00', siyaekkhonom: '08:10', thoengkabintr: '08:20',
        phaijit: '08:30', nongruea: '08:40', khlongtakien: '09:20',
        nongkhok: '09:30', tatakiab: '09:45', sanamchai: '10:40', phanom: '11:40'
      }
    },
    {
      queueNo: 2, tripIndex: 2, serviceType: 'normal', departTime: '12:20',
      from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao',
      routeStops: ['chachoengsao','phanom','sanamchai'],
      stopTimes: { chachoengsao: '12:20', phanom: '13:00' }
    },
    {
      queueNo: 2, tripIndex: 3, serviceType: 'normal', departTime: '13:40',
      from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: ['sanamchai','phanom','chachoengsao'],
      stopTimes: { sanamchai: '13:40', phanom: '14:30' }
    },
    {
      queueNo: 2, tripIndex: 4, serviceType: 'normal', departTime: '15:20',
      from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao',
      routeStops: ['chachoengsao','phanom','sanamchai'],
      stopTimes: { chachoengsao: '15:20', phanom: '16:00' }
    },
    {
      queueNo: 3, tripIndex: 1, serviceType: 'normal', departTime: '06:20',
      from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: ['sanamchai','phanom','chachoengsao'],
      stopTimes: { sanamchai: '06:20', phanom: '06:40' }
    },
    {
      queueNo: 3, tripIndex: 2, serviceType: 'normal', departTime: '09:40',
      from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao',
      routeStops: ['chachoengsao','phanom','sanamchai'],
      stopTimes: { chachoengsao: '09:40' }
    },
    {
      queueNo: 3, tripIndex: 3, serviceType: 'normal', departTime: '12:10',
      from: 'sanamchai', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: ['sanamchai','phanom','chachoengsao'],
      stopTimes: { sanamchai: '12:10', phanom: '12:30', chachoengsao: '13:00' }
    },
    {
      queueNo: 3, tripIndex: 4, serviceType: 'normal', departTime: '14:00',
      from: 'chachoengsao', to: 'klonghat', direction: 'from_chachoengsao',
      routeStops: MAIN_ROUTE_FROM_CHACHOENGSAO,
      stopTimes: {
        chachoengsao: '14:00', phanom: '14:40', sanamchai: '15:00', tatakiab: '15:30',
        nongkhok: '15:45', nongruea: '16:15', khlongtakien: '16:15',
        phaijit: '16:17', thoengkabintr: '16:23', siyaekkhonom: '16:33'
      }
    },
    {
      queueNo: 4, tripIndex: 1, serviceType: 'normal', departTime: '11:30',
      from: 'klonghat', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: MAIN_ROUTE_TO_CHACHOENGSAO,
      stopTimes: {
        klonghat: '11:30', siyaekkhonom: '12:00', thoengkabintr: '12:10',
        phaijit: '12:10', nongruea: '12:20', khlongtakien: '12:40',
        nongkhok: '13:00', tatakiab: '13:15', phanom: '14:30'
      }
    },
    {
      queueNo: 4, tripIndex: 2, serviceType: 'normal', departTime: '16:20',
      from: 'chachoengsao', to: 'sanamchai', direction: 'from_chachoengsao',
      routeStops: ['chachoengsao','phanom','sanamchai'],
      stopTimes: { chachoengsao: '16:20', phanom: '17:00' }
    },
    {
      queueNo: 5, tripIndex: 1, serviceType: 'schedule-only', noLiveTracking: true, scheduleOnly: true,
      departTime: '06:20', from: 'nongkhok', to: 'chachoengsao', direction: 'to_chachoengsao',
      routeStops: ['nongkhok','tatakiab','sanamchai','phanom','chachoengsao'],
      stopTimes: { nongkhok: '06:20', tatakiab: '06:35', sanamchai: '07:20', phanom: '07:40' }
    },
    {
      queueNo: 5, tripIndex: 2, serviceType: 'schedule-only', noLiveTracking: true, scheduleOnly: true,
      departTime: '17:20', from: 'chachoengsao', to: 'nongkhok', direction: 'from_chachoengsao',
      routeStops: ['chachoengsao','phanom','sanamchai','tatakiab','nongkhok'],
      stopTimes: { chachoengsao: '17:20', phanom: '18:00', sanamchai: '18:20', tatakiab: '18:50' }
    }
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


  function eachValue(collection, callback) {
    if (!collection) return;
    if (Array.isArray(collection)) {
      for (var i = 0; i < collection.length; i++) {
        if (collection[i]) callback(String(i), collection[i]);
      }
      return;
    }
    Object.keys(collection).forEach(function(key) {
      if (collection[key]) callback(key, collection[key]);
    });
  }

  function normalizeRouteDataDirection(trip, routeStops) {
    var direction = String(trip && (trip.direction || trip.routeDirection) || '').toLowerCase();
    if (direction === 'to_chachoengsao' || direction === 'from_chachoengsao') return direction;
    var firstIdx = mainStopIndex(routeStops && routeStops[0]);
    var lastIdx = mainStopIndex(routeStops && routeStops[routeStops.length - 1]);
    if (firstIdx >= 0 && lastIdx >= 0 && firstIdx !== lastIdx) {
      return firstIdx < lastIdx ? 'to_chachoengsao' : 'from_chachoengsao';
    }
    var routeKey = String(trip && trip.routeKey || '').toLowerCase();
    if (routeKey.indexOf('_to_chachoengsao') !== -1) return 'to_chachoengsao';
    if (routeKey.indexOf('chachoengsao_to_') !== -1) return 'from_chachoengsao';
    if (direction === 'go') return 'to_chachoengsao';
    if (direction === 'back') return 'from_chachoengsao';
    return '';
  }

  function normalizeRouteDataTrip(queueKey, tripKey, rawTrip) {
    rawTrip = rawTrip || {};
    var rawStops = Array.isArray(rawTrip.stops) ? rawTrip.stops : [];
    var routeStops = [];
    var routeStopNames = [];
    var stopTimes = {};
    for (var i = 0; i < rawStops.length; i++) {
      var stop = rawStops[i] || {};
      var stopKey = normalizeStopKey(stop.stopKey || stop.key || stop.id || '');
      var time = String(stop.time || '').slice(0, 5);
      if (!stopKey) continue;
      routeStops.push(stopKey);
      routeStopNames.push(stop.stopTh || stop.stopNameTh || stop.name || STOP_NAMES[stopKey] || stopKey);
      if (time) stopTimes[stopKey] = time;
    }
    if (!routeStops.length) return null;
    var departTime = String(rawTrip.departTime || rawTrip.time || rawTrip.startTime || stopTimes[routeStops[0]] || '').slice(0, 5);
    var queueNo = Number(rawTrip.queueNo || queueKey || 0);
    var tripIndex = rawTrip.tripNo || rawTrip.tripIndex || tripKey;
    var serviceType = rawTrip.serviceType || (rawTrip.scheduleOnly || rawTrip.noLiveTracking ? 'schedule-only' : 'normal');
    return {
      queueNo: queueNo,
      tripIndex: tripIndex,
      serviceType: serviceType,
      scheduleOnly: rawTrip.scheduleOnly === true || serviceType === 'schedule-only',
      noLiveTracking: rawTrip.noLiveTracking === true || serviceType === 'schedule-only',
      departTime: departTime,
      from: routeStops[0],
      to: routeStops[routeStops.length - 1],
      direction: normalizeRouteDataDirection(rawTrip, routeStops),
      routeKey: rawTrip.routeKey || '',
      routeStops: routeStops,
      routeStopNames: routeStopNames,
      stopTimes: stopTimes,
      assignmentSource: 'firebase_routeData'
    };
  }

  function applyRouteData(routeData) {
    ROUTE_DATA_RAW = routeData || null;
    ROUTE_DATA_TRIPS = [];
    eachValue(routeData && routeData.queues, function(queueKey, queue) {
      eachValue(queue && queue.trips, function(tripKey, rawTrip) {
        var trip = normalizeRouteDataTrip(queueKey, tripKey, rawTrip);
        if (trip) ROUTE_DATA_TRIPS.push(trip);
      });
    });
    return ROUTE_DATA_TRIPS.slice();
  }

  function loadRouteDataFromFirebase() {
    try {
      if (!global.firebase || !global.firebase.database) return Promise.resolve(null);
      return global.firebase.database().ref('routeData').once('value').then(function(snap) {
        return applyRouteData(snap.val());
      }).catch(function() {
        return null;
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function watchFirebaseData(database) {
    try {
      var db = database || (global.firebase && global.firebase.database && global.firebase.database());
      if (!db || routeDataWatchStarted) return;
      routeDataWatchStarted = true;
      db.ref('settings/queueRotation').on('value', function(snap) {
        applyRotationConfig(snap.val());
      });
      db.ref('routeData').on('value', function(snap) {
        applyRouteData(snap.val());
      });
    } catch (e) {}
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
    var stops = (trip.routeStops && trip.routeStops.length ? trip.routeStops : routeStopsForTrip(trip)).map(normalizeStopKey);
    var originIdx = stops.indexOf(originKey);
    var destIdx = stops.indexOf(destKey);
    return originIdx >= 0 && destIdx >= 0 && originIdx < destIdx;
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
    var routeStopNames = data.routeStopNames && data.routeStopNames.length
      ? data.routeStopNames.slice()
      : routeStops.map(function(key) { return STOP_NAMES[key] || key; });
    var assignment = {
      serviceDate: serviceDate,
      queueNo: queueNo,
      serviceType: data.serviceType || 'normal',
      plannedVehicleId: queueNo >= 1 && queueNo <= 4 ? vehicleIdForQueueOnDate(queueNo, serviceDate) : '',
      tripIndex: data.tripIndex,
      departTime: data.departTime,
      pickupTime: data.pickupTime || (data.stopTimes && data.stopTimes[pickupStopKey]) || data.departTime,
      pickupStopKey: pickupStopKey,
      pickupStopName: data.pickupStopName || STOP_NAMES[pickupStopKey] || pickupStopKey,
      routeDirection: data.routeDirection || data.direction,
      routeStops: routeStops,
      routeStopNames: routeStopNames,
      scheduleOnly: data.scheduleOnly === true || data.serviceType === 'schedule-only',
      noLiveTracking: data.noLiveTracking === true || data.scheduleOnly === true || data.serviceType === 'schedule-only',
      assignmentSource: data.assignmentSource || 'schedule_engine'
    };
    return assignment;
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

  function buildScheduleOnlyAssignment(input, serviceDate, origin, destination, pickupTime, direction) {
    if (!input || input.scheduleOnly !== true) return null;
    var pickupStopKey = normalizeStopKey(input.pickupStopKey || input.originStopKey || origin || input.origin || '');
    var pickupStopName = input.pickupStopName || STOP_NAMES[pickupStopKey] || pickupStopKey;
    var routeStops = Array.isArray(input.routeStops) && input.routeStops.length
      ? input.routeStops.map(normalizeStopKey)
      : [pickupStopKey, normalizeStopKey(input.destinationStopKey || destination || input.destination || '')].filter(Boolean);
    var routeStopNames = Array.isArray(input.routeStopNames) && input.routeStopNames.length
      ? input.routeStopNames.slice()
      : routeStops.map(function(key) { return STOP_NAMES[key] || key; });
    return {
      serviceDate: serviceDate,
      queueNo: '',
      plannedVehicleId: '',
      tripIndex: input.tripIndex || '',
      departTime: String(input.departTime || input.time || pickupTime || '').slice(0, 5),
      pickupTime: pickupTime,
      pickupStopKey: pickupStopKey,
      pickupStopName: pickupStopName,
      routeDirection: input.routeDirection || direction || '',
      routeStops: routeStops,
      routeStopNames: routeStopNames,
      serviceType: 'schedule-only',
      scheduleOnly: true,
      noLiveTracking: true,
      assignmentSource: input.assignmentSource || 'published_schedule_only'
    };
  }

  function resolveTripAssignment(input) {
    input = input || {};
    var serviceDate = input.serviceDate || input.date || '';
    var origin = normalizeStopKey(input.originStopKey || input.origin || input.from);
    var destination = normalizeStopKey(input.destinationStopKey || input.destination || input.to);
    var transferKey = normalizeStopKey(input.transferPoint || 'chachoengsao');
    var requiresTransfer = !!input.requiresTransfer;
    var target = requiresTransfer ? transferKey : destination;
    var pickupTime = String(input.pickupTime || input.selectedTime || input.time || input.departTime || input.leg1Time || '').slice(0, 5);
    var direction = routeDirection(origin, target);
    if (!origin || !target || !pickupTime) return null;

    var override = findStopTimeOverride(origin, target, pickupTime);
    if (override) return decorateAssignment(override, serviceDate);

    if (!direction) return buildScheduleOnlyAssignment(input, serviceDate, origin, destination, pickupTime, direction);

    var tripSources = ROUTE_DATA_TRIPS.length ? [ROUTE_DATA_TRIPS, QUEUE_TRIPS] : [QUEUE_TRIPS];
    for (var s = 0; s < tripSources.length; s++) {
      var tripSource = tripSources[s];
      for (var i = 0; i < tripSource.length; i++) {
        var trip = tripSource[i];
        var originPickupTime = trip.stopTimes && trip.stopTimes[origin];
        var timeMatches = originPickupTime === pickupTime;
        if (!timeMatches || trip.direction !== direction) continue;
        if (!tripCovers(trip, origin, target)) continue;
        return decorateAssignment(Object.assign({}, trip, {
          pickupStop: origin,
          pickupTime: originPickupTime
        }), serviceDate);
      }
    }
    return buildScheduleOnlyAssignment(input, serviceDate, origin, destination, pickupTime, direction);
  }

  global.SLTransitSchedule = {
    get baseDate() { return BASE_DATE; },
    rotatingVehicles: ROTATING_VEHICLES.slice(),
    queueTrips: QUEUE_TRIPS.slice(),
    routeDataTrips: function() { return ROUTE_DATA_TRIPS.slice(); },
    routeData: function() { return ROUTE_DATA_RAW; },
    stopTimeOverrides: STOP_TIME_OVERRIDES.slice(),
    normalizeStopKey: normalizeStopKey,
    mainStopIndex: mainStopIndex,
    rotateQueueNo: rotateQueueNo,
    queueForVehicleOnDate: queueForVehicleOnDate,
    vehicleIdForQueueOnDate: vehicleIdForQueueOnDate,
    resolveTripAssignment: resolveTripAssignment,
    // ===== เพิ่มใหม่: เผื่อ admin.html อยากเช็ค/รีโหลดค่า rotation จาก Firebase เอง =====
    getBaseDate: function() { return BASE_DATE; },
    getBaseCarQueue: function() { return Object.assign({}, BASE_CAR_QUEUE); },
    reloadRotationConfig: loadRotationConfigFromFirebase,
    reloadRouteData: loadRouteDataFromFirebase,
    applyRouteData: applyRouteData,
    watchFirebaseData: watchFirebaseData
  };
})(window);

