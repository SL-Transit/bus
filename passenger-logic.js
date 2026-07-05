/**
 * passenger-logic.js
 * Logic layer for passenger.html — Schema v3 / sl-transit-9464e
 *
 * passenger.html should contain UX/UI only. All data access, Firebase paths,
 * and the map engine live here.
 *
 * Covers (per PASSENGER_AI_BRIEFING.md):
 *   [1] Firebase project (sl-transit-9464e) bootstrap via erp-core / erp-data-adapter
 *   [2] New Firebase paths (data/settings, data/catalog, operations/liveVehicles)
 *   [3] Longdo Map -> Leaflet, exposed as a Longdo-API-compatible shim (window.longdo)
 *       so the existing marker/animation/Kalman-filter code in passenger.html
 *       (which must not be rewritten) keeps working unchanged against Leaflet.
 *   [4] Stops read from Firebase catalog (data/catalog/stops, sorted by .order)
 *       — no hardcoded stop coordinates.
 *   [5] operations/liveVehicles shape, normalized to what passenger.html expects.
 *   [6] Transfer options badge builder.
 *
 * NOTE: route/trip/fare schedule catalog (data/catalog/routes, /trips, /fares)
 * is not yet queryable in bulk from erp-data-adapter.js (only single-record
 * getRoute()/getTrip() lookups exist there today — see admin-erp.html's
 * fetchRoutesFromCache(), which is still a stub). Until that lands, the
 * schedule/fare dropdown logic in passenger.html keeps reading its existing
 * Firebase-driven override (applyPassengerRouteSettings/applyPassengerRouteData)
 * — that part is a follow-up once the ERP team ships list-style catalog reads.
 */
(function (global) {
  'use strict';

  /* ────────────────────────────────────────────────────────────
     [1] FIREBASE CONFIG — sl-transit-9464e
     apiKey / appId / messagingSenderId are not committed to the repo yet
     (same as admin-erp.html's FIREBASE_CONFIG_NEW) — fill in from the
     Firebase console before deploying.
  ──────────────────────────────────────────────────────────── */
  var FIREBASE_CONFIG = {
    apiKey: 'TODO_FROM_FIREBASE_CONSOLE',
    authDomain: 'sl-transit-9464e.firebaseapp.com',
    databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'sl-transit-9464e',
    storageBucket: 'sl-transit-9464e.firebasestorage.app',
    messagingSenderId: 'TODO_FROM_FIREBASE_CONSOLE',
    appId: 'TODO_FROM_FIREBASE_CONSOLE'
  };

  var _app = null;
  var _db = null;
  var _readyPromise = null;

  function init() {
    if (_readyPromise) return _readyPromise;
    try {
      _app = global.firebase.initializeApp(FIREBASE_CONFIG);
    } catch (e) {
      // already initialized (hot reload / duplicate call) — reuse it
      _app = global.firebase.app();
    }
    _db = _app.database();

    if (!global.SLTransit || !global.SLTransit.db || typeof global.SLTransit.db.init !== 'function') {
      return Promise.reject(new Error('erp-data-adapter.js not loaded'));
    }
    _readyPromise = global.SLTransit.core.init(_app).then(function () {
      return { app: _app, db: _db };
    });
    return _readyPromise;
  }

  function getApp() { return _app; }
  function getDb() { return _db; }

  /* ────────────────────────────────────────────────────────────
     [4] CATALOG STOPS — replaces hardcoded STOPS_GO / STOPS_BACK
     Reads data/catalog/stops via erp-data-adapter (already sorted by .order).
  ──────────────────────────────────────────────────────────── */
  function getStopsSorted() {
    if (!global.SLTransit || !global.SLTransit.db) return Promise.resolve([]);
    return global.SLTransit.db.getStops().then(function (stops) {
      return (stops || []).map(function (s) {
        return {
          key: s.stopKey || s.key || s.id || '',
          name: s.nameTh || s.stopNameTh || s.name || s.stopKey || '',
          nameEn: s.nameEn || '',
          lat: Number(s.lat),
          lng: Number(s.lng),
          icon: s.icon || '🚏',
          order: Number(s.order) || 0,
          stopType: s.stopType || 'main',
          bookingEnabled: s.bookable !== false && s.bookingEnabled !== false,
          transferOptions: s.transferOptions || null,
          crossPoints: s.crossPoints || null,
          note: s.notes || s.note || ''
        };
      }).filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); });
    });
  }

  /* ────────────────────────────────────────────────────────────
     [5] LIVE VEHICLES — operations/liveVehicles
     New shape: { lat, lng, speed(km/h), heading, updatedAt, vehicleId,
                  queueId, currentTripId, serviceStatus }
     Normalized so passenger.html's existing mergeVehicleFeeds()/
     sanitizeVehicleData() (which already knows lat/lon/lng, speed,
     heading, gpsTs/updatedAt, online) needs no changes.
  ──────────────────────────────────────────────────────────── */
  function watchLiveVehicles(callback) {
    var db = getDb();
    if (!db || typeof callback !== 'function') return function () {};
    var ref = db.ref('operations/liveVehicles');
    var handler = function (snap) {
      var raw = snap.val() || {};
      var normalized = {};
      Object.keys(raw).forEach(function (key) {
        var v = raw[key] || {};
        normalized[key] = {
          carId: v.vehicleId || key,
          lat: v.lat,
          lon: v.lng != null ? v.lng : v.lon,
          speed: v.speed,
          heading: v.heading,
          updatedAt: v.updatedAt,
          gpsTs: v.updatedAt,
          queueId: v.queueId || '',
          currentTripId: v.currentTripId || '',
          online: v.serviceStatus !== 'off_duty',
          status: v.serviceStatus === 'off_duty' ? 'standby' : 'moving'
        };
      });
      callback(normalized);
    };
    ref.on('value', handler, function (err) {
      console.error('watchLiveVehicles failed:', err && err.message ? err.message : err);
    });
    return function unsubscribe() { ref.off('value', handler); };
  }

  /* ────────────────────────────────────────────────────────────
     SETTINGS — data/settings
  ──────────────────────────────────────────────────────────── */
  function watchSettings(callback) {
    var db = getDb();
    if (!db || typeof callback !== 'function') return function () {};
    var ref = db.ref('data/settings');
    ref.on('value', callback, function (err) {
      console.error('watchSettings failed:', err && err.message ? err.message : err);
    });
    return function unsubscribe() { ref.off('value', callback); };
  }

  /* ────────────────────────────────────────────────────────────
     [6] TRANSFER OPTIONS BADGE
  ──────────────────────────────────────────────────────────── */
  function escHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function buildTransferBadges(stop) {
    if (!stop || !stop.transferOptions) return '';
    var active = [], coming = [];
    Object.values(stop.transferOptions).forEach(function (opt) {
      if (!opt || !opt.nameTh) return;
      if (opt.status === 'active') active.push(escHtml(opt.nameTh));
      else if (opt.status === 'coming_soon') coming.push(escHtml(opt.nameTh));
    });
    var html = '';
    if (active.length) html += '<span class="badge-active">🛵 ' + active.join(', ') + '</span>';
    if (coming.length) html += '<span class="badge-soon">⏳ เร็วๆนี้: ' + coming.join(', ') + '</span>';
    return html;
  }

  /* ────────────────────────────────────────────────────────────
     [3] LONGDO-COMPATIBLE MAP SHIM, BACKED BY LEAFLET
     Implements only the subset of the Longdo Maps API actually used in
     passenger.html: Map / Marker / Polyline / OverlayWeight / EventName.
     Internal point convention kept as {lat, lon} to match the rest of
     passenger.html's vehicle-tracking math (Kalman filter, bearing,
     dead-reckoning prediction, OSRM snap) untouched.
  ──────────────────────────────────────────────────────────── */
  function toLatLng(p) {
    if (!p) return null;
    var lat = Number(p.lat);
    var lon = Number(p.lon != null ? p.lon : p.lng);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return [lat, lon];
  }

  function noop() {}

  function ShimMap(options) {
    options = options || {};
    var placeholder = options.placeholder;
    var startLoc = options.location || { lon: 101.245, lat: 13.710 };
    var self = this;

    this._leaflet = global.L.map(placeholder, {
      center: [startLoc.lat, startLoc.lon],
      zoom: options.zoom || 10,
      zoomControl: true,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      tap: true
    });

    global.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this._leaflet);

    // Longdo fires 'ready'; Leaflet tiles are ready essentially on next tick.
    setTimeout(function () {
      self._leaflet.fire('ready');
      self._leaflet.fire('idle');
    }, 50);

    // stub UI panels — Leaflet controls are simply not added by default
    var hiddenPanel = { visible: noop };
    this.Ui = {
      DPad: hiddenPanel, Zoombar: hiddenPanel, Toolbar: hiddenPanel,
      LayerSelector: hiddenPanel, Fullscreen: hiddenPanel, Scale: hiddenPanel,
      Crosshair: hiddenPanel, Geolocation: hiddenPanel
    };

    var EVENT_MAP = { ready: 'ready', idle: 'idle', drag: 'drag', wheel: 'zoom', zoom: 'zoomend' };
    this.Event = {
      bind: function (name, cb) {
        var evt = EVENT_MAP[name] || name;
        self._leaflet.on(evt, cb);
      }
    };

    this.Overlays = {
      add: function (overlay) { if (overlay && overlay._layer) overlay._layer.addTo(self._leaflet); },
      remove: function (overlay) { if (overlay && overlay._layer) self._leaflet.removeLayer(overlay._layer); }
    };
  }

  ShimMap.prototype.location = function (point, animate) {
    var ll = toLatLng(point);
    if (!ll) return;
    if (animate) this._leaflet.flyTo(ll, this._leaflet.getZoom(), { duration: 0.8 });
    else this._leaflet.panTo(ll, { animate: false });
  };

  ShimMap.prototype.zoom = function (level, animate) {
    if (!level) return;
    this._leaflet.setZoom(level, { animate: !!animate });
  };

  ShimMap.prototype.resize = function () { this._leaflet.invalidateSize(); };
  ShimMap.prototype.repaint = function () { this._leaflet.invalidateSize(); };

  function ShimMarker(point, options) {
    options = options || {};
    var ll = toLatLng(point) || [0, 0];
    var icon = options.icon || {};
    var offset = icon.offset || { x: 0, y: 0 };

    var divIcon = global.L.divIcon({
      className: '',
      html: icon.html || '',
      iconSize: null,
      iconAnchor: [offset.x, offset.y]
    });

    this._layer = global.L.marker(ll, { icon: divIcon, title: options.title || '' });
  }

  ShimMarker.prototype.move = function (point) {
    var ll = toLatLng(point);
    if (!ll) return false;
    this._layer.setLatLng(ll);
    return true;
  };
  ShimMarker.prototype.location = function (point) { return this.move(point); };

  function ShimPolyline(points, options) {
    options = options || {};
    var latlngs = (points || []).map(toLatLng).filter(Boolean);
    this._layer = global.L.polyline(latlngs, {
      color: options.lineColor || '#1e40af',
      weight: options.lineWidth || 5,
      opacity: options.lineOpacity != null ? options.lineOpacity : 0.82
    });
  }

  function installLongdoShim() {
    if (global.longdo) return; // real Longdo SDK present — do not override
    global.longdo = {
      Map: ShimMap,
      Marker: ShimMarker,
      Polyline: ShimPolyline,
      OverlayWeight: { Top: 1 },
      EventName: { Drag: 'drag', Wheel: 'wheel', Zoom: 'zoom' }
    };
  }


  /* ════════════════════════════════════════════════════════════
     ENGINE MODULE (moved wholesale from passenger.html so the page
     itself only contains UX/UI). Behavior is unchanged from the
     original inline code — only call-sites that used to reach directly
     into UI render functions now emit events instead (see emit() calls
     below), so future UI/UX changes never require touching this file.
  ──────────────────────────────────────────────────────────── */

  // ---- mini event bus ----
  var _listeners = {};
  function on(name, cb) { (_listeners[name] = _listeners[name] || []).push(cb); return function(){ off(name, cb); }; }
  function off(name, cb) { if (_listeners[name]) _listeners[name] = _listeners[name].filter(function(f){ return f !== cb; }); }
  function emit(name, payload) { (_listeners[name] || []).forEach(function(cb){ try { cb(payload); } catch(e) { console.error('[SLPassengerLogic] listener error for', name, e); } }); }

  // ---- shared state (single source of truth — no hardcoded seed data) ----
  var selOrigin = '';
  var selDest   = '';
  var lastPos = null;
  var allBusPositions = {};
  var rawBusPositions = {};
  var liveVehiclePositions = {};
  var BUS_ICON_SRC = 'assets/passenger-bus-icon.png';
  var viewDir = 'go';
  var mapObj = null, busMarkers = {}, busTagMarkers = {}, routeLine = null, mapReady = false;
  var stationMarkerOverlays = [];
  var knownRouteLinePoints = [];
  var routeRenderSeq = 0;
  var mapInitPromise = null;
  var userMarker = null, passengerWatchId = null, passengerPos = null, passengerCentered = false;
  var followUser = true;
  var busFollowMode = true, busCentered = false;
  var programmaticMapMoveUntil = 0;
  var STOPS_GO = [];
  var STOPS_BACK = [];

  // Schedule/fare data — starts empty; populated only from Firebase (no hardcode)
  var ROUTES = {};
  var CONFIRMED_TO_CHACHOENGSAO_TIMES = {};
  var CONFIRMED_PAIR_TIMES = {};
  var LEG2_DESTINATIONS = {};
  var DEST_LEG2 = [];
  var ADMIN_ROUTE_TIMES = {};
  var ADMIN_ROUTE_DISABLED_TIMES = {};
  var PASSENGER_ROUTE_DATA = null;
  var ADMIN_ROUTE_SOURCE_LOADED = false;
  var ORIGIN_LIST = [];
  var DEST_NORMAL = [];
  var PASSENGER_CATALOG_ROUTES_APPLIED = false;
  var PASSENGER_CATALOG_ROUTE_DATA_APPLIED = false;
  var PASSENGER_CATALOG_VERSION_APPLIED = '';
  var PASSENGER_CATALOG_RAW = null;

