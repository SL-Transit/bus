/**
 * passenger-logic.js
 * Logic layer for passenger.html
 *
 * passenger.html contains UX/UI only. All data access, Firebase paths,
 * and the map engine live here.
 *
 * *** TEMPORARY COMPATIBILITY ROLLBACK IN EFFECT *** — see FIREBASE_CONFIG
 * below and ai-handoffs/CENTRAL-REPORT.md. Currently pointed at the old
 * Firebase project (bus-booking-1d68c), same as booking.html/check_ticket.html.
 *
 * Governing principle (owner directive): passenger.html is a display-only
 * counter. It has no business logic or hard-coded rules of its own — it
 * only asks the ERP backend and renders whatever it is told. It must never
 * independently classify, restrict, or compute schedule/transfer decisions.
 *
 * Covers:
 *   [1] Firebase bootstrap (currently old project, see rollback note above)
 *   [2] Firebase paths: passenger schedule preview reads use the
 *       preview/publishedSchedule contract; legacy route/catalog/vehicle
 *       fallbacks are not used for Passenger Preview.
 *   [3] Map engine (Longdo Maps v3 — window.longdo, loaded via script tag in
 *       passenger.html) — Kalman filter, dead-reckoning prediction, marker/
 *       animation logic; the real Longdo API, not a shim.
 *   [4] Stops read from Firebase catalog, sorted by ERP's own .order field
 *       — no hardcoded stop coordinates, no passenger-side order guessing.
 *   [5] Live vehicle feed, normalized to what passenger.html expects.
 *   [6] Transfer options badge builder.
 *
 * SCHEDULE: passenger no longer computes routes/transfers/disabled-times
 * itself (isLeg2Dest/normalizeRouteAlias/cleanRouteLabel/
 * getLeg1TimesToTransferHub/the legacy data/settings.routes parser were all
 * removed). It reads one precomputed, ready-to-render node instead — see
 * getScheduleOrigins()/getScheduleDestinations()/getSchedulePair() below and
 * ai-handoffs/passenger-schedule-node-request.md for the requested shape.
 * Until ERP provides that node, the schedule UI shows "waiting for data".
 */
(function (global) {
  'use strict';

  /* ────────────────────────────────────────────────────────────
     [1] FIREBASE CONFIG
     *** TEMPORARY COMPATIBILITY ROLLBACK — see ai-handoffs/CENTRAL-REPORT.md ***
     sl-transit-9464e has no real apiKey/appId/messagingSenderId anywhere in
     the repo yet (same gap as admin-erp.html's own FIREBASE_CONFIG_NEW), and
     its catalog is still unseeded. Per owner approval, this config is
     temporarily pointed at the OLD project — the exact same project/config
     booking.html and check_ticket.html already use — so passenger.html shows
     real stops/schedule/live-vehicle data again while sl-transit-9464e isn't
     ready. This is NOT a backbone schema change: only this config object and
     the Firebase listener paths in passenger.html were changed to match.

     Revert to the sl-transit-9464e block (kept below, commented out) once:
       1. Real sl-transit-9464e apiKey/appId/messagingSenderId are available.
       2. Data Import AI's catalog/fleet/settings seed has been applied.
       3. Main Backbone Lead / Supervisor approves the cutover.
  ──────────────────────────────────────────────────────────── */
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw",
    authDomain: "bus-booking-1d68c.firebaseapp.com",
    databaseURL: "https://bus-booking-1d68c-default-rtdb.firebaseio.com",
    projectId: "bus-booking-1d68c",
    storageBucket: "bus-booking-1d68c.firebasestorage.app",
    messagingSenderId: "481251007816",
    appId: "1:481251007816:web:d8554178d954e7de16e77d"
  };

  // Schema v3 config — restore this (and the Schema v3 paths in
  // passenger.html's Firebase listener block) once the 3 conditions above
  // are met:
  // var FIREBASE_CONFIG = {
  //   apiKey: 'TODO_FROM_FIREBASE_CONSOLE',
  //   authDomain: 'sl-transit-9464e.firebaseapp.com',
  //   databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app',
  //   projectId: 'sl-transit-9464e',
  //   storageBucket: 'sl-transit-9464e.firebasestorage.app',
  //   messagingSenderId: 'TODO_FROM_FIREBASE_CONSOLE',
  //   appId: 'TODO_FROM_FIREBASE_CONSOLE'
  // };

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

  /* NOTE: map engine below calls the real Longdo Maps API (window.longdo)
     directly — Map / Marker / Polyline / Overlays / Ui / Event.bind are all
     genuine Longdo Maps v3 methods, loaded via the Longdo script tag in
     passenger.html. This file only separates that logic out of the page;
     it does not replace or wrap the Longdo API. */

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
  var PASSENGER_ROUTE_DATA = null;

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
  if (mapReady && Object.keys(allBusPositions).length) {
    updateAllBusesOnMap(allBusPositions);
  }
  emit('vehiclesUpdated', { all: allBusPositions, latestTs: getLatestVehicleTs(allBusPositions) });
}

