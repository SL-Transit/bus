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

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw",
    authDomain: "bus-booking-1d68c.firebaseapp.com",
    databaseURL: "https://bus-booking-1d68c-default-rtdb.firebaseio.com",
    projectId: "bus-booking-1d68c",
    storageBucket: "bus-booking-1d68c.firebasestorage.app",
    messagingSenderId: "481251007816",
    appId: "1:481251007816:web:d8554178d954e7de16e77d"
  };

  var _app = null;
  var _db = null;
  var _readyPromise = null;

  function init() {
    if (_readyPromise) return _readyPromise;
    try {
      _app = global.firebase.initializeApp(FIREBASE_CONFIG);
    } catch (e) {
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
  var BUS_ICON_SRC = 'assets/passenger-bus-icon.png';
  var viewDir = 'go';
  var mapObj = null, busMarkers = {}, busTagMarkers = {}, routeLine = null, mapReady = false;
  var busDisplayState = {};
  var stationMarkerOverlays = [];
  var knownRouteLinePoints = [];
  var routeRenderSeq = 0;
  var mapInitPromise = null;
  var followUser = true;
  var programmaticMapMoveUntil = 0;
  var STOPS_GO = [];
  var STOPS_BACK = [];

  // Schedule/fare data — starts empty; populated only from Firebase (no hardcode)
  var PASSENGER_ROUTE_DATA = null;

function curStops(){return viewDir==='go'?STOPS_GO:STOPS_BACK;}

function normalizeMapPoint(point) {
  if (!point) return null;
  var lat = Number(point.lat ?? point.latitude);
  var lon = Number(point.lon ?? point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lon: lon, lat: lat };
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
  return { byOrigin: byOrigin, pairKeys: pairKeys, hasOptions: Object.keys(byOrigin).length > 0 };
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
  return [];
}

function configurePublishedSchedule(node, includePairs) {
  PUBLISHED_SCHEDULE = node || null;
  PUBLISHED_SCHEDULE_LOAD_ERROR = !!(node && node.loadError);
  PUBLISHED_SCHEDULE_MAP_VIEW = PUBLISHED_SCHEDULE && PUBLISHED_SCHEDULE.mapView ? PUBLISHED_SCHEDULE.mapView : null;
  var destinationOptions = normalizePreviewDestinationOptionsByOrigin(PUBLISHED_SCHEDULE);
  PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN = destinationOptions.byOrigin;
  PUBLISHED_SCHEDULE_DESTINATION_OPTION_PAIR_KEYS = destinationOptions.pairKeys;
  PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN = destinationOptions.hasOptions;
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
  var destinationMap = {};
  if (!originLabel || !PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) return destinationMap;
  (PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN[originLabel] || []).forEach(function(option) {
    if (!option || !option.label) return;
    destinationMap[option.label] = Object.assign({}, option);
  });
  return destinationMap;
}

function getScheduleDestinationOptions(originLabel) {
  if (!originLabel || !PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) return [];
  return (PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN[originLabel] || []).map(function(option) {
    return Object.assign({}, option);
  });
}

function hasScheduleDestinationOptionsByOrigin() {
  return PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN === true;
}

function getScheduleDestinationLabels(originLabel) {
  if (!originLabel || !PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) return [];
  return (PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN[originLabel] || []).map(function(option) {
    return option.label;
  });
}

function getScheduleDestinationContractStatus(originLabel) {
  if (!PUBLISHED_SCHEDULE) return 'loading';
  if (PUBLISHED_SCHEDULE_LOAD_ERROR) return 'load_error';
  if (!PUBLISHED_SCHEDULE_HAS_DESTINATION_OPTIONS_BY_ORIGIN) return 'missing_destination_options';
  if (!originLabel) return 'missing_origin';
  if (!Object.prototype.hasOwnProperty.call(PUBLISHED_SCHEDULE_DESTINATION_OPTIONS_BY_ORIGIN, originLabel)) {
    return 'missing_origin_options';
  }
  return 'ready';
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
  var stations = [];
  mapView.stops.forEach(function(stop, index) {
    if (!stop || stop.visible === false) return;
    var lat = Number(stop.lat);
    var lng = Number(stop.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    var key = stop.stopKey || stop.groupStopId || ('map_stop_' + index);
    stations.push({
      stopKey: key,
      key: key,
      groupStopId: stop.groupStopId,
      groupStopCode: stop.groupStopCode,
      nodeId: stop.nodeId,
      stopNameTh: stop.label || stop.displayNameTh || stop.nameTh || key,
      name: stop.label || stop.displayNameTh || stop.nameTh || key,
      lat: lat,
      lng: lng,
      icon: stop.icon || '🚏',
      previewDisplayMode: stop.previewDisplayMode || 'static_map_reference',
      referenceOnly: stop.referenceOnly === true
    });
  });
  PASSENGER_ROUTE_DATA = {
    stations: stations,
    mapRoutes: [],
    source: 'publishedSchedule.mapView'
  };
  applyPassengerRouteData(PASSENGER_ROUTE_DATA);
}

function applyPassengerRouteData(data) {
  PASSENGER_ROUTE_DATA = data || null;
  var stations = data && Array.isArray(data.stations) ? data.stations : null;
  if (!stations) return;
  var nextStops = stations.map(function(stop, index) {
    if (!stop) return null;
    var lat = Number(stop.lat), lng = Number(stop.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    var key = stop.key || stop.stopKey || stop.groupStopId || ('map_stop_' + index);
    return {
      key: key,
      name: stop.nameTh || stop.stopNameTh || stop.name || key,
      lat: lat,
      lng: lng,
      icon: stop.icon || '\u{1F68F}',
      stopType: stop.stopType || 'main',
      note: stop.notes || stop.note || ''
    };
  }).filter(Boolean);
  if (!nextStops.length) return;
  STOPS_GO.splice.apply(STOPS_GO, [0, STOPS_GO.length].concat(nextStops));
  STOPS_BACK.splice.apply(STOPS_BACK, [0, STOPS_BACK.length].concat(nextStops));
  if (mapReady) {
    renderCurrentPassengerStops().catch(function(err) {
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
        renderCurrentPassengerStops().catch(function(err) {
          console.warn('Passenger mapView render failed:', err && err.message ? err.message : err);
        });
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
    stations: curStops().slice(),
    polyline: [],
    geometryType: 'stops_only'
  };
}

function loadPassengerRouteData() {
  if (PASSENGER_ROUTE_DATA && Array.isArray(PASSENGER_ROUTE_DATA.stations)) {
    return Promise.resolve(currentPassengerRouteData());
  }
  return Promise.resolve(currentPassengerRouteData());
}
function renderRoutePolyline(routeData) {
  return drawRoute(routeData);
}

function renderCurrentPassengerStops() {
  if (!mapReady || !mapObj) return Promise.resolve(null);
  return loadPassengerRouteData().then(function(routeData) {
    return renderRoutePolyline(routeData).then(function() {
      renderStationMarkers(routeData);
      refreshMapSizeSafely();
      return routeData;
    });
  });
}

async function refreshPassengerMapRoute() {
  await renderCurrentPassengerStops();
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

function drawRoute(routeData) {
  if (!mapReady) return Promise.resolve();
  const stops = routeData && Array.isArray(routeData.stations) ? routeData.stations : (viewDir==='go' ? STOPS_GO : STOPS_BACK);
  if (!Array.isArray(stops) || stops.length < 2) {
    knownRouteLinePoints = [];
    try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
    routeLine = null;
    return Promise.resolve();
  }
  knownRouteLinePoints = [];
  try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
  routeLine = null;
  return Promise.resolve();
}

function placeBusMarkerAt(carId, latlng) {
  if (!mapReady || !mapObj || !latlng) return;
  var existingBus = busMarkers[carId];
  var existingTag = busTagMarkers[carId];
  if (existingBus && existingTag && moveLongdoMarker(existingBus, latlng) && moveLongdoMarker(existingTag, latlng)) return;

  var safeCarId = String(carId).replace(/[&<>"']/g, function(ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); });
  var busImgHtml = '<img src="' + BUS_ICON_SRC + '" alt="">';
  var label = String(carId);
  try { if (busMarkers[carId]) mapObj.Overlays.remove(busMarkers[carId]); } catch(e){}
  try { if (busTagMarkers[carId]) mapObj.Overlays.remove(busTagMarkers[carId]); } catch(e){}
  busMarkers[carId] = new longdo.Marker(latlng, {
    title: 'Vehicle ' + label,
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

function updateAllBusesOnMap(buses) {
  if (!mapReady || !mapObj) return;
  allBusPositions = buses || {};
  if (window.SLTransitMapDisplayCenter && typeof window.SLTransitMapDisplayCenter.prepareVehicleLayer === 'function') {
    var signals = Object.keys(buses || {}).map(function(id) {
      return Object.assign({ vehicleId: id }, buses[id] || {});
    });
    window.SLTransitMapDisplayCenter.prepareVehicleLayer(signals, busDisplayState, { maxStepMeters: 250 }).forEach(function(item) {
      if (!item || !item.vehicle || !item.point) return;
      busDisplayState[item.vehicle.vehicleId] = { point: item.point };
      placeBusMarkerAt(item.vehicle.vehicleId, item.point);
    });
    Object.keys(busDisplayState).forEach(function(id) {
      if (!buses[id]) {
        delete busDisplayState[id];
        removeBusFromMap(id);
      }
    });
    return;
  }
  Object.keys(buses || {}).forEach(function(id) { updateBusOnMap(buses[id], id); });
}

function removeBusFromMap(carId) {
  try { if (busMarkers[carId]) mapObj.Overlays.remove(busMarkers[carId]); } catch(e) {}
  try { if (busTagMarkers[carId]) mapObj.Overlays.remove(busTagMarkers[carId]); } catch(e) {}
  delete busMarkers[carId];
  delete busTagMarkers[carId];
  delete busDisplayState[carId];
}

function updateBusOnMap(pos, carId) {
  if (!mapReady || !mapObj) return;
  pos = pos || {};
  carId = carId || pos.carId || pos.vehicleId || 'car1';
  var point = normalizeMapPoint(pos);
  if (!point) {
    removeBusFromMap(carId);
    return;
  }
  placeBusMarkerAt(carId, point);
}


  function setFollowUser(nextValue) {
    followUser = nextValue === true;
    emit('followChanged', followUser);
    if (followUser) focusSelectedOrigin();
  }


  // Passenger Preview no longer derives stop/order/map data from catalog
  // adapters. Approved display data comes from the publishedSchedule preview
  // contract; live runtime views stay unavailable until a new path is approved.
  function applyUnifiedCatalog(catalog) {
    return catalog;
  }

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
    getDestinationContractStatus: getScheduleDestinationContractStatus,
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
    getAll: function(){ return allBusPositions; }
  };

  var mapApi = {
    init: initPassengerMap,
    isReady: function(){ return mapReady; },
    refreshRoute: refreshPassengerMapRoute,
    loadRouteData: loadPassengerRouteData,
    renderRoute: renderRoutePolyline,
    renderStops: renderStationMarkers,
    renderCurrentStops: renderCurrentPassengerStops,
    refreshSize: refreshMapSizeSafely,
    updateVehicles: updateAllBusesOnMap,
    focusPoint: focusMap,
    focusOrigin: focusSelectedOrigin,

    forceFocusOrigin: forceFocusSelectedOriginAfterMapReady,
    getStopByName: getStopByName,
    getCurrentStops: curStops,
    getViewDir: function(){ return viewDir; },
    setFollowUser: setFollowUser,
    getFollowUser: function(){ return followUser; },
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
    watchSettings: watchSettings,
    BUS_ICON_SRC: BUS_ICON_SRC,
    on: on,
    off: off,
    applyUnifiedCatalog: applyUnifiedCatalog,
    state: stateApi,
    schedule: scheduleApi,
    vehicles: vehiclesApi,
    map: mapApi
  };
})(typeof window !== 'undefined' ? window : globalThis);