function toMin(hhmm){const[h,m]=hhmm.split(':').map(Number);return h*60+m;}
function nowMin(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function curStops(){return viewDir==='go'?STOPS_GO:STOPS_BACK;}

function normalizeMapPoint(point) {
  if (!point) return null;
  var lat = Number(point.lat ?? point.latitude);
  var lon = Number(point.lon ?? point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lon: lon, lat: lat };
}

function vehicleStatusMessage(pos) {
  var status = pos && pos.status ? String(pos.status) : '';
  if (pos && pos.online === false) return 'รถโดยสารออฟไลน์ชั่วคราว ระบบจะอัปเดตเมื่อกลับมาออนไลน์';
  if (status === 'locating') return 'ระบบกำลังค้นหาสัญญาณ GPS ของรถโดยสาร';
  if (status === 'low_accuracy') return 'ระบบกำลังรอสัญญาณ GPS ที่แม่นยำขึ้นก่อนแสดงตำแหน่งรถ';
  if (status === 'gps_error') return 'ระบบ GPS ของรถโดยสารขัดข้องชั่วคราว กรุณารอสักครู่';
  if (status === 'moving') return 'ตำแหน่งรถโดยสารอัปเดตแบบเรียลไทม์';
  return '';
}

function getVehicleTs(pos) {
  if (!pos) return null;
  // gpsTs = เวลา GPS fix จริงจากอุปกรณ์ — ใช้ก่อนเสมอ
  // sentTs/ts = เวลาที่แอปส่ง อาจเป็น heartbeat โดย GPS ไม่สด
  var raw = pos.gpsTs || pos.gpsts || pos.ts || pos.lastUpdated || pos.updatedAt || pos.timestamp || null;
  if (raw === null || raw === undefined) return null;
  var n = Number(raw);
  if (isNaN(n)) return null;
  if (n < 10000000000) n = n * 1000;
  return n;
}

function getVehicleAgeSec(pos) {
  var ts = getVehicleTs(pos);
  return ts ? (Date.now() - ts) / 1000 : 0;
}

function isVehicleOfflineOrDelayed(pos) {
  if (!pos) return true;
  return pos.online === false || getVehicleAgeSec(pos) > 15;
}

function sanitizeVehicleData(pos) {
  if (!pos) return {};
  var ts = getVehicleTs(pos) || Date.now();
  return Object.assign({}, pos, {
    ts: ts,
    online:   pos.online   !== undefined && pos.online   !== null ? Boolean(pos.online)  : true,
    accuracy: pos.accuracy !== undefined && pos.accuracy !== null ? Number(pos.accuracy) :
              pos.acc      !== undefined && pos.acc      !== null ? Number(pos.acc)      : 10,
    stopIdx:  pos.stopIdx  !== undefined && pos.stopIdx  !== null ? Number(pos.stopIdx)  : 0,
  });
}

function mergeVehicleFeeds() {
  // รวม key จากทั้ง 2 path
  var allIds = {};
  Object.keys(rawBusPositions || {}).forEach(function(id){ allIds[id] = true; });
  Object.keys(liveVehiclePositions || {}).forEach(function(id){ allIds[id] = true; });

  var merged = {};
  Object.keys(allIds).forEach(function(id) {
    var a = (rawBusPositions || {})[id] || null;
    var b = (liveVehiclePositions || {})[id] || null;
    if (!a && !b) return;
    if (!a) { merged[id] = sanitizeVehicleData(b); return; }
    if (!b) { merged[id] = sanitizeVehicleData(a); return; }
    // เลือก source จาก timestamp ที่ normalize แล้ว ป้องกัน ts ms/sec หรือ heartbeat ใหม่ทับ GPS เก่าแบบผิด source
    var gpsA = getVehicleTs(a) || 0;
    var gpsB = getVehicleTs(b) || 0;
    merged[id] = sanitizeVehicleData(gpsB > gpsA ? b : a);
  });
  allBusPositions = merged;
  lastPos = choosePrimaryBus(allBusPositions);
  if (mapReady && Object.keys(allBusPositions).length) {
    updateAllBusesOnMap(allBusPositions);
  }
  emit('vehiclesUpdated', { all: allBusPositions, primary: lastPos });
}

function focusMap(point, zoomLevel, animate, lockInteraction) {
  if (!mapObj || !point) return;
  try {
    var shouldAnimate = animate === true;
    if (lockInteraction) programmaticMapMoveUntil = Date.now() + 900;
    mapObj.location(point, shouldAnimate);
    if (zoomLevel) setTimeout(function(){ mapObj.zoom(zoomLevel, shouldAnimate); }, 80);
  } catch(e) { console.warn('Longdo focus failed:', e); }
}

function pauseFollowForManualMapUse(reason) {
  if (Date.now() < programmaticMapMoveUntil) return;
  if (!followUser) return;
  followUser = false;
  console.log('followUser paused by map interaction', reason || '');
  emit('followChanged', followUser);
}

function getStopByName(name) {
  return STOPS_GO.concat(STOPS_BACK).find(function(s){ return s.name === name; }) || null;
}

function focusSelectedOrigin() {
  var stop = getStopByName(selOrigin);
  if (stop) focusMap(normalizeMapPoint(stop), 14);
}

function fitSelectedRouteOnMap() {
  if (!mapReady || !mapObj) return;
  var originStop = getStopByName(selOrigin);
  var destStop = getStopByName(selDest);
  var points = [originStop, destStop].map(normalizeMapPoint).filter(Boolean);
  if (points.length >= 2) {
    var center = { lon: (points[0].lon + points[1].lon) / 2, lat: (points[0].lat + points[1].lat) / 2 };
    var distance = distanceMeters(points[0].lat, points[0].lon, points[1].lat, points[1].lon);
    var zoom = distance > 90000 ? 9 : distance > 45000 ? 10 : distance > 18000 ? 11 : 13;
    focusMap(center, zoom);
  } else if (points.length === 1) focusMap(points[0], 14);
}

function requestPassengerCurrentLocation(forceCenter, showBusy) {
  if (!navigator.geolocation) {
    console.warn('Passenger geolocation is not supported.');
    return Promise.resolve(null);
  }

  return new Promise(function(resolve) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      var current = normalizeMapPoint({
        lon: pos.coords.longitude,
        lat: pos.coords.latitude
      });
      console.log('GPS received', current);
      passengerPos = current;
      updatePassengerOnMap(current, forceCenter);
      resolve(current);
    }, function(err) {
      console.log('GPS error', err && err.message ? err.message : err);
      console.warn('Passenger current location error:', err && err.message ? err.message : err);
      resolve(null);
    }, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  });
}