function getLatestVehicleTs(buses) {
  var latest = null;
  Object.keys(buses || {}).forEach(function(id) {
    var ts = getVehicleTs(buses[id]);
    if (ts && (!latest || ts > latest)) latest = ts;
  });
  return latest;
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

// ===== SCHEDULE — display-only =====
// Per owner directive: passenger.html must not decide anything about
// transfers, aliases, or which times are valid -- it only asks ERP and
// shows what it gets back. All of that (isLeg2Dest / normalizeRouteAlias /
// cleanRouteLabel / getLeg1TimesToTransferHub / disabled-time computation /
// the legacy data/settings.routes parser) has been removed. Passenger now
// reads one precomputed, ready-to-render node instead: preview/publishedSchedule
// (schemaVersion publishedSchedule.v1.preview, ERP Data Center Round 2 preview
// output -- dryRun/writesEnabled=false, readyForApply=false at the source).
// Pair lookup key is "<originLabel>__<destLabel>", matching the generator's
// compatibilityPairKey(). Only pairs in PUBLISHED_SCHEDULE.pairs are ever
// read -- excludedPreviewPairs (transferUnknown/transferInfeasible) are never
// consulted, so those never surface as selectable journeys.
var PUBLISHED_SCHEDULE = null;
var PUBLISHED_SCHEDULE_DESTINATIONS = {};
var PUBLISHED_SCHEDULE_DESTINATION_LABELS = [];
var PUBLISHED_SCHEDULE_DESTINATIONS_BY_ORIGIN = {};
var PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN = {};
var PUBLISHED_SCHEDULE_DESTINATION_OPTION_PAIR_KEYS = {};
var PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN = false;
var PUBLISHED_SCHEDULE_PAIR_ALIASES = {};
var PUBLISHED_SCHEDULE_PAIR_CACHE = {};
var PUBLISHED_SCHEDULE_PAIR_LOADS = {};
var PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS = {};
var PUBLISHED_SCHEDULE_PAIR_LOADER = null;
var PUBLISHED_SCHEDULE_LOAD_ERROR = false;
var PUBLISHED_SCHEDULE_MAP_VIEW = null;

function previewEncodingIndex(node, name) {
  return node && node.firebaseKeyEncoding && node.firebaseKeyEncoding.encodedKeyIndex
    ? (node.firebaseKeyEncoding.encodedKeyIndex[name] || {})
    : {};
}

function isEncodedPreviewKey(value) {
  return /^k_/.test(String(value || ''));
}

function displayLabelFromPreviewEntry(key, entry, index) {
  if (entry && typeof entry === 'object') {
    return entry.label || entry.displayNameTh || entry.destinationLabel || entry.nameTh || index[key] || key;
  }
  return index[key] || key;
}

function normalizePreviewDestinations(node) {
  var raw = node && node.destinations ? node.destinations : {};
  var index = previewEncodingIndex(node, 'destinations');
  var originOrder = {};
  (Array.isArray(node && node.origins) ? node.origins : []).forEach(function(label, idx) {
    originOrder[label] = idx;
  });
  var normalized = {};
  Object.keys(raw).forEach(function(key) {
    var entry = raw[key];
    var label = displayLabelFromPreviewEntry(key, entry, index);
    if (!label || isEncodedPreviewKey(label)) return;
    normalized[label] = (entry && typeof entry === 'object') ? Object.assign({}, entry) : {};
    normalized[label].label = normalized[label].label || label;
    normalized[label].destinationLabel = normalized[label].destinationLabel || label;
    normalized[label].firebaseKey = key;
    if (!isFinite(Number(normalized[label].displayOrder)) && originOrder[label] != null) {
      normalized[label].displayOrder = originOrder[label];
    }
  });
  return normalized;
}

function destinationGroupLabel(entry) {
  return entry && (entry.group || entry.groupLabel || entry.groupName || entry.destinationGroup || entry.routeGroup) || null;
}

function destinationOrderValue(label, entry, fallback) {
  var candidates = [
    entry && entry.displayOrder,
    entry && entry.groupStopCode,
    entry && entry.order,
    entry && entry.sortOrder
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = Number(candidates[i]);
    if (isFinite(value)) return value;
  }
  return fallback;
}

function normalizePreviewDestinationLabels(destinations) {
  var labels = Object.keys(destinations || {});
  labels.sort(function(a, b) {
    var ga = destinationGroupLabel(destinations[a]);
    var gb = destinationGroupLabel(destinations[b]);
    var mainA = ga ? 1 : 0;
    var mainB = gb ? 1 : 0;
    if (mainA !== mainB) return mainA - mainB;
    if (ga !== gb) return String(ga || '').localeCompare(String(gb || ''), 'th');
    var oa = destinationOrderValue(a, destinations[a], Number.MAX_SAFE_INTEGER);
    var ob = destinationOrderValue(b, destinations[b], Number.MAX_SAFE_INTEGER);
    if (oa !== ob) return oa - ob;
    return String(a || '').localeCompare(String(b || ''), 'th');
  });
  return labels;
}

function decodedPreviewPairKey(node, key, pair) {
  if (pair && pair.compatibilityPairKey) return pair.compatibilityPairKey;
  var pairIndex = previewEncodingIndex(node, 'pairs');
  var compatibilityIndex = previewEncodingIndex(node, 'compatibilityKeyIndex');
  return pairIndex[key] || compatibilityIndex[key] || key;
}

function previewPairLabels(node, key, pair) {
  var origin = pair && pair.originLabel;
  var dest = pair && pair.destinationLabel;
  if ((!origin || !dest) && pair && pair.displayPairKey && String(pair.displayPairKey).indexOf('__') > -1) {
    var displayParts = String(pair.displayPairKey).split('__');
    origin = origin || displayParts[0];
    dest = dest || displayParts.slice(1).join('__');
  }
  if ((!origin || !dest)) {
    var pairKey = decodedPreviewPairKey(node, key, pair);
    if (pairKey && String(pairKey).indexOf('__') > -1) {
      var parts = String(pairKey).split('__');
      origin = origin || parts[0];
      dest = dest || parts.slice(1).join('__');
    }
  }
  if (!origin || !dest || isEncodedPreviewKey(origin) || isEncodedPreviewKey(dest)) return null;
  return { origin: origin, dest: dest };
}

function normalizePreviewDestinationsByOrigin(node, destinations) {
  var byOrigin = {};
  Object.keys(node && node.pairs || {}).forEach(function(key) {
    var pair = node.pairs[key] || {};
    var labels = previewPairLabels(node, key, pair);
    if (!labels || !destinations[labels.dest]) return;
    if (!byOrigin[labels.origin]) byOrigin[labels.origin] = {};
    byOrigin[labels.origin][labels.dest] = true;
  });
  Object.keys(byOrigin).forEach(function(origin) {
    var subset = {};
    Object.keys(byOrigin[origin]).forEach(function(label) {
      if (label !== origin && destinations[label]) subset[label] = destinations[label];
    });
    byOrigin[origin] = normalizePreviewDestinationLabels(subset);
  });
  return byOrigin;
}

function normalizePreviewDestinationOptionsByOrigin(node) {
  var raw = node && node.destinationOptionsByOrigin ? node.destinationOptionsByOrigin : null;
  var originIndex = previewEncodingIndex(node, 'destinationOptionsByOrigin');
  var byOrigin = {};
  var pairKeys = {};
  if (!raw || typeof raw !== 'object') return { byOrigin: byOrigin, pairKeys: pairKeys, hasOptions: false };
  Object.keys(raw).forEach(function(originKey) {
    var originLabel = originIndex[originKey] || originKey;
    if (!originLabel || isEncodedPreviewKey(originLabel)) return;
    var options = Array.isArray(raw[originKey]) ? raw[originKey] : [];
    byOrigin[originLabel] = [];
    pairKeys[originLabel] = {};
    options.forEach(function(option) {
      if (!option || typeof option !== 'object') return;
      var label = option.label || option.destinationLabel || option.displayNameTh;
      if (!label || isEncodedPreviewKey(label)) return;
      var normalized = Object.assign({}, option);
      normalized.label = label;
      normalized.destinationLabel = normalized.destinationLabel || label;
      byOrigin[originLabel].push(normalized);
      if (normalized.pairKey) pairKeys[originLabel][label] = normalized.pairKey;
    });
  });
  return { byOrigin: byOrigin, pairKeys: pairKeys, hasOptions: Object.keys(raw).length > 0 };
}

function addPreviewPairAlias(aliases, fromKey, toKey) {
  if (fromKey && toKey && fromKey !== toKey) aliases[fromKey] = toKey;
}

function normalizePreviewPairAliases(node) {
  var aliases = {};
  var pairIndex = previewEncodingIndex(node, 'pairs');
  var compatibilityIndex = previewEncodingIndex(node, 'compatibilityKeyIndex');
  Object.keys(pairIndex).forEach(function(encodedKey) {
    addPreviewPairAlias(aliases, pairIndex[encodedKey], encodedKey);
  });
  Object.keys(compatibilityIndex).forEach(function(encodedKey) {
    addPreviewPairAlias(aliases, compatibilityIndex[encodedKey], encodedKey);
  });
  Object.keys(node && node.compatibilityKeyIndex || {}).forEach(function(key) {
    var entry = node.compatibilityKeyIndex[key] || {};
    addPreviewPairAlias(aliases, entry.compatibilityPairKey, key);
    addPreviewPairAlias(aliases, entry.displayPairKey, key);
  });
  Object.keys(node && node.pairs || {}).forEach(function(key) {
    var pair = node.pairs[key] || {};
    addPreviewPairAlias(aliases, pair.compatibilityPairKey, key);
    if (pair.originLabel && pair.destinationLabel) {
      addPreviewPairAlias(aliases, pair.originLabel + '__' + pair.destinationLabel, key);
    }
  });
  var originIndex = previewEncodingIndex(node, 'destinationOptionsByOrigin');
  Object.keys(node && node.destinationOptionsByOrigin || {}).forEach(function(originKey) {
    var originLabel = originIndex[originKey] || originKey;
    if (!originLabel || isEncodedPreviewKey(originLabel)) return;
    var options = Array.isArray(node.destinationOptionsByOrigin[originKey]) ? node.destinationOptionsByOrigin[originKey] : [];
    options.forEach(function(option) {
      if (!option || !option.pairKey) return;
      addPreviewPairAlias(aliases, option.pairKey, option.pairKey);
      if (option.label) addPreviewPairAlias(aliases, originLabel + '__' + option.label, option.pairKey);
      if (option.destinationLabel) addPreviewPairAlias(aliases, originLabel + '__' + option.destinationLabel, option.pairKey);
    });
  });
  return aliases;
}

function resetPublishedSchedulePairLoads() {
  PUBLISHED_SCHEDULE_PAIR_LOADS = {};
  PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS = {};
}

function normalizePreviewOrigins(node) {
  if (node && Array.isArray(node.originOptions) && node.originOptions.length) {
    return node.originOptions.map(function(option) {
      if (option && typeof option === 'object') return option.label || option.originLabel || option.displayNameTh || option.nameTh;
      return option;
    }).filter(function(label) {
      return label && !isEncodedPreviewKey(label);
    });
  }
  return (node && Array.isArray(node.origins)) ? node.origins.slice() : [];
}

function configurePublishedSchedule(node, includePairs) {
  PUBLISHED_SCHEDULE = node || null;
  PUBLISHED_SCHEDULE_LOAD_ERROR = !!(node && node.loadError);
  PUBLISHED_SCHEDULE_MAP_VIEW = PUBLISHED_SCHEDULE && PUBLISHED_SCHEDULE.mapView ? PUBLISHED_SCHEDULE.mapView : null;
  PUBLISHED_SCHEDULE_DESTINATIONS = normalizePreviewDestinations(PUBLISHED_SCHEDULE);
  PUBLISHED_SCHEDULE_DESTINATION_LABELS = normalizePreviewDestinationLabels(PUBLISHED_SCHEDULE_DESTINATIONS);
  var destinationOptions = normalizePreviewDestinationOptionsByOrigin(PUBLISHED_SCHEDULE);
  PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN = destinationOptions.byOrigin;
  PUBLISHED_SCHEDULE_DESTINATION_OPTION_PAIR_KEYS = destinationOptions.pairKeys;
  PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN = destinationOptions.hasOptions;
  PUBLISHED_SCHEDULE_DESTINATIONS_BY_ORIGIN = PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN
    ? {}
    : normalizePreviewDestinationsByOrigin(PUBLISHED_SCHEDULE, PUBLISHED_SCHEDULE_DESTINATIONS);
  PUBLISHED_SCHEDULE_PAIR_ALIASES = normalizePreviewPairAliases(PUBLISHED_SCHEDULE);
  PUBLISHED_SCHEDULE_PAIR_CACHE = includePairs && PUBLISHED_SCHEDULE && PUBLISHED_SCHEDULE.pairs
    ? Object.assign({}, PUBLISHED_SCHEDULE.pairs)
    : {};
  resetPublishedSchedulePairLoads();
  applyPublishedScheduleMapView(PUBLISHED_SCHEDULE_MAP_VIEW);
  emit('scheduleUpdated');
}

function applyPublishedSchedule(node) {
  configurePublishedSchedule(node, true);
}

function applyPublishedScheduleOptions(node) {
  configurePublishedSchedule(node, false);
}

function getScheduleOrigins() {
  return normalizePreviewOrigins(PUBLISHED_SCHEDULE);
}

function getScheduleDestinations(originLabel) {
  if (originLabel && PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) {
    var destinationMap = {};
    (PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN[originLabel] || []).forEach(function(option) {
      if (!option || !option.label) return;
      destinationMap[option.label] = Object.assign({}, option);
    });
    return destinationMap;
  }
  return PUBLISHED_SCHEDULE_DESTINATIONS;
}

function getScheduleDestinationOptions(originLabel) {
  if (originLabel && PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) {
    return (PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN[originLabel] || []).map(function(option) {
      return Object.assign({}, option);
    });
  }
  return getScheduleDestinationLabels(originLabel).map(function(label) {
    return Object.assign({ label: label, destinationLabel: label }, PUBLISHED_SCHEDULE_DESTINATIONS[label] || {});
  });
}

function hasScheduleDestinationOptionsByOrigin() {
  return PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN === true;
}

function getScheduleDestinationLabels(originLabel) {
  if (originLabel && PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) {
    return (PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN[originLabel] || []).map(function(option) {
      return option.label;
    });
  }
  if (originLabel && PUBLISHED_SCHEDULE_DESTINATIONS_BY_ORIGIN[originLabel]) {
    return PUBLISHED_SCHEDULE_DESTINATIONS_BY_ORIGIN[originLabel].slice();
  }
  return PUBLISHED_SCHEDULE_DESTINATION_LABELS.slice();
}

function getSchedulePairKey(originLabel, destLabel) {
  var optionPairKey = originLabel && destLabel && PUBLISHED_SCHEDULE_DESTINATION_OPTION_PAIR_KEYS[originLabel]
    ? PUBLISHED_SCHEDULE_DESTINATION_OPTION_PAIR_KEYS[originLabel][destLabel]
    : null;
  return optionPairKey || (originLabel + '__' + destLabel);
}

function resolveSchedulePairStorageKey(pairKey) {
  return pairKey && (PUBLISHED_SCHEDULE_PAIR_ALIASES[pairKey] || pairKey);
}

function cacheSchedulePair(storageKey, pair, requestedPairKey) {
  if (!pair || !storageKey) return null;
  PUBLISHED_SCHEDULE_PAIR_CACHE[storageKey] = pair;
  addPreviewPairAlias(PUBLISHED_SCHEDULE_PAIR_ALIASES, requestedPairKey, storageKey);
  addPreviewPairAlias(PUBLISHED_SCHEDULE_PAIR_ALIASES, pair.compatibilityPairKey, storageKey);
  if (pair.originLabel && pair.destinationLabel) {
    addPreviewPairAlias(PUBLISHED_SCHEDULE_PAIR_ALIASES, pair.originLabel + '__' + pair.destinationLabel, storageKey);
  }
  return pair;
}

function getSchedulePair(originLabel, destLabel) {
  if (!PUBLISHED_SCHEDULE) return null;
  var pairKey = getSchedulePairKey(originLabel, destLabel);
  var resolvedKey = resolveSchedulePairStorageKey(pairKey);
  return resolvedKey ? (PUBLISHED_SCHEDULE_PAIR_CACHE[resolvedKey] || null) : null;
}

function getSchedulePairLoadStatus(originLabel, destLabel) {
  var pairKey = getSchedulePairKey(originLabel, destLabel);
  var resolvedKey = resolveSchedulePairStorageKey(pairKey);
  if (resolvedKey && PUBLISHED_SCHEDULE_PAIR_CACHE[resolvedKey]) return 'loaded';
  return PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] || PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[resolvedKey] || 'idle';
}

