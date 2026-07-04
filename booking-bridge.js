/**
 * booking-bridge.js  v2
 * ตัวกลางเชื่อม booking.html ↔ catalog-engine.js ↔ schedule-engine.js
 *
 * ห้ามคำนวณรอบรถ/เส้นทางเองเด็ดขาด — delegate ให้ engine ทุกครั้ง
 * ข้อมูล leg2 (ต่อรถ) อ่านจาก publishedCatalog routeGroups → legacy
 */
(function(global) {
  'use strict';

  /* ── สถานะภายใน ── */
  var _catalog        = null;
  var _stops          = {};
  var _fares          = {};
  var _catalogVersion = '';
  var _db             = null;
  var _ready          = false;
  var _readyCallbacks = [];

  /* ─────────────────────────────────────────
     LEG-2 DATA
     อ่านมาจาก repo booking.html เดิม (ไม่เขียนขึ้นเอง)
     buffer = นาทีที่ต้องใช้เดินทางจากต้นทางถึง แปดริ้ว ก่อนต่อรถ
  ───────────────────────────────────────── */
  var TRANSFER_POINT_KEY = 'chachoengsao';   // จุดต่อรถกลาง

  /* ตารางเวลาออกของรถ leg2 จากแปดริ้ว — ตรงกับ repo ทุกตัว */
  var LEG2_TIMES_COMMON  = ['08:00','09:00','10:00','11:00','11:30','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  var LEG2_TIMES_MOCHIT  = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  var LEG2_TIMES_EKKAMAI = ['07:30','08:30','09:30','10:30','11:30','12:30','13:30','14:30','15:30','16:30','17:30','18:30','19:30','20:30'];
  var LEG2_TIMES_MINBURI = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

  /* ─────────────────────────────────────────
     LEG2_DEST — คัดลอกจาก repo booking.html ต้นฉบับ 100% (บรรทัด 1387+)
     รวมทั้งจุดที่ไม่ต่อรถ (leg2:false, เป็นป้ายบนเส้นทางหลัก)
     และจุดที่ต้องต่อรถที่แปดริ้ว (leg2:true พร้อม buffer + times)
     ราคา (price) ต่อจุดหมาย — ตรงกับ repo เป๊ะ ไม่ใช่คำนวณจาก fare table แยก
  ───────────────────────────────────────── */
  var LEG2_DEST = {
    chachoengsao:    { label:'ฉะเชิงเทรา (แปดริ้ว)', price:55,  leg2:false },
    sanamchai:       { label:'ท่ารถสนามชัยเขต',      price:55,  leg2:false },
    phanom:          { label:'พนมสารคาม',           price:55,  leg2:false },
    nongkhok:        { label:'หนองคอก',              price:100, leg2:false },
    khlongtakien:    { label:'คลองตะเคียน',          price:120, leg2:false },
    klonghat:        { label:'คลองหาด',              price:160, leg2:false },
    tatakiab:        { label:'ท่าตะเกียบ',            price:100, leg2:false },
    siyaekkhonom:    { label:'สี่แยกโคนม',            price:150, leg2:false },

    pattaya:         { label:'พัทยา',           price:140, leg2:true, buffer:40, times:LEG2_TIMES_COMMON },
    yakaiyakan:      { label:'แยกอัยการ',       price:140, leg2:true, buffer:40, times:LEG2_TIMES_COMMON },
    sattahip:        { label:'สัตหีบ',           price:150, leg2:true, buffer:40, times:LEG2_TIMES_COMMON },
    rayong:          { label:'ระยอง',           price:150, leg2:true, buffer:45, times:LEG2_TIMES_COMMON },
    km10:            { label:'กม.10',           price:160, leg2:true, buffer:35, times:LEG2_TIMES_COMMON },
    nongmon:         { label:'ตลาดหนองมน',      price:90,  leg2:true, buffer:30, times:LEG2_TIMES_COMMON },
    bangsaen:        { label:'บางแสน',           price:90,  leg2:true, buffer:35, times:LEG2_TIMES_COMMON },
    aoudom:          { label:'อ่าวอุดม',         price:120, leg2:true, buffer:35, times:LEG2_TIMES_COMMON },
    sriracha:        { label:'ศรีราชา',          price:100, leg2:true, buffer:35, times:LEG2_TIMES_COMMON },
    kaset:           { label:'ม.เกษตร',          price:120, leg2:true, buffer:35, times:LEG2_TIMES_COMMON },
    banchan:         { label:'บ้านฉาง',          price:160, leg2:true, buffer:45, times:LEG2_TIMES_COMMON },
    laemchabang:     { label:'แหลมฉบัง',         price:120, leg2:true, buffer:35, times:LEG2_TIMES_COMMON },

    mochit:          { label:'หมอชิต',           price:120, leg2:true, buffer:35, times:LEG2_TIMES_MOCHIT },
    yaeklatphrao:    { label:'แยกลาดพร้าว',      price:120, leg2:true, buffer:35, times:LEG2_TIMES_MOCHIT },
    bts_jatujak:     { label:'BTS จตุจักร',       price:120, leg2:true, buffer:35, times:LEG2_TIMES_MOCHIT },

    ekkamai:         { label:'เอกมัย',           price:120, leg2:true, buffer:35, times:LEG2_TIMES_EKKAMAI },
    homepro:         { label:'โฮมโปร',           price:120, leg2:true, buffer:35, times:LEG2_TIMES_EKKAMAI },
    bangna:          { label:'บางนา',            price:120, leg2:true, buffer:35, times:LEG2_TIMES_EKKAMAI },
    bts_bangchak:    { label:'BTS บางจาก',       price:120, leg2:true, buffer:35, times:LEG2_TIMES_EKKAMAI },
    bts_phrakhanong: { label:'BTS พระโขนง',      price:120, leg2:true, buffer:35, times:LEG2_TIMES_EKKAMAI },
    bts_onnut:       { label:'BTS อ่อนนุช',       price:120, leg2:true, buffer:35, times:LEG2_TIMES_EKKAMAI },

    minburi:         { label:'ตลาดมีนบุรี',       price:70,  leg2:true, buffer:40, times:LEG2_TIMES_MINBURI }
  };

  /* ⚠️ [ยังไม่มีใน repo ต้นฉบับ] "รังสิต" และ "รถไฟ" ไม่มีอยู่ใน LEG2_DEST ต้นฉบับ
     ต้องยืนยันกับทีมก่อนเพิ่ม — ไม่ได้เพิ่มเองโดยไม่ได้รับการยืนยัน */

  /* buffer จากต้นทางถึงจุดต่อ (แปดริ้ว) — คัดลอกจาก TRANSFER_BUFFER_MINUTES ใน repo ต้นฉบับเป๊ะ
     ⚠️ [SCHEMA v3 PENDING] ตาม BRIEFING_FOR_BOOKING_AI.md ข้อ 5 ต้องย้ายไปอ่านจาก
     Firebase data/catalog/stops/{stopKey}/transferBufferMin แทน hardcode นี้
     คงไว้เป็น FALLBACK ชั่วคราวจนกว่า erp-core.js + erp-data-adapter.js จะพร้อม */
  var TRANSFER_BUFFER = {
    phanom:       50,
    sanamchai:    70,
    tatakiab:     115,
    nongkhok:     135,
    khlongtakien: 150,
    nongruea:     165,
    phaijit:      170,
    thoengkabintr:185,
    siyaekkhonom: 190,
    klonghat:     200
  };

  /* ──────────────────────────────────────────────────────
     [SCHEMA v3 PREP] getTransferBufferAsync(stopKey)
     โครงพร้อมเชื่อม SLTransit.db.getStop() เมื่อ erp-core.js มาถึง
     ตอนนี้: ยัง fallback ไปที่ TRANSFER_BUFFER hardcode ด้านบนเสมอ
  ────────────────────────────────────────────────────── */
  function getTransferBufferAsync(stopKey) {
    if (global.SLTransit && global.SLTransit.core && global.SLTransit.core.ready &&
        global.SLTransit.db && typeof global.SLTransit.db.getStop === 'function') {
      return global.SLTransit.db.getStop(stopKey).then(function(stop) {
        var v = stop && stop.transferBufferMin;
        return (v != null) ? Number(v) : (TRANSFER_BUFFER[stopKey] || 0);
      }).catch(function() {
        return TRANSFER_BUFFER[stopKey] || 0;
      });
    }
    return Promise.resolve(TRANSFER_BUFFER[stopKey] || 0);
  }

  /* ── helper ── */
  function _toMin(t) {
    var p = String(t||'00:00').split(':').map(Number);
    return (p[0]||0)*60 + (p[1]||0);
  }
  function _addMin(t, m) {
    var total = _toMin(t) + Number(m||0);
    var h = Math.floor(total/60)%24, mm = total%60;
    return String(h).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }
  function _todayISO() {
    var d = new Date();
    function pad(n){ return String(n).padStart(2,'0'); }
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }

  /* ── ตรวจว่าปลายทางต้องต่อรถ ── */
  function isLeg2Dest(destKey) {
    /* ก่อนอื่นตรวจ catalog routeGroups ว่าเป็น connectionType = 'leg2' / 'transfer' */
    if (_catalog && _catalog.routeGroups) {
      var rg = Object.values(_catalog.routeGroups);
      for (var i = 0; i < rg.length; i++) {
        var g = rg[i];
        if (g.connectionType === 'leg2' || g.connectionType === 'transfer') {
          var legacy = g.legacy || {};
          if (legacy.routes && legacy.routes.some(function(r){
            var se = global.SLTransitSchedule;
            return se ? se.normalizeStopKey(r.toStopKey||r.to) === se.normalizeStopKey(destKey) : r.toStopKey === destKey;
          })) return true;
        }
      }
    }
    /* fallback: ตรวจจาก LEG2_DEST table — ต้องเช็ค .leg2 === true เพราะ object
       ตอนนี้รวมทั้งจุดที่ไม่ต่อรถ (leg2:false) และต่อรถ (leg2:true) ไว้ด้วยกัน
       ตรงกับโครงสร้าง repo ต้นฉบับ ห้ามเช็คแค่ !!LEG2_DEST[destKey] เฉยๆ */
    return !!(LEG2_DEST[destKey] && LEG2_DEST[destKey].leg2 === true);
  }

  /* ── คำนวณ leg2 time สำหรับการต่อรถ ──
     logic เดิมจาก repo: buffer นาที + หา leg2 time ถัดไปที่ตรงหรือหลัง target
  */
  function getTransferInfo(originKey, destKey, leg1PickupTime) {
    var destObj = LEG2_DEST[destKey];
    if (!destObj || destObj.leg2 !== true) return null;

    /* buffer จากต้นทาง */
    var bufMin = (TRANSFER_BUFFER[originKey] != null)
      ? TRANSFER_BUFFER[originKey]
      : (destObj.buffer || 45);

    /* เวลาที่ต้องถึงแปดริ้ว */
    var earliestArrival = _addMin(leg1PickupTime, bufMin);
    var targetMin = _toMin(earliestArrival);

    /* หา leg2 time ถัดไปที่ >= target */
    var times = destObj.times || LEG2_TIMES_COMMON;
    var leg2Time = '';
    for (var i = 0; i < times.length; i++) {
      if (_toMin(times[i]) >= targetMin) { leg2Time = times[i]; break; }
    }

    return {
      point:     'ฉะเชิงเทรา (แปดริ้ว)',
      pointKey:  TRANSFER_POINT_KEY,
      destLabel: destObj.label,
      leg2Time:  leg2Time,       // เวลาออกจากแปดริ้ว
      bufMin:    bufMin,
      hasMatch:  !!leg2Time
    };
  }

  /* ── init ── */
  function init(db) {
    _db = db;
    return SLTransitCatalog.loadPublished(db).then(function(catalog) {
      if (!catalog) console.warn('[BookingBridge] publishedCatalog ว่างเปล่า — ใช้ fallback engine');
      _applyCatalog(catalog);
      if (global.SLTransitSchedule && typeof SLTransitSchedule.applyPublishedCatalog === 'function') {
        SLTransitSchedule.applyPublishedCatalog(catalog);
      }
      _ready = true;
      _readyCallbacks.forEach(function(fn){ fn(_catalog); });
      _readyCallbacks = [];
    }).catch(function(err) {
      console.error('[BookingBridge] loadPublished error:', err);
      _ready = true;
      _readyCallbacks.forEach(function(fn){ fn(null); });
      _readyCallbacks = [];
    });
  }

  function _applyCatalog(catalog) {
    _catalog = catalog || null;
    _catalogVersion = catalog && catalog.version || '';
    _fares = (catalog && catalog.fares) || {};
    _stops = {};
    if (catalog && catalog.stops) {
      Object.keys(catalog.stops).forEach(function(key) {
        var s = catalog.stops[key];
        if (s && s.bookingEnabled !== false) _stops[key] = s;
      });
    }
  }

  function onReady(fn) {
    if (_ready) { fn(_catalog); return; }
    _readyCallbacks.push(fn);
  }

  function getBookableStops() {
    return Object.keys(_stops).map(function(key) {
      return { key: key, nameTh: _stops[key].nameTh || key, order: _stops[key].order || 999 };
    }).sort(function(a,b){ return a.order - b.order; });
  }

  function getFare(routeId) {
    var f = _fares[routeId];
    return f ? Number(f.amount)||0 : 0;
  }

  function getCatalogVersion() { return _catalogVersion; }

  /* ────────────────────────────────────────────────────────
     getAvailableTrips(originKey, destKey, serviceDate)
     คืน array ของ trip + เที่ยวแรก (index 0) = "แนะนำ"
     ถ้าปลายทาง leg2 จะ embed transferInfo พร้อม leg2Time
  ──────────────────────────────────────────────────────── */
  function getAvailableTrips(originKey, destKey, serviceDate) {
    if (!global.SLTransitSchedule) return [];
    var SE = global.SLTransitSchedule;
    var normOrigin = SE.normalizeStopKey(originKey);
    var normDest   = SE.normalizeStopKey(destKey);
    var leg2 = isLeg2Dest(destKey);
    var leg1DestKey = leg2 ? TRANSFER_POINT_KEY : normDest;

    var now = new Date();
    var todayISO = _todayISO();
    var isToday = (serviceDate === todayISO);
    var currentMin = isToday ? now.getHours()*60 + now.getMinutes() : -1;

    /* ดึง trips live จาก engine ทั้ง 2 แหล่ง */
    var liveRouteTrips = typeof SE.routeDataTrips === 'function' ? SE.routeDataTrips() : [];
    var allTrips = liveRouteTrips.concat(SE.queueTrips || []);

    /* collect candidate pickup times — normalize stop keys ทุกตัว */
    var candidateTimes = {};
    allTrips.forEach(function(trip) {
      var stops = trip.routeStops || [];
      var normStops = stops.map(function(s) { return SE.normalizeStopKey(s); });
      var oIdx = normStops.indexOf(normOrigin);
      var dIdx = normStops.indexOf(leg1DestKey);
      /* fallback: ถ้าไม่ match ลอง indexOf จาก from/to */
      if (dIdx < 0) dIdx = normStops.indexOf(normDest);
      if (oIdx < 0 || dIdx < 0 || oIdx >= dIdx) {
        /* fallback: match by trip.from === normOrigin */
        var fromKey = SE.normalizeStopKey(trip.from || trip.origin || '');
        if (fromKey !== normOrigin) return;
      }
      var t = (trip.stopTimes && (trip.stopTimes[normOrigin] || trip.stopTimes[trip.from || ''])) || trip.departTime || trip.time;
      if (t) candidateTimes[t] = true;
    });

    var results = [];
    Object.keys(candidateTimes).sort().forEach(function(time) {
      var tripMin = _toMin(time);
      if (isToday && tripMin <= currentMin) return;

      /* resolveTripAssignment พร้อม fallback */
      var assignment = null;
      try {
        assignment = SE.resolveTripAssignment({
          originStopKey:      normOrigin,
          destinationStopKey: leg1DestKey,
          pickupTime:         time,
          serviceDate:        serviceDate || todayISO,
          requiresTransfer:   leg2
        });
      } catch(e) {}

      /* fallback: สร้าง assignment จาก trip โดยตรงถ้า engine คืน null */
      if (!assignment) {
        var srcTrip = null;
        for (var i = 0; i < allTrips.length; i++) {
          var t = allTrips[i];
          var fromKey = SE.normalizeStopKey(t.from || t.origin || '');
          var st = (t.stopTimes && t.stopTimes[fromKey]) || t.departTime;
          if (fromKey === normOrigin && st === time) { srcTrip = t; break; }
        }
        assignment = {
          pickupTime:       time,
          departTime:       time,
          queueNo:          srcTrip ? srcTrip.queueNo : null,
          plannedVehicleId: srcTrip ? (srcTrip.vehicleId || '') : '',
          routeStops:       srcTrip
            ? (srcTrip.routeStops || []).map(function(s){ return SE.normalizeStopKey(s); })
            : [normOrigin, leg1DestKey],
          scheduleOnly:     true
        };
      }

      var transferInfo = leg2 ? getTransferInfo(normOrigin, destKey, assignment.pickupTime) : null;
      /* ราคา: ใช้ LEG2_DEST[destKey].price ก่อน (ตรงกับ repo ต้นฉบับ)
         ถ้าไม่มีใน LEG2_DEST ค่อย fallback ไป catalog.fares */
      var destPrice = LEG2_DEST[destKey] && LEG2_DEST[destKey].price;
      var fare = (destPrice != null)
        ? Number(destPrice)
        : (_fareForTrip(assignment, normOrigin, leg2 ? leg1DestKey : normDest) || 55);

      results.push({
        pickupTime:   assignment.pickupTime,
        label:        assignment.pickupTime + ' น.',
        queueNo:      assignment.queueNo,
        vehicleId:    assignment.plannedVehicleId || '',
        routeStops:   assignment.routeStops || [],
        scheduleOnly: !!assignment.scheduleOnly,
        fare:         fare,
        isLeg2:       leg2,
        transferInfo: transferInfo,
        assignment:   assignment
      });
    });

    return results;
  }

  /* ── หาราคาจาก catalog.fares ── */
  function _fareForTrip(assignment, normOrigin, normDest) {
    if (!_catalog || !_catalog.routes || !_catalog.fares) return 0;
    var routes = _catalog.routes, fares = _catalog.fares, found = 0;
    var SE = global.SLTransitSchedule;
    Object.keys(routes).forEach(function(rid) {
      var r = routes[rid];
      var fro = SE ? SE.normalizeStopKey(r.fromStopKey||r.from) : (r.fromStopKey||r.from);
      var too = SE ? SE.normalizeStopKey(r.toStopKey  ||r.to  ) : (r.toStopKey  ||r.to  );
      if ((fro === normOrigin || too === normDest) && fares[rid] && fares[rid].amount > 0) {
        found = Number(fares[rid].amount);
      }
    });
    return found;
  }

  /* ── buildBookingSnapshot — embed catalogVersion บังคับ ── */
  function buildBookingSnapshot(params) {
    return {
      bookingCode:    params.bookingCode,
      catalogVersion: _catalogVersion,   // ← snapshot บังคับ ห้ามหลุด
      name:           params.name,
      phone:          params.phone,
      pax:            params.pax,
      originStopKey:  params.originStopKey,
      destStopKey:    params.destStopKey,
      pickupTime:     params.pickupTime,
      serviceDate:    params.serviceDate,
      isLeg2:         params.isLeg2 || false,
      transferInfo:   params.transferInfo || null,
      queueNo:        params.queueNo || '',
      vehicleId:      params.vehicleId || '',
      fare:           params.fare || 0,
      payMethod:      params.payMethod || '',
      slipUploaded:   params.slipUploaded || false,
      /* [SCHEMA v3] ใช้ BOOKING_STATUS enum ถ้ามี (จาก booking-pos.js), fallback เผื่อยังไม่โหลด */
      status:         (global.BOOKING_STATUS && global.BOOKING_STATUS.AWAITING_PAYMENT) || 'awaiting_payment',
      createdAt:      new Date().toISOString(),
      assignment:     params.assignment || null
    };
  }

  /* ── expose ── */
  global.SLBookingBridge = {
    init:                init,
    onReady:             onReady,
    getBookableStops:    getBookableStops,
    getAvailableTrips:   getAvailableTrips,
    isLeg2Dest:          isLeg2Dest,
    getTransferInfo:     getTransferInfo,
    getFare:             getFare,
    getCatalogVersion:   getCatalogVersion,
    buildBookingSnapshot:buildBookingSnapshot,
    getTransferBufferAsync: getTransferBufferAsync,  /* [SCHEMA v3 PREP] */
    /* expose _catalog สำหรับ booking-capacity.js */
    get _catalog() { return _catalog; }
  };

})(window);