function isLeg2Dest(dest){ return !!LEG2_DESTINATIONS[dest]; }

function cleanRouteLabel(label) {
  return String(label || '').replace(/\s+/g, '').toLowerCase();
}

function normalizeRouteAlias(label) {
  const clean = cleanRouteLabel(label);
  if (!clean) return '';
  if (clean.indexOf('ขนส่งฉะเชิงเทรา') >= 0 || clean.indexOf('ฉะเชิงเทรา') >= 0 || clean.indexOf('แปดริ้ว') >= 0) return 'ฉะเชิงเทรา (แปดริ้ว)';
  if (clean.indexOf('สนามชัย') >= 0) return 'ท่ารถสนามชัยเขต';
  if (clean.indexOf('ไพจิต') >= 0 || clean.indexOf('ไพรจิต') >= 0) return 'ไพรจิต';
  if (clean.indexOf('btsบางฉาง') >= 0 || clean.indexOf('บางฉาง') >= 0) return 'BTS บางจาก';
  return '';
}

function findKnownRouteLabel(label, collections) {
  const alias = normalizeRouteAlias(label);
  if (alias) return alias;
  const clean = cleanRouteLabel(label);
  if (!clean) return '';
  for (const collection of collections) {
    const match = Object.keys(collection).find(function(key) {
      const keyClean = cleanRouteLabel(key);
      return keyClean === clean || keyClean.indexOf(clean) >= 0 || clean.indexOf(keyClean) >= 0;
    });
    if (match) return match;
  }
  return String(label || '').trim();
}

function passengerStopSortValue(label, fallback) {
  if (window.SLTransitERP && typeof window.SLTransitERP.stopOrderValue === 'function') {
    return window.SLTransitERP.stopOrderValue(label, fallback == null ? 999999 : fallback);
  }
  if (window.SLTransitCatalog && typeof window.SLTransitCatalog.stopOrderValue === 'function') {
    return window.SLTransitCatalog.stopOrderValue(label, fallback == null ? 999999 : fallback);
  }
  return fallback == null ? 999999 : Number(fallback);
}

function sortStopLabels(list) {
  list.sort(function(a, b) {
    return passengerStopSortValue(a, 999999) - passengerStopSortValue(b, 999999)
      || String(a || '').localeCompare(String(b || ''));
  });
}

function addUnique(list, value) {
  if (value && list.indexOf(value) === -1) list.push(value);
}

function isMainRouteLabel(label) {
  return ORIGIN_LIST.indexOf(label) !== -1 || DEST_NORMAL.indexOf(label) !== -1;
}

function getPassengerErpTimes(from, to, includeDisabled) {
  if (!PASSENGER_CATALOG_RAW || !window.SLTransitERP || typeof window.SLTransitERP.routeTimes !== 'function') return null;
  var times = window.SLTransitERP.routeTimes(PASSENGER_CATALOG_RAW, from, to, includeDisabled === true);
  return Array.isArray(times) && times.length ? times.slice() : null;
}

function getPassengerErpDisabledTimes(from, to) {
  if (!PASSENGER_CATALOG_RAW || !window.SLTransitERP || typeof window.SLTransitERP.routeDisabledTimes !== 'function') return null;
  var times = window.SLTransitERP.routeDisabledTimes(PASSENGER_CATALOG_RAW, from, to);
  return Array.isArray(times) ? times.slice() : null;
}

function getPairTimes(from, to) {
  var erpTimes = getPassengerErpTimes(from, to, true);
  if (erpTimes) return erpTimes;
  if (ADMIN_ROUTE_TIMES[from] && ADMIN_ROUTE_TIMES[from][to]) return ADMIN_ROUTE_TIMES[from][to].slice();
  return null;
}

function isPassengerTimeDisabled(from,to,time) {
    var erpDisabled = getPassengerErpDisabledTimes(from, to);
    if (erpDisabled) return erpDisabled.indexOf(time) !== -1;
    return !!(ADMIN_ROUTE_DISABLED_TIMES[from] && ADMIN_ROUTE_DISABLED_TIMES[from][to] && ADMIN_ROUTE_DISABLED_TIMES[from][to].indexOf(time) !== -1);
  }
  function getActivePassengerTimes(from,to,times) { return (times || []).filter(function(time){ return !isPassengerTimeDisabled(from,to,time); }); }

  function getLeg1Times(){
  const pairTimes = getPairTimes(selOrigin, selDest);
  if (pairTimes) return pairTimes;
  return [];
}

function getLeg1TimesToTransferHub(origin, transferHubLabel) {
  const pairTimes = getPairTimes(origin, transferHubLabel);
  if (pairTimes) return pairTimes;
  return [];
}

function getNextBusSummaryTime() {
  const now = nowMin();
  let times;
  if(selOrigin==='ฉะเชิงเทรา (แปดริ้ว)' && isLeg2Dest(selDest)){
    times = getActivePassengerTimes(selOrigin,selDest,getPairTimes(selOrigin, selDest) || []);
  } else {
    times = getActivePassengerTimes(selOrigin,selDest,getLeg1Times());
  }
  if (!Array.isArray(times)) return '--:--';
  for(let i=0;i<times.length;i++){
    if(toMin(times[i])>now) return times[i];
  }
  return '--:--';
}