function setSchedulePairLoader(loader) {
  PUBLISHED_SCHEDULE_PAIR_LOADER = typeof loader === 'function' ? loader : null;
}

function loadSchedulePair(originLabel, destLabel) {
  if (!PUBLISHED_SCHEDULE) return Promise.resolve(null);
  var pairKey = getSchedulePairKey(originLabel, destLabel);
  var storageKey = resolveSchedulePairStorageKey(pairKey);
  if (!storageKey) {
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] = 'missing';
    return Promise.resolve(null);
  }
  if (PUBLISHED_SCHEDULE_PAIR_CACHE[storageKey]) return Promise.resolve(PUBLISHED_SCHEDULE_PAIR_CACHE[storageKey]);
  if (!PUBLISHED_SCHEDULE_PAIR_LOADER) {
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] = 'missing';
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[storageKey] = 'missing';
    return Promise.resolve(null);
  }
  if (PUBLISHED_SCHEDULE_PAIR_LOADS[storageKey]) return PUBLISHED_SCHEDULE_PAIR_LOADS[storageKey];
  PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] = 'loading';
  PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[storageKey] = 'loading';
  PUBLISHED_SCHEDULE_PAIR_LOADS[storageKey] = Promise.resolve(PUBLISHED_SCHEDULE_PAIR_LOADER(storageKey, {
    pairKey: pairKey,
    originLabel: originLabel,
    destinationLabel: destLabel
  })).then(function(pair) {
    delete PUBLISHED_SCHEDULE_PAIR_LOADS[storageKey];
    if (!pair) {
      PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] = 'missing';
      PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[storageKey] = 'missing';
      emit('schedulePairUpdated');
      return null;
    }
    var cached = cacheSchedulePair(storageKey, pair, pairKey);
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] = 'loaded';
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[storageKey] = 'loaded';
    emit('schedulePairUpdated');
    return cached;
  }).catch(function(err) {
    delete PUBLISHED_SCHEDULE_PAIR_LOADS[storageKey];
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[pairKey] = 'error';
    PUBLISHED_SCHEDULE_PAIR_LOAD_STATUS[storageKey] = 'error';
    emit('schedulePairUpdated');
    throw err;
  });
  return PUBLISHED_SCHEDULE_PAIR_LOADS[storageKey];
}

