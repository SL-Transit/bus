/**
 * booking-capacity.js
 * ระบบตรวจสอบ capacity + closed stops สำหรับ booking-new
 * Logic ตรงกับ repo booking.html ทุกจุด
 *
 * ครอบคลุม:
 *  [1] ROUTE_CLOSED_STOPS + isClosedByAdmin()
 *  [2] ROUTE_CAPACITY + getTripBookingCapacity()
 *  [3] TRIP_BOOKED_SEATS + watchBookingAvailability() + getBookedSeatsForTrip()
 *  [4] isTripFull() + getStatusBadge()
 *  [5] reserveTripCapacity() + releaseTripCapacity()
 *  [6] buildLegRoutes() + getPlatformLabel() + legSchedule builder
 *  [7] requestRouteContinue() — validation gate ก่อนหน้า 2
 *  [8] PLATFORM6_DESTS / EKKAMAI_DESTS / MOCHIT_DESTS
 *  [9] catalog sync: อ่าน disabledTimes + closedStops + capacityByTime จาก ERP
 */
(function(global) {
  'use strict';

  /* ──────────────────────────────────────────────────────
     RUNTIME TABLES — populate จาก catalog (ERP) เท่านั้น
     ห้าม hardcode ค่าใดๆ ลงในนี้
  ────────────────────────────────────────────────────── */
  var ROUTE_CLOSED_STOPS = {};  // { originKey: { destKey: { time: ['__route__'|stopKey] } } }
  var ROUTE_CAPACITY     = {};  // { originKey: { destKey: { time: maxSeats } } }
  var TRIP_BOOKED_SEATS  = {};  // { dupKey: seatsBooked }
  var SEGMENT_PRICE      = {};  // { originKey: { destKey: price } }

  /* ── platform groups (อ่านจาก catalog.platformGroups) ── */
  var PLATFORM6_DESTS = [];
  var EKKAMAI_DESTS   = [];
  var MOCHIT_DESTS    = [];

  /* ── availability watch ── */
  var _watchedDate             = '';
  var _availabilityQuery       = null;
  var _availabilityHandler     = null;

  /* ──────────────────────────────────────────────────────
     [9] CATALOG SYNC
     อ่านข้อมูลจาก catalog ERP (ส่งมาจาก booking-bridge ผ่าน SLBookingBridge.onReady)
     — ไม่คำนวณเส้นทาง/เวลาเอง
  ────────────────────────────────────────────────────── */
  function applyCapacityCatalog(catalog) {
    if (!catalog) return;

    /* reset */
    ROUTE_CLOSED_STOPS = {};
    ROUTE_CAPACITY     = {};
    SEGMENT_PRICE      = {};
    PLATFORM6_DESTS    = [];
    EKKAMAI_DESTS      = [];
    MOCHIT_DESTS       = [];

    var SE = global.SLTransitSchedule;
    function norm(k) { return SE ? SE.normalizeStopKey(k) : String(k||'').toLowerCase().replace(/\s+/g,''); }

    /* platform groups */
    if (catalog.platformGroups) {
      Object.values(catalog.platformGroups).forEach(function(g) {
        var arr = Array.isArray(g.destinations) ? g.destinations : [];
        var pid = String(g.id || g.platformId || '').toLowerCase();
        if (pid === '6' || pid === 'platform6') arr.forEach(function(d){ PLATFORM6_DESTS.push(norm(d)); });
        else if (pid === 'ekkamai' || pid === '1e') arr.forEach(function(d){ EKKAMAI_DESTS.push(norm(d)); });
        else if (pid === 'mochit'  || pid === '1m') arr.forEach(function(d){ MOCHIT_DESTS.push(norm(d)); });
      });
    }

    /* routes → ROUTE_CLOSED_STOPS, ROUTE_CAPACITY, SEGMENT_PRICE */
    if (!catalog.routeGroups) return;
    Object.values(catalog.routeGroups).forEach(function(group) {
      if (!group.routes || group.isActive === false) return;
      group.routes.forEach(function(r) {
        if (!r.from || !r.to || r.isActive === false) return;
        var fromKey     = norm(r.fromStopKey || r.from);
        var toKey       = norm(r.toStopKey   || r.to);
        var price       = Number(r.price) || 0;
        var times       = Array.isArray(r.times) ? r.times : [];
        var disabled    = Array.isArray(r.disabledTimes) ? r.disabledTimes : [];
        var capByTime   = (r.capacityByTime && typeof r.capacityByTime === 'object') ? r.capacityByTime : {};
        var closedStops = (r.closedStops    && typeof r.closedStops    === 'object') ? r.closedStops    : {};

        /* SEGMENT_PRICE */
        if (!SEGMENT_PRICE[fromKey]) SEGMENT_PRICE[fromKey] = {};
        SEGMENT_PRICE[fromKey][toKey] = price;

        /* ROUTE_CAPACITY */
        if (!ROUTE_CAPACITY[fromKey]) ROUTE_CAPACITY[fromKey] = {};
        if (!ROUTE_CAPACITY[fromKey][toKey]) ROUTE_CAPACITY[fromKey][toKey] = {};
        times.forEach(function(time) {
          var cap = Number(capByTime[time]);
          if (Number.isInteger(cap) && cap > 0) ROUTE_CAPACITY[fromKey][toKey][time] = cap;
        });

        /* ROUTE_CLOSED_STOPS — disabledTimes (ปิดทั้งรอบ) */
        if (disabled.length) {
          if (!ROUTE_CLOSED_STOPS[fromKey]) ROUTE_CLOSED_STOPS[fromKey] = {};
          if (!ROUTE_CLOSED_STOPS[fromKey][toKey]) ROUTE_CLOSED_STOPS[fromKey][toKey] = {};
          disabled.forEach(function(t) {
            ROUTE_CLOSED_STOPS[fromKey][toKey][t] = ['__route__'];
          });
        }

        /* ROUTE_CLOSED_STOPS — closedStops (ปิดเฉพาะป้าย) */
        Object.keys(closedStops).forEach(function(timeKey) {
          var raw = closedStops[timeKey] || [];
          var stops = (Array.isArray(raw) ? raw : [raw])
            .map(function(s){ return (s === '__route__' || s === '*') ? s : norm(s); })
            .filter(Boolean);
          if (!stops.length) return;
          if (!ROUTE_CLOSED_STOPS[fromKey]) ROUTE_CLOSED_STOPS[fromKey] = {};
          if (!ROUTE_CLOSED_STOPS[fromKey][toKey]) ROUTE_CLOSED_STOPS[fromKey][toKey] = {};
          ROUTE_CLOSED_STOPS[fromKey][toKey][timeKey] = stops;
        });
      });
    });

    console.log('[Capacity] catalog applied — SEGMENT_PRICE keys:', Object.keys(SEGMENT_PRICE).length,
      '| ROUTE_CAPACITY keys:', Object.keys(ROUTE_CAPACITY).length,
      '| ROUTE_CLOSED_STOPS keys:', Object.keys(ROUTE_CLOSED_STOPS).length);
  }

  /* ──────────────────────────────────────────────────────
     [1] isClosedByAdmin
  ────────────────────────────────────────────────────── */
  function isClosedByAdmin(originKey, destKey, timeStr) {
    var routeClosed = ROUTE_CLOSED_STOPS[originKey] && ROUTE_CLOSED_STOPS[originKey][destKey];
    if (!routeClosed) return false;
    var stops = routeClosed[timeStr];
    return Array.isArray(stops) && (
      stops.indexOf(destKey)     !== -1 ||
      stops.indexOf('__route__') !== -1 ||
      stops.indexOf('*')         !== -1
    );
  }

  /* ──────────────────────────────────────────────────────
     [2] getTripBookingCapacity
  ────────────────────────────────────────────────────── */
  function getTripBookingCapacity(originKey, destKey, timeStr) {
    var v = ROUTE_CAPACITY[originKey] &&
            ROUTE_CAPACITY[originKey][destKey] &&
            ROUTE_CAPACITY[originKey][destKey][timeStr];
    var n = Number(v);
    return (Number.isInteger(n) && n > 0) ? n : 0;
  }

  /* ──────────────────────────────────────────────────────
     [3] watchBookingAvailability — realtime seat count
  ────────────────────────────────────────────────────── */
  function watchBookingAvailability(db, dateStr) {
    if (!db || !dateStr) return;
    if (_watchedDate === dateStr && _availabilityQuery) return; /* already watching */

    /* ถอด listener เก่า */
    if (_availabilityQuery && _availabilityHandler) {
      _availabilityQuery.off('value', _availabilityHandler);
    }

    _watchedDate = dateStr;
    TRIP_BOOKED_SEATS = {};
    var bookingRoot = global.TEST_MODE ? 'testBookings' : 'bookings';
    _availabilityQuery = db.ref(bookingRoot).orderByChild('date').equalTo(dateStr);

    _availabilityHandler = function(snapshot) {
      var next = {};
      snapshot.forEach(function(child) {
        var b = child.val() || {};
        if (b.status === 'cancelled' || b.cancelled === true) return;
        var key = b.dupKey || '';
        if (!key) return;
        next[key] = (Number(next[key]) || 0) + (Number(b.seats) || 1);
      });
      TRIP_BOOKED_SEATS = next;

      /* แจ้ง booking.html ให้ re-render trip list */
      if (typeof global.renderTrips === 'function') {
        global.renderTrips();
      }
    };

    _availabilityQuery.on('value', _availabilityHandler, function(err) {
      console.error('[Capacity] watchBookingAvailability failed', err);
    });
  }

  function getBookedSeatsForTrip(dupKey) {
    return Number(TRIP_BOOKED_SEATS[dupKey]) || 0;
  }

  function getTripDupKey(originKey, destKey, dateStr, timeStr) {
    return originKey + '_' + destKey + '_' + dateStr + '_' + timeStr;
  }

  /* ──────────────────────────────────────────────────────
     [4] isTripFull + getStatusBadge
  ────────────────────────────────────────────────────── */
  function isTripFull(originKey, destKey, dateStr, timeStr, requestedSeats) {
    var capacity = getTripBookingCapacity(originKey, destKey, timeStr);
    if (!capacity) return false; /* ไม่จำกัดถ้าไม่มีค่า capacity */
    var dupKey = getTripDupKey(originKey, destKey, dateStr, timeStr);
    return getBookedSeatsForTrip(dupKey) + (Number(requestedSeats) || 1) > capacity;
  }

  function getSeatsLeft(originKey, destKey, dateStr, timeStr) {
    var capacity = getTripBookingCapacity(originKey, destKey, timeStr);
    if (!capacity) return null; /* null = ไม่จำกัด */
    var dupKey = getTripDupKey(originKey, destKey, dateStr, timeStr);
    return Math.max(0, capacity - getBookedSeatsForTrip(dupKey));
  }

  function getStatusBadge(originKey, destKey, dateStr, timeStr) {
    var closed = isClosedByAdmin(originKey, destKey, timeStr);
    if (closed) return { cls: 'badge-closed', text: 'งดรับสำรองที่นั่ง' };

    var now  = new Date();
    var dep  = new Date(dateStr + 'T' + timeStr + ':00');
    var diff = (dep - now) / 60000;

    if (diff <= 0) return { cls: 'badge-closed', text: 'ผ่านไปแล้ว' };

    var cutoff = global.BOOKING_CUTOFF_MINUTES || 60;
    if (diff <= cutoff) return { cls: 'badge-closed', text: 'ปิดรับสำรองที่นั่ง' };

    if (isTripFull(originKey, destKey, dateStr, timeStr, 1)) {
      return { cls: 'badge-closed', text: 'รอบนี้เต็มแล้ว' };
    }

    if (diff <= cutoff + 60) return { cls: 'badge-soon', text: 'ใกล้หมดเวลาสำรองที่นั่ง' };
    return { cls: 'badge-open', text: 'เปิดรับสำรองที่นั่ง' };
  }

  /* ──────────────────────────────────────────────────────
     [5] reserveTripCapacity + releaseTripCapacity
     ตรงกับ repo ทุกจุด — atomic transaction
  ────────────────────────────────────────────────────── */
  function _capacityLedgerKey(dupKey) {
    return String(dupKey || '').replace(/[.#$\/\[\]]/g, '_');
  }

  function reserveTripCapacity(db, dateVal, originKey, destKey, timeStr, requestedSeats) {
    var dupKey        = getTripDupKey(originKey, destKey, dateVal, timeStr);
    var capacityLimit = getTripBookingCapacity(originKey, destKey, timeStr);

    if (!capacityLimit) {
      /* ไม่จำกัด capacity */
      return Promise.resolve({ reserved: true, path: '', limit: 0, seats: Number(requestedSeats) || 1 });
    }

    var bookingRoot = global.TEST_MODE ? 'testBookings'              : 'bookings';
    var ledgerRoot  = global.TEST_MODE ? 'testBookingCapacityUsage'  : 'bookingCapacityUsage';
    var ledgerPath  = ledgerRoot + '/' + dateVal + '/' + _capacityLedgerKey(dupKey);

    /* นับที่นั่งที่จองไว้แล้วจาก DB (กันกรณี ledger หาย) */
    return db.ref(bookingRoot).orderByChild('dupKey').equalTo(dupKey).once('value')
      .then(function(snap) {
        var existingSeats = 0;
        snap.forEach(function(child) {
          var b = child.val() || {};
          if (b.status !== 'cancelled' && b.cancelled !== true) {
            existingSeats += Number(b.seats) || 1;
          }
        });

        return db.ref(ledgerPath).transaction(function(current) {
          var used = (current === null || current === undefined)
            ? existingSeats
            : (Number(current) || 0);
          if (used + Number(requestedSeats) > capacityLimit) return; /* abort */
          return used + Number(requestedSeats);
        });
      })
      .then(function(result) {
        if (!result || !result.committed) throw new Error('CAPACITY_FULL');
        return {
          reserved: true,
          path:     ledgerPath,
          limit:    capacityLimit,
          seats:    Number(requestedSeats) || 1
        };
      });
  }

  function releaseTripCapacity(db, reservation) {
    if (!reservation || !reservation.reserved || !reservation.path) return Promise.resolve();
    return db.ref(reservation.path).transaction(function(current) {
      return Math.max(0, (Number(current) || 0) - (Number(reservation.seats) || 0));
    });
  }

  /* ──────────────────────────────────────────────────────
     [6] buildLegRoutes + getPlatformLabel + legSchedule builder
  ────────────────────────────────────────────────────── */
  function _shortName(label) {
    return String(label || '').replace(/\s*\(.*?\)\s*/g, '').trim();
  }

  function buildLegRoutes(fromName, toName, hasTransfer) {
    if (!hasTransfer) {
      return { leg1: _shortName(fromName) + ' - ' + _shortName(toName), leg2: '' };
    }
    return {
      leg1: _shortName(fromName) + ' - แปดริ้ว',
      leg2: 'แปดริ้ว - ' + _shortName(toName)
    };
  }

  function getPlatformLabel(destKey) {
    if (EKKAMAI_DESTS.indexOf(destKey) !== -1 || MOCHIT_DESTS.indexOf(destKey) !== -1) return 'ชานชาลาหมายเลข 1';
    if (PLATFORM6_DESTS.indexOf(destKey) !== -1) return 'ชานชาลาหมายเลข 6';
    return '';
  }

  /** buildLegSchedule — สร้าง legSchedule object สำหรับฝังลง booking
   *  ตรงกับ `legSchedule` ที่ repo เขียนลง Firebase
   */
  function buildLegSchedule(originKey, destKey, originName, destName, tripTime, transferInfo) {
    var hasTransfer = !!(transferInfo && transferInfo.leg2Time);
    var legs = buildLegRoutes(originName, destName, hasTransfer);
    return {
      leg1:     legs.leg1,
      leg1Time: tripTime,
      leg2:     hasTransfer ? legs.leg2 : '',
      leg2Time: hasTransfer ? (transferInfo.leg2Time || '') : '',
      platform: hasTransfer ? getPlatformLabel(destKey) : ''
    };
  }

  /* ──────────────────────────────────────────────────────
     [7] requestRouteContinue — validation gate ก่อนหน้า 2
     เรียกแทน goToPassenger เมื่อผู้ใช้กด "เลือกเที่ยวนี้"
  ────────────────────────────────────────────────────── */
  function requestRouteContinue(e, pickupTime, label, fare) {
    if (e) e.stopPropagation();

    var appState = global.state || {};
    var origin   = appState.originKey;
    var dest     = appState.destKey;
    var dateStr  = typeof global._serviceDateISO === 'function' ? global._serviceDateISO() : _todayISO();
    var pax      = appState.pax || 1;

    /* [1] ระบบเปิดอยู่ไหม */
    if (!global.BOOKING_OPEN) { alert('ขณะนี้ปิดรับสำรองที่นั่งชั่วคราว'); return; }

    /* [2] เลือกเวลาแล้วหรือยัง */
    if (!pickupTime) { alert('กรุณาเลือกเวลาออกเดินทาง'); return; }

    /* [3] admin ปิดรอบนี้ไหม */
    if (isClosedByAdmin(origin, dest, pickupTime)) {
      alert('รอบนี้งดรับสำรองที่นั่งสำหรับเส้นทางนี้'); return;
    }

    /* [4] รอบเต็มไหม */
    if (isTripFull(origin, dest, dateStr, pickupTime, pax)) {
      alert('รอบนี้เต็มแล้ว กรุณาเลือกรอบเวลาอื่น');
      if (typeof global.renderTrips === 'function') global.renderTrips();
      return;
    }

    /* [5] cutoff ไหม */
    var dep  = new Date(dateStr + 'T' + pickupTime + ':00');
    var diff = (dep - new Date()) / 60000;
    if (diff <= (global.BOOKING_CUTOFF_MINUTES || 60)) {
      alert('รอบเวลานี้ปิดรับสำรองที่นั่งแล้ว กรุณาเลือกเวลาอื่น'); return;
    }

    /* ผ่านทุกด่าน → ไปหน้า 2 */
    if (typeof global.goToPassenger === 'function') {
      global.goToPassenger({ stopPropagation: function(){} }, pickupTime, label, fare);
    }
  }

  /* ──────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────── */
  function _todayISO() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2,'0'); }
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }

  function getSegmentPrice(originKey, destKey) {
    return (SEGMENT_PRICE[originKey] && SEGMENT_PRICE[originKey][destKey]) || 0;
  }

  /* ──────────────────────────────────────────────────────
     expose
  ────────────────────────────────────────────────────── */
  global.SLBookingCapacity = {
    applyCapacityCatalog:    applyCapacityCatalog,
    watchBookingAvailability:watchBookingAvailability,
    getBookedSeatsForTrip:   getBookedSeatsForTrip,
    getSeatsLeft:            getSeatsLeft,
    getTripDupKey:           getTripDupKey,
    isTripFull:              isTripFull,
    isClosedByAdmin:         isClosedByAdmin,
    getStatusBadge:          getStatusBadge,
    getTripBookingCapacity:  getTripBookingCapacity,
    reserveTripCapacity:     reserveTripCapacity,
    releaseTripCapacity:     releaseTripCapacity,
    buildLegRoutes:          buildLegRoutes,
    buildLegSchedule:        buildLegSchedule,
    getPlatformLabel:        getPlatformLabel,
    requestRouteContinue:    requestRouteContinue,
    getSegmentPrice:         getSegmentPrice
  };

})(window);