function resolvePassengerTripAssignment() {
  if (!window.SLTransitSchedule || typeof window.SLTransitSchedule.resolveTripAssignment !== 'function') return null;
  var time = getNextBusSummaryTime();
  if (!time || time === '--:--') return null;
  var transferHub = 'ฉะเชิงเทรา (แปดริ้ว)';
  var startsAtTransferHub = normalizeRouteAlias(selOrigin) === transferHub || cleanRouteLabel(selOrigin) === cleanRouteLabel(transferHub);
  var isPublishedScheduleOnly = startsAtTransferHub && isLeg2Dest(selDest);
  return window.SLTransitSchedule.resolveTripAssignment({
    serviceDate: (function() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
    origin: selOrigin,
    destination: selDest,
    departTime: time,
    requiresTransfer: isLeg2Dest(selDest) && !startsAtTransferHub,
    transferPoint: transferHub,
    scheduleOnly: isPublishedScheduleOnly,
    pickupStopKey: isPublishedScheduleOnly ? 'chachoengsao' : '',
    pickupStopName: isPublishedScheduleOnly ? transferHub : '',
    routeStops: isPublishedScheduleOnly ? ['chachoengsao', selDest] : [],
    routeStopNames: isPublishedScheduleOnly ? [transferHub, selDest] : [],
    assignmentSource: isPublishedScheduleOnly ? 'passenger_admin_schedule_only' : ''
  });
}

function choosePrimaryBus(buses) {
  var assignment = resolvePassengerTripAssignment();
  if (!assignment || assignment.scheduleOnly || assignment.noLiveTracking || assignment.serviceType === 'schedule-only') return null;
  var plannedVehicleId = String(assignment.plannedVehicleId || '');
  var pos = plannedVehicleId && buses ? buses[plannedVehicleId] : null;
  return pos ? Object.assign({ carId: plannedVehicleId }, pos) : null;
}

function applyPassengerRouteSettings(data) {
  const routesData = data && data.routes ? data.routes : null;
  if (!routesData) return;

  ADMIN_ROUTE_SOURCE_LOADED = true;
  Object.keys(ADMIN_ROUTE_TIMES).forEach(function(key){ delete ADMIN_ROUTE_TIMES[key]; });
  Object.keys(ADMIN_ROUTE_DISABLED_TIMES).forEach(function(key){ delete ADMIN_ROUTE_DISABLED_TIMES[key]; });
  Object.keys(ROUTES).forEach(function(key){ delete ROUTES[key]; });
  Object.keys(LEG2_DESTINATIONS).forEach(function(key){ delete LEG2_DESTINATIONS[key]; });
  ORIGIN_LIST.length = 0;
  DEST_NORMAL.length = 0;
  DEST_LEG2.length = 0;

  Object.entries(routesData).forEach(function(entry) {
    const group = entry[1];
    if (!group || !Array.isArray(group.routes)) return;
    if (group.isActive === false) return;
    const groupName = group.name || entry[0] || '';
    const isLegacyGroup = group.id === 'origins' || group.id === 'local' || groupName === 'ต้นทางตาม passenger.html' || groupName === 'เส้นทางย่อยทั้งหมด';
    const isLeg2Group = group.connectionType === 'transfer' || (!group.connectionType && (group.id === 'coastal' || group.id === 'bangkok' || /พัทยา|ระยอง|มีนบุรี|หมอชิต|เอกมัย|BTS/i.test(groupName)));
    group.routes.forEach(function(route) {
      if (!route || !route.from || !route.to || !Array.isArray(route.times)) return;
      if (route.isActive === false) return;

      const rawFrom = String(route.from || '').trim();
      const rawTo = String(route.to || '').trim();
      const from = normalizeRouteAlias(rawFrom) || rawFrom;
      const to = normalizeRouteAlias(rawTo) || rawTo;
      const disabledTimes = Array.isArray(route.disabledTimes) ? route.disabledTimes : [];
      const times = route.times.filter(Boolean).slice().sort(function(a,b){ return toMin(a) - toMin(b); });
      if (!from || !to) return;

      if (!ADMIN_ROUTE_TIMES[from]) ADMIN_ROUTE_TIMES[from] = {};
      if (!ADMIN_ROUTE_TIMES[from][to] || !isLegacyGroup) ADMIN_ROUTE_TIMES[from][to] = times;
        if (!ADMIN_ROUTE_DISABLED_TIMES[from]) ADMIN_ROUTE_DISABLED_TIMES[from] = {};
        if (!ADMIN_ROUTE_DISABLED_TIMES[from][to] || !isLegacyGroup) ADMIN_ROUTE_DISABLED_TIMES[from][to] = disabledTimes.slice();

      if (!ROUTES[from]) ROUTES[from] = { times: [] };
      if ((!isLegacyGroup && to === 'ฉะเชิงเทรา (แปดริ้ว)') || !ROUTES[from].times.length) {
        ROUTES[from].times = times.slice();
      }
      addUnique(ORIGIN_LIST, from);
      addUnique(DEST_NORMAL, from);

      if (isLeg2Group) {
        LEG2_DESTINATIONS[to] = { leg2Times: times.slice(), group: groupName || 'ต่อรถ' };
        addUnique(DEST_LEG2, to);
      } else {
        if (!ROUTES[to]) ROUTES[to] = { times: [] };
        addUnique(ORIGIN_LIST, to);
        addUnique(DEST_NORMAL, to);
      }
    });
  });
  sortStopLabels(ORIGIN_LIST);
  sortStopLabels(DEST_NORMAL);
  sortStopLabels(DEST_LEG2);

  emit('scheduleUpdated');
}

function applyPassengerRouteData(data) {
  PASSENGER_ROUTE_DATA = data || null;
  var stops = data && data.stops ? data.stops : null;
  if (!stops) return;
  var order = Object.keys(stops).sort(function(a,b) {
    var ai = Number(stops[a] && stops[a].order), bi = Number(stops[b] && stops[b].order);
    var an = stops[a] && (stops[a].nameTh || stops[a].stopNameTh || stops[a].name || a);
    var bn = stops[b] && (stops[b].nameTh || stops[b].stopNameTh || stops[b].name || b);
    if (!isFinite(ai) || ai <= 0) ai = passengerStopSortValue(an, 999999);
    if (!isFinite(bi) || bi <= 0) bi = passengerStopSortValue(bn, 999999);
    return ai - bi || a.localeCompare(b);
  });
  var nextStops = order.map(function(key) {
    var stop = stops[key];
    if (!stop) return null;
    var lat = Number(stop.lat), lng = Number(stop.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    // Schema v3 (data/catalog/stops): nameTh, bookable, notes, transferOptions
    // — with legacy fallbacks kept for stopNameTh/bookingEnabled/note.
    return {
      key:key,
      name: stop.nameTh || stop.stopNameTh || stop.name || key,
      lat:lat, lng:lng,
      icon: stop.icon || '🚏',
      order: Number(stop.order) || 0,
      stopType: stop.stopType || 'main',
      bookingEnabled: stop.bookable !== false && stop.bookingEnabled !== false,
      note: stop.notes || stop.note || '',
      transferOptions: stop.transferOptions || null
    };
  }).filter(Boolean);
  if (!nextStops.length) return;
  STOPS_GO.splice.apply(STOPS_GO, [0, STOPS_GO.length].concat(nextStops));
  STOPS_BACK.splice.apply(STOPS_BACK, [0, STOPS_BACK.length].concat(nextStops));
  if (mapReady) {
    loadPassengerRouteData().then(function(routeData) {
      return renderRoutePolyline(routeData).then(function() {
        renderStationMarkers(routeData);
      });
    }).catch(function(err) {
      console.warn('Passenger routeData render failed:', err && err.message ? err.message : err);
    });
  }
}

function forceFocusSelectedOriginAfterMapReady() {
  if (!mapReady || !mapObj) return;

  const stop = getStopByName(selOrigin);
  if (!stop) return;

  const point = normalizeMapPoint(stop);
  if (!point) return;

  setTimeout(function () {
    try {
      focusMap(point, 14);
    } catch (e) {
      console.warn('Force focus selected origin failed:', e);
    }
  }, 500);
}

function applyMobileMapPaint() {
  // Longdo base map is used; overlays are styled with CSS/HTML markers.
}

function initMap() {
  if (mapInitPromise) return mapInitPromise;
  try {
    stationMarkerOverlays = [];
    mapObj = new longdo.Map({ placeholder: document.getElementById('map'), zoom: 10, location: { lon:101.245, lat:13.710 } });
    mapReady = false;
    mapInitPromise = new Promise(function(resolve) {
      var resolved = false;
      function finishMapReady() {
        if (resolved) return;
        resolved = true;
        mapReady = true;
        try { mapObj.Ui.DPad.visible(false); } catch(e){}
        try { mapObj.Ui.Zoombar.visible(false); } catch(e){}
        try { mapObj.Ui.Toolbar.visible(false); } catch(e){}
        try { mapObj.Ui.LayerSelector.visible(false); } catch(e){}
        try { mapObj.Ui.Fullscreen.visible(false); } catch(e){}
        try { mapObj.Ui.Scale.visible(false); } catch(e){}
        try { mapObj.Ui.Crosshair.visible(false); } catch(e){}
        try { mapObj.Ui.Geolocation.visible(false); } catch(e){}
        console.log('Longdo map loaded');
        refreshMapSizeSafely();
        bindManualMapInteractionPause();
        if (Object.keys(allBusPositions).length) updateAllBusesOnMap(allBusPositions);
        resolve(mapObj);
      }
      try { mapObj.Event.bind('ready', finishMapReady); } catch(e) {}
      try { mapObj.Event.bind('idle', finishMapReady); } catch(e) {}
      setTimeout(finishMapReady, 1500);
    });
  } catch(e) { console.error('Map error:', e); mapInitPromise = Promise.resolve(null); }
  return mapInitPromise;
}

function bindManualMapInteractionPause() {
  if (!mapObj || mapObj.__manualFollowPauseBound) return;
  mapObj.__manualFollowPauseBound = true;

  var eventNames = [];
  if (window.longdo && longdo.EventName) {
    ['Drag', 'Wheel', 'Zoom'].forEach(function(name) {
      if (longdo.EventName[name]) eventNames.push(longdo.EventName[name]);
    });
  }
  eventNames.concat(['drag', 'wheel', 'zoom']).forEach(function(eventName) {
    try {
      mapObj.Event.bind(eventName, function() {
        pauseFollowForManualMapUse(eventName);
      });
    } catch(e) {}
  });

  var mapEl = document.getElementById('map');
  if (mapEl) {
    ['touchstart', 'pointerdown', 'wheel'].forEach(function(eventName) {
      mapEl.addEventListener(eventName, function() {
        pauseFollowForManualMapUse(eventName);
      }, { passive:true });
    });
  }
}

function initPassengerMap() {
  return new Promise(function(resolve) {
    (function waitLongdoReady(){
      if (window.longdo) { initMap().then(resolve); return; }
      setTimeout(waitLongdoReady, 300);
    })();
  });
}

function currentPassengerRouteData() {
  return {
    stations: curStops().slice()
  };
}

function loadPassengerRouteData() {
  if (PASSENGER_ROUTE_DATA && PASSENGER_ROUTE_DATA.stops) {
    return Promise.resolve(currentPassengerRouteData());
  }
  return db.ref('data/catalog').once('value').then(function(snap) {
    applyPassengerRouteData(snap.val());
    return currentPassengerRouteData();
  }).catch(function(err) {
    console.warn('Passenger central routeData load failed:', err && err.message ? err.message : err);
    return currentPassengerRouteData();
  });
}
function renderRoutePolyline(routeData) {
  return drawRoute(routeData);
}

async function refreshPassengerMapRoute() {
  if (!mapReady || !mapObj) return;
  const routeData = await loadPassengerRouteData();
  await renderRoutePolyline(routeData);
  renderStationMarkers(routeData);
  refreshMapSizeSafely();
}

function clearStationMarkers() {
  if (!mapObj || !stationMarkerOverlays) return;
  stationMarkerOverlays.forEach(function(overlay) { try { mapObj.Overlays.remove(overlay); } catch(e){} });
  stationMarkerOverlays = [];
}

function renderStationMarkers(routeData, skipEnsure) {
  if (!mapReady || !mapObj || !routeData || !Array.isArray(routeData.stations)) return;
  clearStationMarkers();
  routeData.stations.forEach(function(s, i) {
    var point = normalizeMapPoint(s);
    if (!point) return;
    var safeName = String(s.name || '').replace(/[&<>"']/g, function(ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); });
    var safeIcon = String(s.icon || '🚏').replace(/[&<>"']/g, function(ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); });
    try {
      var marker = new longdo.Marker(point, { weight: longdo.OverlayWeight && longdo.OverlayWeight.Top, icon: { html: '<div class="map-stop-icon" onclick="window.selectPassengerStop(' + i + ')">' + safeIcon + '</div>', offset: { x: 17, y: 17 } } });
      mapObj.Overlays.add(marker); stationMarkerOverlays.push(marker);
      if (marker._layer && typeof marker._layer.bindPopup === 'function') {
        var badges = SLPassengerLogic.buildTransferBadges(s);
        marker._layer.bindPopup('<b>' + safeName + '</b>' + (badges ? '<div class="map-transfer-badges">' + badges + '</div>' : ''));
      }
    } catch(e) { console.warn('Stop marker error:', e); }
    try {
      var label = new longdo.Marker(point, { weight: longdo.OverlayWeight && longdo.OverlayWeight.Top, icon: { html: '<div class="map-stop-label" onclick="window.selectPassengerStop(' + i + ')">' + safeName + '</div>', offset: { x: 10, y: -10 } } });
      mapObj.Overlays.add(label); stationMarkerOverlays.push(label);
    } catch(e) { console.warn('Stop label error:', e); }
  });
  if (!skipEnsure) ensureStationMarkersVisible(routeData, 0);
}

function refreshMapSizeSafely() {
  if (!mapObj) return;
  setTimeout(function() { try { if (typeof mapObj.resize === 'function') mapObj.resize(); if (typeof mapObj.repaint === 'function') mapObj.repaint(); } catch(e){} }, 300);
}

function ensureStationMarkersVisible(routeData, attempt) {
  if (!mapObj || !routeData || !Array.isArray(routeData.stations)) return;
  if (attempt >= 3) return;
  setTimeout(function() {
    if (stationMarkerOverlays.length < routeData.stations.length * 2) {
      renderStationMarkers(routeData, true); refreshMapSizeSafely(); ensureStationMarkersVisible(routeData, attempt + 1);
    }
  }, attempt === 0 ? 300 : 800);
}

function startPassengerLocation() {
  if (!navigator.geolocation) return Promise.resolve(null);
  if (passengerWatchId !== null) return Promise.resolve(passengerPos);

  var initialLocationPromise = requestPassengerCurrentLocation(true, false);

  passengerWatchId = navigator.geolocation.watchPosition(function(pos) {
    var next = normalizeMapPoint({
      lon: pos.coords.longitude,
      lat: pos.coords.latitude
    });
    if (!next) return;
    console.log('GPS received', next);

    if (passengerPos && distanceMeters(passengerPos.lat, passengerPos.lon, next.lat, next.lon) < 10) {
      passengerPos = next;
      updatePassengerOnMap(next, false);
      if (followUser) {
        focusMap(next, 15, false);
        passengerCentered = true;
      }
      return;
    }

    passengerPos = next;
    updatePassengerOnMap(next, true);
  }, function(err) {
    console.log('GPS error', err && err.message ? err.message : err);
    console.warn('Passenger location error:', err && err.message ? err.message : err);
  }, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5000
  });

  return initialLocationPromise;
}

// ===== SMOOTH PASSENGER MARKER =====
var _userAnimFrom=null,_userAnimTo=null,_userAnimStart=null,_userAnimFrame=null;
var USER_ANIM_DURATION=1800;
function _uLerp(a,b,t){return a+(b-a)*t;}
function _uEase(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
function _uDist(a,b){var R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}

// สร้าง marker ครั้งเดียว แล้วย้ายตำแหน่งแทนการลบ/สร้างใหม่ทุก frame
function ensureUserMarker(p) {
  if (!mapReady || !mapObj || !p) return;
  if (!userMarker) {
    userMarker = new longdo.Marker(p, {
      title: 'ตำแหน่งของคุณ',
      icon: { html: '<div class="map-passenger-marker"></div>', offset: { x:13, y:13 } }
    });
    mapObj.Overlays.add(userMarker);
  } else {
    try { userMarker.move(p); } catch(e) {
      try { userMarker.location(p); } catch(e2) {
        try { mapObj.Overlays.remove(userMarker); } catch(e3) {}
        userMarker = new longdo.Marker(p, {
          title: 'ตำแหน่งของคุณ',
          icon: { html: '<div class="map-passenger-marker"></div>', offset: { x:13, y:13 } }
        });
        mapObj.Overlays.add(userMarker);
      }
    }
  }
}

function updatePassengerOnMap(latlng, forceCenter) {
  latlng = normalizeMapPoint(latlng);
  if (!mapReady || !mapObj || !latlng) return;
  if (_userAnimFrame){cancelAnimationFrame(_userAnimFrame);_userAnimFrame=null;}
  var from=_userAnimTo||latlng;
  var dist=_uDist(from,latlng);
  if(dist<3){ensureUserMarker(latlng);_userAnimTo=latlng;}
  else{
    var duration=Math.min(USER_ANIM_DURATION,Math.max(500,dist*15));
    _userAnimFrom={lat:from.lat,lon:from.lon};_userAnimTo=latlng;_userAnimStart=null;
    function step(ts){
      if(!_userAnimStart)_userAnimStart=ts;
      var t=Math.min((ts-_userAnimStart)/duration,1),te=_uEase(t);
      ensureUserMarker({lat:_uLerp(_userAnimFrom.lat,_userAnimTo.lat,te),lon:_uLerp(_userAnimFrom.lon,_userAnimTo.lon,te)});
      if(t<1){_userAnimFrame=requestAnimationFrame(step);}else{_userAnimFrame=null;ensureUserMarker(_userAnimTo);}
    }
    _userAnimFrame=requestAnimationFrame(step);
  }
  // แก้ zoom lock: ไม่ re-center ถ้าผู้ใช้กำลัง pinch zoom อยู่
  if ((forceCenter || !passengerCentered) && followUser && Date.now() > programmaticMapMoveUntil) {
    focusMap(latlng, 15, false); passengerCentered = true;
  }
}

function drawRoute(routeData) {
  if (!mapReady) return Promise.resolve();
  const stops = routeData && Array.isArray(routeData.stations) ? routeData.stations : (viewDir==='go' ? STOPS_GO : STOPS_BACK);
  const coords = stops.map(function(s){ return s.lng + ',' + s.lat; }).join(';');
  const renderSeq = ++routeRenderSeq;
  function setRouteLine(coordinates) {
    if (renderSeq !== routeRenderSeq) return;
    const pts = coordinates.map(function(c) { return Array.isArray(c) ? { lon:c[0], lat:c[1] } : normalizeMapPoint(c); }).filter(Boolean);
    knownRouteLinePoints = pts;
    try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
    routeLine = new longdo.Polyline(pts, { lineColor: viewDir==='go' ? '#1e40af' : '#dc2626', lineWidth: 5, lineOpacity: 0.82 });
    mapObj.Overlays.add(routeLine);
  }
  return fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson')
    .then(r=>r.json()).then(data=>{ if (data.routes?.[0]) setRouteLine(data.routes[0].geometry.coordinates); })
    .catch(()=>{ const pts = stops.map(s=>({ lon:s.lng, lat:s.lat })); setRouteLine(pts); });
}

// ===== KALMAN FILTER FOR BUS POSITION =====
var busKalman = {}; // เก็บ state แยกตาม carId
var busLastTs = {}; // เก็บ timestamp ล่าสุดของรถแต่ละคัน (stale packet guard)

function kalmanFilter(carId, lat, lng, accuracy, timestamp) {
    var Q = 8, R = 8;
    if (!busKalman[carId]) {
        busKalman[carId] = { lat: lat, lng: lng, acc: accuracy || 10, ts: timestamp, init: true };
        return { lat: lat, lng: lng };
    }
    var k = busKalman[carId];

    // Speed check — กรองถ้าเคลื่อนที่เร็วเกิน 150 กม./ชม.
    if (k.ts > 0) {
        var dtSec = (timestamp - k.ts) / 1000;
        if (dtSec > 0) {
            var dLat = lat - k.lat, dLng = lng - k.lng;
            var distM = Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
            var speedMs = distM / dtSec;
            if (speedMs > 42) {
                var ageSec = (Date.now() - timestamp) / 1000;
                console.log('[kalmanFilter] FILTERED OUT - speed too high', {
                  carId: carId, lat: lat, lng: lng, accuracy: accuracy,
                  tsUsed: timestamp, ageSec: ageSec.toFixed(1),
                  speedKmh: (speedMs * 3.6).toFixed(1), reason: 'speed > 150 km/h'
                });
                return null;
            }
        }
    }

    // Accuracy check — ✅ แก้ไข: ลด threshold จาก 80m → 40m ให้ตรงกับ GpsService.java
    if (accuracy && accuracy > 40) {
        var ageSec2 = (Date.now() - timestamp) / 1000;
        console.log('[kalmanFilter] FILTERED OUT - low accuracy', {
          carId: carId, lat: lat, lng: lng, accuracy: accuracy,
          tsUsed: timestamp, ageSec: ageSec2.toFixed(1), reason: 'accuracy > 40m'
        });
        return null;
    }

    var dt = k.ts > 0 ? (timestamp - k.ts) / 1000 : 1;
    var predicted = k.acc + Q * Math.max(dt, 1);
    var rawAcc = accuracy || 10;
    var gain = predicted / (predicted + R + rawAcc);

    k.lat += gain * (lat - k.lat);
    k.lng += gain * (lng - k.lng);
    k.acc = (1 - gain) * predicted;
    k.ts = timestamp;

    return { lat: k.lat, lng: k.lng };
}

// ===== SMOOTH BUS ANIMATION =====
var busCurrentPos = {};      // ตำแหน่งปัจจุบันของ marker แต่ละคัน
var busTargetPos = {};        // ตำแหน่งเป้าหมาย
var busAnimFrames = {};       // requestAnimationFrame id
var busPredictionFrames = {};
var busPredictionSeq = {};
var busMotionState = {};
var busRenderFrames = {};
var busLastPacketPos = {};

var BUS_ANIM_DURATION = 600; // ms — ลดให้ marker ตามตำแหน่งจริงไวขึ้น
var BUS_PREDICT_MAX_MS = 10000;
var BUS_PREDICT_MAX_METERS = 300;
var BUS_DELAYED_SEC = 15;
var BUS_OFFLINE_SEC = 60;
var BUS_ROUTE_MAX_DISTANCE_METERS = 8000;

function lerp(a, b, t) { return a + (b - a) * t; }

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function stopBusPrediction(carId) {
  if (busPredictionFrames[carId]) cancelAnimationFrame(busPredictionFrames[carId]);
  busPredictionFrames[carId] = null;
  busPredictionSeq[carId] = (busPredictionSeq[carId] || 0) + 1;
}

function projectPoint(lat, lon, headingDeg, meters) {
  var R = 6371000;
  var brng = headingDeg * Math.PI / 180;
  var lat1 = lat * Math.PI / 180;
  var lon1 = lon * Math.PI / 180;
  var d = meters / R;
  var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

function startBusPrediction(carId, packetPos, pos) {
  stopBusPrediction(carId);
  if (!packetPos || isVehicleOfflineOrDelayed(pos)) return;
  var predictSeq = (busPredictionSeq[carId] || 0) + 1;
  busPredictionSeq[carId] = predictSeq;
  var speed = Number(pos.speed || pos.velocity || 0) / 3.6; // km/h → m/s
  var heading = Number(pos.heading || pos.bearing);
  if (!isFinite(speed) || speed <= 0 || !isFinite(heading)) return;
  if (speed > 27.8) speed = 27.8; // cap ที่ 100 km/h
  // ใช้ gpsTs แทน sentTs เพื่อ compensate latency ระหว่าง GPS fix → Firebase
  var ts = Number(pos.gpsTs || pos.gpsts || getVehicleTs(pos) || Date.now());

  // Dead reckoning snap: snap ตำแหน่งที่ประมาณได้เข้าถนนทุก 3 วินาที
  // ป้องกันรถลอยออกนอกถนนช่วงสัญญาณหาย
  var lastSnapMs = 0;
  var SNAP_INTERVAL_MS = 3000;
  var currentPredictPos = packetPos; // ตำแหน่งล่าสุดที่ snap แล้ว

  function step() {
    if (isVehicleOfflineOrDelayed(pos)) {
      stopBusPrediction(carId);
      return;
    }
    var ageMs = Date.now() - ts;
    var predictMs = Math.min(Math.max(ageMs, 0), BUS_PREDICT_MAX_MS);
    var meters = Math.min(speed * (predictMs / 1000), BUS_PREDICT_MAX_METERS);
    var next = projectPoint(packetPos.lat, packetPos.lon, heading, meters);

    // snap ตำแหน่งที่ประมาณได้เข้าถนนทุก SNAP_INTERVAL_MS
    // ระหว่างรอ snap ใช้ตำแหน่งที่ snap ครั้งล่าสุด
    var nowMs = Date.now();
    if (nowMs - lastSnapMs >= SNAP_INTERVAL_MS) {
      lastSnapMs = nowMs;
      (function(snapNext) {
        snapToRoad(carId, snapNext.lat, snapNext.lon, function(snappedNext) {
          // อัปเดต currentPredictPos เฉพาะถ้ายัง predict อยู่ (ไม่ได้ถูก cancel)
          if (busPredictionFrames[carId] !== null) {
            if (busPredictionSeq[carId] !== predictSeq) return;
            currentPredictPos = snappedNext;
            placeBusMarkerAt(carId, snappedNext);
            busCurrentPos[carId] = snappedNext;
          }
        });
      })(next);
    } else {
      // ระหว่างรอ snap ใช้การ lerp จาก currentPredictPos ไปหา next เพื่อให้ smooth
      var lerpT = Math.min((nowMs - lastSnapMs) / SNAP_INTERVAL_MS, 1);
      var smoothNext = {
        lat: lerp(currentPredictPos.lat, next.lat, lerpT * 0.3),
        lon: lerp(currentPredictPos.lon, next.lon, lerpT * 0.3)
      };
      if (busPredictionSeq[carId] !== predictSeq) return;
      placeBusMarkerAt(carId, smoothNext);
      busCurrentPos[carId] = smoothNext;
    }

    if (predictMs < BUS_PREDICT_MAX_MS && meters < BUS_PREDICT_MAX_METERS) {
      busPredictionFrames[carId] = requestAnimationFrame(step);
    } else {
      stopBusPrediction(carId);
    }
  }
  busPredictionFrames[carId] = requestAnimationFrame(step);
}

function nearestRouteDistanceMeters(point) {
  if (!point) return Infinity;
  if (knownRouteLinePoints && knownRouteLinePoints.length > 1) {
    var routeBest = Infinity;
    for (var i = 1; i < knownRouteLinePoints.length; i++) {
      var segDist = distanceToRouteSegmentMeters(point, knownRouteLinePoints[i - 1], knownRouteLinePoints[i]);
      if (segDist < routeBest) routeBest = segDist;
    }
    if (routeBest < Infinity) return routeBest;
  }
  var stops = STOPS_GO.concat(STOPS_BACK).map(normalizeMapPoint).filter(Boolean);
  var best = Infinity;
  stops.forEach(function(stop) {
    var d = distanceMeters(point.lat, point.lon, stop.lat, stop.lon);
    if (d < best) best = d;
  });
  return best;
}

function routeSegmentProjection(point, start, end) {
  if (!point || !start || !end) return null;
  var lat = Number(point.lat), lon = Number(point.lon);
  var lat1 = Number(start.lat), lon1 = Number(start.lon);
  var lat2 = Number(end.lat), lon2 = Number(end.lon);
  if (![lat,lon,lat1,lon1,lat2,lon2].every(Number.isFinite)) return null;
  var metersPerLat = 111320;
  var metersPerLon = 111320 * Math.cos(lat * Math.PI / 180);
  var px = lon * metersPerLon, py = lat * metersPerLat;
  var ax = lon1 * metersPerLon, ay = lat1 * metersPerLat;
  var bx = lon2 * metersPerLon, by = lat2 * metersPerLat;
  var dx = bx - ax, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  var t = len2 <= 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  var projX = ax + t * dx, projY = ay + t * dy;
  return {
    lat: projY / metersPerLat,
    lon: projX / metersPerLon,
    distance: Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY))
  };
}

function distanceToRouteSegmentMeters(point, start, end) {
  var projected = routeSegmentProjection(point, start, end);
  return projected ? projected.distance : Infinity;
}

function snapPointToKnownRoute(point, maxMeters) {
  if (!point || !knownRouteLinePoints || knownRouteLinePoints.length < 2) return point;
  var best = null;
  for (var i = 1; i < knownRouteLinePoints.length; i++) {
    var projected = routeSegmentProjection(point, knownRouteLinePoints[i - 1], knownRouteLinePoints[i]);
    if (projected && (!best || projected.distance < best.distance)) best = projected;
  }
  if (!best || best.distance > (maxMeters || 120)) return point;
  return { lat: best.lat, lon: best.lon };
}

function isVehiclePointOnKnownRoute(point) {
  return nearestRouteDistanceMeters(point) <= BUS_ROUTE_MAX_DISTANCE_METERS;
}

function animateBusMarker(carId, fromPos, toPos) {
  stopBusPrediction(carId);
  // ยกเลิก animation เก่าถ้ามี
  if (busAnimFrames[carId]) cancelAnimationFrame(busAnimFrames[carId]);

  var startTime = null;
  var dist = distanceMeters(fromPos.lat, fromPos.lon, toPos.lat, toPos.lon);

  // ถ้าระยะทางน้อยกว่า 5 เมตร ไม่ต้อง animate
  if (dist < 5) {
    placeBusMarkerAt(carId, toPos);
    busCurrentPos[carId] = toPos;
    return 0;
  }

  // ถ้าระยะเกิน 600 เมตร → instant place ทันที ไม่ animate
  // เพื่อกันรถลาก marker ข้ามแม่น้ำหรือตามหลังมากเมื่อข้อมูลมาช้า
  if (dist > 600) {
    console.log('[animateBusMarker] instant place (dist > 600m)', carId, dist.toFixed(0) + 'm');
    busAnimFrames[carId] = null;
    placeBusMarkerAt(carId, toPos);
    busCurrentPos[carId] = toPos;
    return 0;
  }

  // ปรับความเร็ว animation ตามระยะทาง: ไกลให้ขยับเร็วขึ้นเพื่อลดอาการค้างตามหลัง
  var duration = dist > 250 ? 450 : dist > 120 ? 650 : Math.min(BUS_ANIM_DURATION, Math.max(350, dist * 14));

  // Speed guard: ถ้า animation จะทำให้รถ "วิ่ง" เกิน 120 กม./ชม. = Firebase queue flush
  // → instant place แทน animate ป้องกันรถวิ่งเร็วผิดปกติหลังเน็ตกลับมา
  var impliedSpeedKmh = (dist / (duration / 1000)) * 3.6;
  if (impliedSpeedKmh > 120) {
    console.log('[animateBusMarker] instant place (speed guard', impliedSpeedKmh.toFixed(0) + 'km/h)', carId);
    busAnimFrames[carId] = null;
    placeBusMarkerAt(carId, toPos);
    busCurrentPos[carId] = toPos;
    return 0;
  }

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var t = Math.min(elapsed / duration, 1);
    var te = easeInOut(t);

    var current = {
      lat: lerp(fromPos.lat, toPos.lat, te),
      lon: lerp(fromPos.lon, toPos.lon, te)
    };

    placeBusMarkerAt(carId, current);
    busCurrentPos[carId] = current;

    if (t < 1) {
      busAnimFrames[carId] = requestAnimationFrame(step);
    } else {
      busCurrentPos[carId] = toPos;
      busAnimFrames[carId] = null;
    }
  }
  busAnimFrames[carId] = requestAnimationFrame(step);
  return duration;
}

function moveLongdoMarker(marker, latlng) {
  if (!marker || !latlng) return false;
  try {
    if (typeof marker.move === 'function') { marker.move(latlng); return true; }
    if (typeof marker.location === 'function') { marker.location(latlng); return true; }
  } catch(e) {}
  return false;
}

function placeBusMarkerAt(carId, latlng) {
  if (!mapReady || !mapObj || !latlng) return;
  var existingBus = busMarkers[carId];
  var existingTag = busTagMarkers[carId];
  if (existingBus && existingTag && moveLongdoMarker(existingBus, latlng) && moveLongdoMarker(existingTag, latlng)) return;

  var safeCarId = String(carId).replace(/[&<>"']/g, function(ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); });
  var busImgHtml = '<img src="' + BUS_ICON_SRC + '" alt="">';
  var label = String(carId).replace(/^car/i, 'รถ ');
  try { if (busMarkers[carId]) mapObj.Overlays.remove(busMarkers[carId]); } catch(e){}
  try { if (busTagMarkers[carId]) mapObj.Overlays.remove(busTagMarkers[carId]); } catch(e){}
  busMarkers[carId] = new longdo.Marker(latlng, {
    title: 'รถโดยสาร ' + label,
    weight: longdo.OverlayWeight && longdo.OverlayWeight.Top,
    icon: { html: '<div class="map-bus-icon" onclick="window.selectPassengerBus(&quot;' + safeCarId + '&quot;)">' + busImgHtml + '</div>', offset: { x: 20, y: 20 } }
  });
  mapObj.Overlays.add(busMarkers[carId]);
  busTagMarkers[carId] = new longdo.Marker(latlng, {
    weight: longdo.OverlayWeight && longdo.OverlayWeight.Top,
    icon: { html: '<div class="map-bus-label" onclick="window.selectPassengerBus(&quot;' + safeCarId + '&quot;)">' + busImgHtml + label + '</div>', offset: { x: 10, y: -20 } }
  });
  mapObj.Overlays.add(busTagMarkers[carId]);
}

function bearingBetweenPoints(fromPos, toPos) {
  if (!fromPos || !toPos) return NaN;
  var lat1 = fromPos.lat * Math.PI / 180;
  var lat2 = toPos.lat * Math.PI / 180;
  var dLon = (toPos.lon - fromPos.lon) * Math.PI / 180;
  var y = Math.sin(dLon) * Math.cos(lat2);
  var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function normalizedVehicleSpeedMs(pos, derivedSpeedMs) {
  var raw = Number(pos && (pos.speed != null ? pos.speed : pos.velocity));
  var fromPacket = Number.isFinite(raw) && raw > 0.5 ? raw / 3.6 : 0;
  var speed = fromPacket || (Number.isFinite(derivedSpeedMs) ? derivedSpeedMs : 0);
  return Math.max(0, Math.min(speed, 27.8));
}

function stopBusRenderLoop(carId) {
  if (busRenderFrames[carId]) cancelAnimationFrame(busRenderFrames[carId]);
  busRenderFrames[carId] = null;
}

function ensureBusRenderLoop(carId) {
  if (busRenderFrames[carId]) return;
  var lastFrameMs = 0;
  function frame(nowMs) {
    var state = busMotionState[carId];
    if (!state || state.online === false) { stopBusRenderLoop(carId); return; }
    if (!lastFrameMs) lastFrameMs = nowMs;
    var dtSec = Math.min(Math.max((nowMs - lastFrameMs) / 1000, 0), 0.25);
    lastFrameMs = nowMs;

    var ageMs = Math.max(0, Date.now() - state.lastGpsTs);
    if (ageMs > 30000) { stopBusRenderLoop(carId); return; }

    var target = state.anchor;
    if (state.speedMs > 0.4 && Number.isFinite(state.heading) && ageMs <= BUS_PREDICT_MAX_MS) {
      var meters = Math.min(state.speedMs * (ageMs / 1000), BUS_PREDICT_MAX_METERS);
      target = projectPoint(state.anchor.lat, state.anchor.lon, state.heading, meters);
    }
    target = snapPointToKnownRoute(target, 160);

    var display = state.display || target;
    var dist = distanceMeters(display.lat, display.lon, target.lat, target.lon);
    // ✅ แก้ไข: เพิ่ม alpha ให้ marker ไล่ตามตำแหน่งจริงได้เร็วขึ้น
    // เดิม dist > 180m จะลด alpha เหลือ 0.08 ทำให้ marker ลากตามหลังนาน
    var alpha = Math.min(0.32, Math.max(0.10, dtSec * 2.4));
    if (dist > 180) alpha = 0.18;  // เพิ่มจาก 0.08 → 0.18 ให้ไล่ตามได้ไวขึ้น
    if (dist < 1.5) display = target;
    else display = { lat: lerp(display.lat, target.lat, alpha), lon: lerp(display.lon, target.lon, alpha) };

    state.display = display;
    busCurrentPos[carId] = display;
    placeBusMarkerAt(carId, display);

    if (state.speedMs > 0.4 || dist > 1.5 || ageMs < 12000) busRenderFrames[carId] = requestAnimationFrame(frame);
    else stopBusRenderLoop(carId);
  }
  busRenderFrames[carId] = requestAnimationFrame(frame);
}

function updateBusMotionTarget(carId, gpsPos, pos, gpsTs, shouldFocus) {
  gpsPos = snapPointToKnownRoute(gpsPos, 180);
  var state = busMotionState[carId] || null;
  if (state && gpsTs < state.lastGpsTs) {
    console.log('[busMotion] ignore stale gps packet', carId, gpsTs, state.lastGpsTs);
    return;
  }

  var derivedSpeedMs = 0;
  var derivedHeading = NaN;
  if (state && gpsTs > state.lastGpsTs) {
    var dtSec = Math.max((gpsTs - state.lastGpsTs) / 1000, 0.001);
    var movedM = distanceMeters(state.anchor.lat, state.anchor.lon, gpsPos.lat, gpsPos.lon);
    var impliedSpeedMs = movedM / dtSec;
    if (impliedSpeedMs > 45) {
      console.log('[busMotion] ignore impossible gps jump', carId, movedM.toFixed(0) + 'm', (impliedSpeedMs * 3.6).toFixed(0) + 'km/h');
      return;
    }
    derivedSpeedMs = impliedSpeedMs;
    if (movedM >= 3) derivedHeading = bearingBetweenPoints(state.anchor, gpsPos);
  }

  var packetHeading = Number(pos && (pos.heading != null ? pos.heading : pos.bearing));
  var heading = Number.isFinite(packetHeading) ? packetHeading : derivedHeading;
  if (!Number.isFinite(heading) && state) heading = state.heading;
  var speedMs = normalizedVehicleSpeedMs(pos, derivedSpeedMs);
  if (speedMs < 0.4 && derivedSpeedMs > 0.4) speedMs = Math.min(derivedSpeedMs, 27.8);

  if (!state) {
    state = { anchor: gpsPos, display: busCurrentPos[carId] || gpsPos, lastGpsTs: gpsTs, speedMs: speedMs, heading: heading, online: pos.online !== false };
  } else {
    state.anchor = gpsPos;
    state.lastGpsTs = gpsTs;
    state.speedMs = speedMs;
    state.heading = heading;
    state.online = pos.online !== false;
    state.display = state.display || busCurrentPos[carId] || gpsPos;
  }
  busMotionState[carId] = state;
  busTargetPos[carId] = gpsPos;
  busLastPacketPos[carId] = gpsPos;
  ensureBusRenderLoop(carId);
  if (shouldFocus && (busFollowMode || !busCentered)) { focusMap(state.display || gpsPos, 14); busCentered = true; }
}

// ===== SNAP-TO-ROAD (OSRM Match API) =====
// Cache snap result ต่อ carId เพื่อไม่ call OSRM ซ้ำถ้าตำแหน่งไม่เปลี่ยน
var snapCache = {}; // { carId: { lat, lon, snappedLat, snappedLon, ts } }
var snapInFlight = {}; // { carId: true } ป้องกัน call ซ้อน

function snapToRoad(carId, lat, lon, callback) {
  var now = Date.now();
  var cache = snapCache[carId];

  // ใช้ cache ถ้าตำแหน่งเดิมเปลี่ยนไปน้อยกว่า 15 เมตร และอายุไม่เกิน 30 วินาที
  if (cache && (now - cache.ts) < 30000) {
    var cacheDist = distanceMeters(lat, lon, cache.lat, cache.lon);
    if (cacheDist < 15) {
      callback({ lat: cache.snappedLat, lon: cache.snappedLon });
      return;
    }
  }

  // ถ้ามี call อยู่แล้ว ใช้ตำแหน่งดิบไปก่อน (ไม่รอ)
  if (snapInFlight[carId]) {
    callback({ lat: lat, lon: lon });
    return;
  }

  snapInFlight[carId] = true;
  var url = 'https://router.project-osrm.org/match/v1/driving/'
    + lon + ',' + lat
    + '?radiuses=50&geometries=geojson&annotations=false&overview=false';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      snapInFlight[carId] = false;
      if (data && data.matchings && data.matchings[0] &&
          data.matchings[0].legs && data.matchings[0].legs[0] &&
          data.tracepoints && data.tracepoints[0] &&
          data.tracepoints[0] !== null) {
        var snapped = data.tracepoints[0].location; // [lon, lat]
        var snappedLat = snapped[1], snappedLon = snapped[0];
        // เก็บ cache
        snapCache[carId] = { lat: lat, lon: lon, snappedLat: snappedLat, snappedLon: snappedLon, ts: now };
        // snapToRoad คืนค่าอย่างเดียว; ห้ามขยับ marker จาก callback เก่าเอง
        // เพื่อกันผล OSRM ที่มาช้ากว่าดึงรถกลับไปตำแหน่งก่อนหน้า
        callback({ lat: snappedLat, lon: snappedLon });
      } else {
        // OSRM snap ไม่ได้ (นอกถนน, timeout) → ใช้ตำแหน่งดิบ
        callback({ lat: lat, lon: lon });
      }
    })
    .catch(function() {
      snapInFlight[carId] = false;
      // OSRM ล่มหรือเน็ตหาย → ใช้ตำแหน่งดิบ ไม่กระทบ UX
      callback({ lat: lat, lon: lon });
    });
}

function updateAllBusesOnMap(buses) {
  if (!mapReady || !mapObj) return;
  Object.keys(buses || {}).forEach(function(id) {
    updateBusOnMap(buses[id], id, false);
  });
}

function removeBusFromMap(carId) {
  stopBusRenderLoop(carId);
  try { if (busMarkers[carId]) mapObj.Overlays.remove(busMarkers[carId]); } catch(e) {}
  try { if (busTagMarkers[carId]) mapObj.Overlays.remove(busTagMarkers[carId]); } catch(e) {}
  delete busMarkers[carId]; delete busTagMarkers[carId];
  delete busMotionState[carId]; delete busTargetPos[carId]; delete busCurrentPos[carId];
}

function updateBusOnMap(pos, carId, shouldFocus) {
  if (!mapReady || !mapObj) return;

  pos = pos || {};
  carId = carId || pos.carId || 'car1';
  if (pos.online === false || pos.status === 'offline' || String(pos.status || '').indexOf('standby') === 0) {
    removeBusFromMap(carId);
    return;
  }
  var dir = pos.direction === 'back' ? STOPS_BACK : STOPS_GO;

  // heartbeatOnly = ping ว่ายังออนไลน์ แต่ยังมี lat/lng ล่าสุดอยู่
  // ถ้ามี marker อยู่แล้ว ไม่ต้อง animate ซ้ำ; ถ้ายังไม่มี marker ให้ใช้ตำแหน่งล่าสุดวาดรถก่อน
  if (pos.heartbeatOnly === true && busMarkers[carId]) {
    console.log('[updateBusOnMap] keep existing heartbeat-only marker', carId);
    return;
  }

  var newPos = normalizeMapPoint(pos);
  if (!newPos && pos.stopIdx !== undefined && dir[pos.stopIdx]) newPos = normalizeMapPoint(dir[pos.stopIdx]);
  if (!newPos) return;
  if (!isVehiclePointOnKnownRoute(newPos)) {
    // warn แต่ไม่หยุด — route line อาจยังโหลดไม่เสร็จ หรือ GPS drift ชั่วคราว
    // ให้ snapToRoad หาถนนที่ใกล้ที่สุดเอง ไม่ให้ marker หายไป
    console.warn('[updateBusOnMap] off-route (continuing)', carId, {
      lat: newPos.lat, lon: newPos.lon,
      nearestRouteM: nearestRouteDistanceMeters(newPos).toFixed(0)
    });
  }

  var acc = (pos.accuracy != null ? Number(pos.accuracy) :
             pos.acc      != null ? Number(pos.acc)      : 10);
  // ✅ แก้ไข: ลด threshold จาก 80m → 40m ให้ตรงกับ GpsService.java
  if (acc && acc > 40) {
    console.log('[updateBusOnMap] skip low accuracy gps', carId, acc + 'm');
    return;
  }

  var gpsTs = getVehicleTs(pos);
  if (!gpsTs) {
    console.warn('[updateBusOnMap] vehicle missing gps timestamp', carId, pos);
    gpsTs = Date.now();
  }

  if (busLastTs[carId] && gpsTs < busLastTs[carId]) {
    console.log('[updateBusOnMap] skip old vehicle packet', carId,
      'packetTs:', gpsTs, 'lastTs:', busLastTs[carId],
      'diff:', ((busLastTs[carId] - gpsTs) / 1000).toFixed(1) + 's old');
    return;
  }
  if (busLastTs[carId] === gpsTs && busTargetPos[carId]) {
    var repeatedDist = distanceMeters(newPos.lat, newPos.lon, busTargetPos[carId].lat, busTargetPos[carId].lon);
    if (repeatedDist < 3) return;
  }
  busLastTs[carId] = gpsTs;

  var ageSecNum = (Date.now() - gpsTs) / 1000;
  console.log('[updateBusOnMap] motion update', carId, {
    rawLat: newPos.lat, rawLng: newPos.lon,
    ts: gpsTs, ageSec: ageSecNum.toFixed(1),
    speed: pos.speed, heading: pos.heading,
    mode: 'motion-state'
  });

  updateBusMotionTarget(carId, newPos, pos, gpsTs, shouldFocus);
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  if (window.SLTransitGeo && typeof window.SLTransitGeo.distanceMeters === 'function') {
    return window.SLTransitGeo.distanceMeters(lat1, lon1, lat2, lon2);
  }
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ===== STATUS =====
function getStatusInfo(pos) {
  if (pos) {
    var statusNote = vehicleStatusMessage(pos);
    if (pos.online === false || pos.status === 'locating' || pos.status === 'low_accuracy' || pos.status === 'gps_error') {
      return {cls:'stopped', icon:'รถ', title:statusNote, sub:'สถานะจากแอปคนขับ'};
    }
  }
  if (!pos) return {cls:'',icon:'🚌',title:'ยังไม่มีข้อมูลตำแหน่งรถ',sub:'ระบบกำลังรอข้อมูลจากแอปคนขับ'};
  const elapsed=getVehicleAgeSec(pos);
  const dir=pos.direction==='back'?STOPS_BACK:STOPS_GO;
  const stopName=dir[pos.stopIdx]?.name||'?';
  const nextStop=dir[(pos.stopIdx||0)+1]?.name||null;
  const dirLabel=pos.direction==='back'?'แปดริ้ว → สนามชัย':'สนามชัย → แปดริ้ว';
  const timeAgo=Math.round(elapsed/60);
  const timeStr=timeAgo===0?'เพิ่งอัปเดต':`อัปเดต ${timeAgo} นาทีที่แล้ว`;
  if (elapsed > BUS_OFFLINE_SEC)
    return {cls:'stopped', icon:'🚌', title:'ตำแหน่งล่าสุดก่อนออฟไลน์', sub:`${timeStr} · ${dirLabel}`};
  if (elapsed > BUS_DELAYED_SEC)
    return {cls:'stopped', icon:'🚌', title:'ตำแหน่งล่าช้า', sub:`${timeStr} · ${dirLabel}`};
  if (pos.status==='at'||elapsed>120)
    return {cls:'stopped', icon:'🛑', title:`จอดที่ ${stopName}`, sub:dirLabel};
  if (pos.status==='towards'&&nextStop)
    return {cls:'arriving', icon:'🚍', title:`กำลังมุ่งหน้า ${nextStop}`, sub:dirLabel};
  return {cls:'running', icon:'🚌', title:`กำลังวิ่ง · ออกจาก ${stopName}`, sub:dirLabel};
}


  function setFollowUser(nextValue) {
    followUser = nextValue === true;
    emit('followChanged', followUser);
    if (followUser && passengerPos) focusMap(passengerPos, 15, false, true);
    else if (followUser) requestPassengerCurrentLocation(true, false);
  }

  function applyCatalogStopsToMap(catalogStops) {
    var mapped = (catalogStops || []).map(function(s) {
      return { key: s.key, name: s.name, lat: s.lat, lng: s.lng, icon: s.icon, transferOptions: s.transferOptions };
    });
    STOPS_GO = mapped;
    STOPS_BACK = mapped.slice();
  }

  // Unified Schema-v3 catalog listener (data/catalog): applies both schedule
  // settings-shape and stop/route legacy-shape views in one pass, guarding
  // against double-apply the same way the original per-path listeners did.
  function applyUnifiedCatalog(catalog) {
    if (!catalog) return;
    PASSENGER_CATALOG_RAW = catalog;
    var view = global.SLTransitERP && typeof global.SLTransitERP.catalogView === 'function'
      ? global.SLTransitERP.catalogView(catalog)
      : null;
    var settingsRoutes = view && view.settingsRoutes
      ? view.settingsRoutes
      : global.SLTransitCatalog && typeof global.SLTransitCatalog.legacySettingsRoutes === 'function'
        ? global.SLTransitCatalog.legacySettingsRoutes(catalog)
        : {};
    var legacyRouteData = view && view.routeData
      ? view.routeData
      : global.SLTransitCatalog && typeof global.SLTransitCatalog.legacyRouteData === 'function'
        ? global.SLTransitCatalog.legacyRouteData(catalog)
        : {};
    if (settingsRoutes && Object.keys(settingsRoutes).length) {
      applyPassengerRouteSettings({ routes: settingsRoutes, currentCatalogVersion: catalog.version || '' });
      PASSENGER_CATALOG_ROUTES_APPLIED = true;
    }
    if (legacyRouteData && (legacyRouteData.stops || legacyRouteData.queues)) {
      applyPassengerRouteData(legacyRouteData);
      PASSENGER_CATALOG_ROUTE_DATA_APPLIED = true;
    }
    PASSENGER_CATALOG_VERSION_APPLIED = String((view && view.version) || catalog.version || '');
    console.log('[PASSENGER ERP] applied catalog', PASSENGER_CATALOG_VERSION_APPLIED);
  }

  var stateApi = {
    getOrigin: function(){ return selOrigin; },
    setOrigin: function(v){ selOrigin = v || ''; },
    getDest: function(){ return selDest; },
    setDest: function(v){ selDest = v || ''; }
  };

  var scheduleApi = {
    isLeg2Dest: isLeg2Dest,
    getPairTimes: getPairTimes,
    isTimeDisabled: isPassengerTimeDisabled,
    getActiveTimes: getActivePassengerTimes,
    getLeg1Times: getLeg1Times,
    getLeg1TimesToTransferHub: getLeg1TimesToTransferHub,
    getNextTime: getNextBusSummaryTime,
    getOriginList: function(){ return ORIGIN_LIST; },
    getDestNormalList: function(){ return DEST_NORMAL; },
    getDestLeg2List: function(){ return DEST_LEG2; },
    getLeg2Destinations: function(){ return LEG2_DESTINATIONS; },
    isSourceLoaded: function(){ return ADMIN_ROUTE_SOURCE_LOADED; },
    applySettings: applyPassengerRouteSettings,
    cleanRouteLabel: cleanRouteLabel,
    normalizeRouteAlias: normalizeRouteAlias
  };

  var vehiclesApi = {
    getAll: function(){ return allBusPositions; },
    getPrimary: function(){ return lastPos; },
    getStatusInfo: getStatusInfo,
    getVehicleTs: getVehicleTs,
    getVehicleAgeSec: getVehicleAgeSec,
    resolveTripAssignment: resolvePassengerTripAssignment,
    choosePrimaryBus: choosePrimaryBus,
    setRawFeed: function(v){ rawBusPositions = v || {}; mergeVehicleFeeds(); },
    setLiveFeed: function(v){ liveVehiclePositions = v || {}; mergeVehicleFeeds(); }
  };

  var mapApi = {
    init: initPassengerMap,
    isReady: function(){ return mapReady; },
    refreshRoute: refreshPassengerMapRoute,
    loadRouteData: loadPassengerRouteData,
    renderRoute: renderRoutePolyline,
    renderStops: renderStationMarkers,
    refreshSize: refreshMapSizeSafely,
    updateVehicles: updateAllBusesOnMap,
    focusPoint: focusMap,
    focusOrigin: focusSelectedOrigin,
    focusRoute: fitSelectedRouteOnMap,
    forceFocusOrigin: forceFocusSelectedOriginAfterMapReady,
    getStopByName: getStopByName,
    getCurrentStops: curStops,
    getViewDir: function(){ return viewDir; },
    startUserLocation: startPassengerLocation,
    requestCurrentLocation: requestPassengerCurrentLocation,
    setFollowUser: setFollowUser,
    getFollowUser: function(){ return followUser; },
    setStopsFromCatalog: applyCatalogStopsToMap,
    applyLiveStopsData: applyPassengerRouteData
  };

  /* ────────────────────────────────────────────────────────────
     PUBLIC API
  ──────────────────────────────────────────────────────────── */
  global.SLPassengerLogic = {
    FIREBASE_CONFIG: FIREBASE_CONFIG,
    init: init,
    getApp: getApp,
    getDb: getDb,
    getStopsSorted: getStopsSorted,
    watchLiveVehicles: watchLiveVehicles,
    watchSettings: watchSettings,
    buildTransferBadges: buildTransferBadges,
    BUS_ICON_SRC: BUS_ICON_SRC,
    on: on,
    off: off,
    applyUnifiedCatalog: applyUnifiedCatalog,
    state: stateApi,
    schedule: scheduleApi,
    vehicles: vehiclesApi,
    map: mapApi
  };

  installLongdoShim();
})(typeof window !== 'undefined' ? window : globalThis);