function isScheduleReady() {
  return !!PUBLISHED_SCHEDULE;
}

function hasPublishedScheduleLoadError() {
  return PUBLISHED_SCHEDULE_LOAD_ERROR === true;
}

function applyPublishedScheduleMapView(mapView) {
  if (!mapView || !Array.isArray(mapView.stops)) {
    PASSENGER_ROUTE_DATA = null;
    STOPS_GO = [];
    STOPS_BACK = [];
    return;
  }
  var stops = {};
  mapView.stops.forEach(function(stop, index) {
    if (!stop || stop.visible === false) return;
    var lat = Number(stop.lat);
    var lng = Number(stop.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    var key = stop.stopKey || stop.groupStopId || ('map_stop_' + index);
    stops[key] = {
      stopKey: key,
      groupStopId: stop.groupStopId,
      groupStopCode: stop.groupStopCode,
      nodeId: stop.nodeId,
      stopNameTh: stop.label || stop.displayNameTh || stop.nameTh || key,
      name: stop.label || stop.displayNameTh || stop.nameTh || key,
      lat: lat,
      lng: lng,
      icon: stop.icon || '🚏',
      order: Number.isFinite(Number(stop.displayOrder)) ? Number(stop.displayOrder) : index,
      previewDisplayMode: stop.previewDisplayMode || 'static_map_reference',
      referenceOnly: stop.referenceOnly === true
    };
  });
  PASSENGER_ROUTE_DATA = {
    stops: stops,
    mapRoutes: Array.isArray(mapView.routes) ? mapView.routes : [],
    source: 'publishedSchedule.mapView'
  };
  applyPassengerRouteData(PASSENGER_ROUTE_DATA);
}

function applyPassengerRouteData(data) {
  PASSENGER_ROUTE_DATA = data || null;
  var stops = data && data.stops ? data.stops : null;
  if (!stops) return;
  // Ordering is entirely ERP's responsibility now (data/catalog/stops[].order,
  // maintained by Main Backbone/Data Import AI per stop-sequence task) --
  // passenger no longer guesses order from stop names when it's missing.
  var order = Object.keys(stops).sort(function(a,b) {
    var ai = Number(stops[a] && stops[a].order);
    var bi = Number(stops[b] && stops[b].order);
    if (!isFinite(ai)) ai = 999999;
    if (!isFinite(bi)) bi = 999999;
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
  var route = PASSENGER_ROUTE_DATA && Array.isArray(PASSENGER_ROUTE_DATA.mapRoutes) && PASSENGER_ROUTE_DATA.mapRoutes[0]
    ? PASSENGER_ROUTE_DATA.mapRoutes[0]
    : null;
  return {
    stations: curStops().slice(),
    polyline: route && Array.isArray(route.polyline) ? route.polyline.slice() : []
  };
}

function loadPassengerRouteData() {
  if (PASSENGER_ROUTE_DATA && PASSENGER_ROUTE_DATA.stops) {
    return Promise.resolve(currentPassengerRouteData());
  }
  return Promise.resolve(currentPassengerRouteData());
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
      // NOTE: transfer-options badges (SLPassengerLogic.buildTransferBadges) are
      // available per-stop but not yet wired into a Longdo-native popup here —
      // Longdo Marker has no bindPopup() like Leaflet; add via longdo.Marker's
      // own popup option or a custom overlay if this is wanted again.
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
  if (!Array.isArray(stops) || stops.length < 2) {
    knownRouteLinePoints = [];
    try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
    routeLine = null;
    return Promise.resolve();
  }
  if (routeData && Array.isArray(routeData.polyline) && routeData.polyline.length >= 2) {
    const renderSeq = ++routeRenderSeq;
    const pts = routeData.polyline.map(function(point) { return normalizeMapPoint(point); }).filter(Boolean);
    if (pts.length >= 2) {
      knownRouteLinePoints = pts;
      try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
      routeLine = new longdo.Polyline(pts, { lineColor: viewDir==='go' ? '#1e40af' : '#dc2626', lineWidth: 5, lineOpacity: 0.82 });
      if (renderSeq === routeRenderSeq) mapObj.Overlays.add(routeLine);
      return Promise.resolve();
    }
  }
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

  // Passenger Preview no longer derives stop/order/map data from catalog
  // adapters. Approved display data comes from the publishedSchedule preview
  // contract; live runtime views stay unavailable until a new path is approved.
  function applyUnifiedCatalog(catalog) {
    return catalog;
  }

  /* ────────────────────────────────────────────────────────────
     PDPA — LOCATION CONSENT
     Passenger GPS position is used only to draw "my position" on the
     passenger's own device map and to auto-center it — it is never
     sent to Firebase or any server (see requestPassengerCurrentLocation /
     startPassengerLocation above: passengerPos stays in local memory
     only). This module just gates *when* we ask the browser for that
     GPS permission, so the passenger sees our own plain-language notice
     before the OS permission prompt (PDPA §23 notice-at-collection),
     and can decline without losing any other feature of the page.
  ──────────────────────────────────────────────────────────── */
  var LOCATION_CONSENT_KEY = 'slTransitLocationConsent';
  var LOCATION_NOTICE_TEXT = 'แอปนี้ขอเข้าถึงตำแหน่งของคุณ เพื่อแสดงตำแหน่งของคุณบนแผนที่และช่วยหาป้ายที่ใกล้ที่สุด ตำแหน่งของคุณจะถูกใช้บนอุปกรณ์นี้เท่านั้น ไม่ถูกส่งหรือบันทึกไว้ที่เซิร์ฟเวอร์ของเรา';

  function getLocationConsent() {
    try { return global.localStorage.getItem(LOCATION_CONSENT_KEY); } catch(e) { return null; }
  }
  function setLocationConsent(value) {
    try { global.localStorage.setItem(LOCATION_CONSENT_KEY, value); } catch(e) {}
  }

  var privacyApi = {
    NOTICE_TEXT: LOCATION_NOTICE_TEXT,
    getConsentStatus: function(){ return getLocationConsent(); }, // 'granted' | 'declined' | null (not yet decided)
    grantLocationConsent: function(){ setLocationConsent('granted'); },
    declineLocationConsent: function(){ setLocationConsent('declined'); }
  };


  var stateApi = {
    getOrigin: function(){ return selOrigin; },
    setOrigin: function(v){ selOrigin = v || ''; },
    getDest: function(){ return selDest; },
    setDest: function(v){ selDest = v || ''; }
  };

  var scheduleApi = {
    getOrigins: getScheduleOrigins,
    getDestinations: getScheduleDestinations,
    getDestinationOptions: getScheduleDestinationOptions,
    hasDestinationOptionsByOrigin: hasScheduleDestinationOptionsByOrigin,
    getDestinationLabels: getScheduleDestinationLabels,
    getPair: getSchedulePair,
    getPairLoadStatus: getSchedulePairLoadStatus,
    setPairLoader: setSchedulePairLoader,
    loadPair: loadSchedulePair,
    hasLoadError: hasPublishedScheduleLoadError,
    isReady: isScheduleReady,
    applyPublishedSchedule: applyPublishedSchedule,
    applyPublishedScheduleOptions: applyPublishedScheduleOptions
  };

  var vehiclesApi = {
    getAll: function(){ return allBusPositions; },
    getLatestTs: function(){ return getLatestVehicleTs(allBusPositions); },
    getVehicleTs: getVehicleTs,
    getVehicleAgeSec: getVehicleAgeSec,
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
    map: mapApi,
    privacy: privacyApi
  };
})(typeof window !== 'undefined' ? window : globalThis);
