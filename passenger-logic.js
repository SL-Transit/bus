/**
 * passenger-logic.js
 * Logic layer for passenger.html
 *
 * passenger.html contains UX/UI only. All data access, Firebase paths,
 * and the map engine live here.
 *
 * Firebase project: sl-transit-9464e, same active project used by booking/check ticket.
 *
 * Governing principle (owner directive): passenger.html is a display-only
 * counter. It has no business logic or hard-coded rules of its own — it
 * only asks the ERP backend and renders whatever it is told. It must never
 * independently classify, restrict, or compute schedule/transfer decisions.
 *
 * Covers:
 *   [1] Firebase bootstrap (active project: sl-transit-9464e)
 *   [2] Firebase paths: passenger schedule reads use the
 *       publishedSchedule contract; legacy route/catalog/vehicle
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
    apiKey: "AIzaSyCkIm74ysuQ9Y2tFP9VkrGNvGg0a_LqeGg",
    authDomain: "sl-transit-9464e.firebaseapp.com",
    databaseURL: "https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "sl-transit-9464e",
    storageBucket: "sl-transit-9464e.firebasestorage.app",
    messagingSenderId: "480076551107",
    appId: "1:480076551107:android:f5929194925bc19fbfe376"
  };

  var _app = null;
  var _db = null;
  var _readyPromise = null;
  var _stopLiveVehicles = null;

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
      startLiveVehicleFeed();
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

  function applyLiveVehicleSnapshot(snapshot) {
    var raw = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : snapshot;
    var vehicles = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    updateAllBusesOnMap(vehicles);
    emit('vehiclesChanged', allBusPositions);
    return allBusPositions;
  }

  function startLiveVehicleFeed() {
    if (_stopLiveVehicles) return _stopLiveVehicles;
    var adapter = global.SLTransit && global.SLTransit.db;
    if (!adapter || typeof adapter.watchLiveVehicles !== 'function') {
      throw new Error('ERP live vehicle watcher unavailable');
    }
    _stopLiveVehicles = adapter.watchLiveVehicles(applyLiveVehicleSnapshot);
    return _stopLiveVehicles;
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
  var userLocationMarker = null;
  var busDisplayState = {};
  var stationMarkerOverlays = [];
  var knownRouteLinePoints = [];
  var routeRenderSeq = 0;
  var mapInitPromise = null;
  var followUser = true;
  var programmaticMapMoveUntil = 0;
  var STOPS_GO = [];
  var STOPS_BACK = [];
  var mapDisplayCenter = global.SLTransitMapDisplayCenter || null;
  if (!mapDisplayCenter && typeof require === 'function') {
    try { mapDisplayCenter = require('./map-display-center.js'); } catch (err) { mapDisplayCenter = null; }
  }

  function getMapDisplayCenter() {
    return global.SLTransitMapDisplayCenter || mapDisplayCenter;
  }

  // Schedule/fare data — starts empty; populated only from Firebase (no hardcode)
  var PASSENGER_ROUTE_DATA = null;

function curStops(){return viewDir==='go'?STOPS_GO:STOPS_BACK;}

function normalizeMapPoint(point) {
  var center = getMapDisplayCenter();
  var normalized = center && typeof center.normalizePoint === 'function'
    ? center.normalizePoint(point)
    : null;
  return normalized ? { lon: normalized.lng, lat: normalized.lat } : null;
}

function normalizeMapPolylinePoint(point) {
  var normalized = normalizeMapPoint(point);
  return normalized && isFinite(Number(normalized.lon)) && isFinite(Number(normalized.lat))
    ? normalized
    : null;
}

function normalizePublishedScheduleMapRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  return routes.map(function(route, index) {
    route = route || {};
    var polyline = Array.isArray(route.polyline)
      ? route.polyline.map(normalizeMapPolylinePoint).filter(Boolean)
      : [];
    return {
      routeViewId: route.routeViewId || ('map_route_' + index),
      geometryType: route.geometryType || '',
      referenceOnly: route.referenceOnly === true,
      operationalProof: route.operationalProof === true,
      previewDisplayMode: route.previewDisplayMode || 'static_map_reference',
      polyline: polyline
    };
  }).filter(function(route) {
    return route.geometryType === 'road_polyline' && route.polyline.length >= 2;
  });
}

function applyViewportPlan(plan) {
  if (!mapObj || !plan || plan.apply !== true || !plan.center) return;
  var point = normalizeMapPoint(plan.center);
  if (!point) return;
  try {
    programmaticMapMoveUntil = Date.now() + Number(plan.lockInteractionMs || 0);
    mapObj.location(point, plan.animate === true);
    if (plan.zoom) setTimeout(function(){ mapObj.zoom(plan.zoom, plan.animate === true); }, 80);
  } catch(e) { console.warn('Longdo focus failed:', e); }
}

function currentMapDisplayPoints() {
  return curStops().concat(Object.keys(allBusPositions || {}).map(function(id) {
    return allBusPositions[id];
  }));
}

function currentViewportPlan(animate) {
  var center = getMapDisplayCenter();
  if (!center || typeof center.planViewport !== 'function') return null;
  return center.planViewport({
    followEnabled: followUser,
    focusPoint: getStopByName(selOrigin),
    points: currentMapDisplayPoints(),
    animate: animate === true
  });
}

function applyCurrentViewportPlan(animate) {
  applyViewportPlan(currentViewportPlan(animate));
}

function focusMap(point, animate) {
  var center = getMapDisplayCenter();
  if (!center || typeof center.planViewport !== 'function') return;
  applyViewportPlan(center.planViewport({ focusPoint: point, animate: animate === true }));
}

function showUserLocation(point) {
  if (!mapObj || !mapReady || !global.longdo) return false;
  var normalized = normalizeMapPoint(point);
  if (!normalized) return false;
  try {
    if (userLocationMarker) mapObj.Overlays.remove(userLocationMarker);
  } catch(e) {}
  try {
    userLocationMarker = new longdo.Marker(normalized, {
      weight: longdo.OverlayWeight && longdo.OverlayWeight.Top,
      icon: {
        html: '<div class="map-user-location-marker"></div>',
        offset: { x: 14, y: 14 }
      }
    });
    mapObj.Overlays.add(userLocationMarker);
    return true;
  } catch(e2) {
    console.warn('Passenger user location marker failed:', e2 && e2.message ? e2.message : e2);
    return false;
  }
}

function pauseFollowForManualMapUse(reason) {
  var center = getMapDisplayCenter();
  if (!center || typeof center.planFollowInteraction !== 'function') return;
  var plan = center.planFollowInteraction({
    followEnabled: followUser,
    programmaticMoveUntil: programmaticMapMoveUntil,
    now: Date.now(),
    reason: reason
  });
  followUser = plan.followEnabled === true;
  if (!plan.changed) return;
  console.log('followUser paused by map interaction', plan.reason || '');
  emit('followChanged', followUser);
}

function getStopByName(name) {
  return STOPS_GO.concat(STOPS_BACK).find(function(s){ return s.name === name; }) || null;
}

function focusSelectedOrigin() {
  var stop = getStopByName(selOrigin);
  if (stop) focusMap(stop, true);
}

// ===== SCHEDULE — display-only =====
// Per owner directive: passenger.html must not decide anything about
// transfers, aliases, or which times are valid -- it only asks ERP and
// shows what it gets back. All of that (isLeg2Dest / normalizeRouteAlias /
// cleanRouteLabel / getLeg1TimesToTransferHub / disabled-time computation /
// the legacy data/settings.routes parser) has been removed. Passenger now
// reads one precomputed, ready-to-render node instead: publishedSchedule
// (schemaVersion publishedSchedule.v1, ERP Data Center active schedule
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
  return optionPairKey || null;
}

function resolveSchedulePairStorageKey(pairKey) {
  return pairKey && (PUBLISHED_SCHEDULE_PAIR_ALIASES[pairKey] || pairKey);
}

function cacheSchedulePair(storageKey, pair, requestedPairKey) {
  if (!pair || !storageKey) return null;
  PUBLISHED_SCHEDULE_PAIR_CACHE[storageKey] = pair;
  addPreviewPairAlias(PUBLISHED_SCHEDULE_PAIR_ALIASES, requestedPairKey, storageKey);
  addPreviewPairAlias(PUBLISHED_SCHEDULE_PAIR_ALIASES, pair.compatibilityPairKey, storageKey);
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
  if (!pairKey) return 'missing';
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
  if (!pairKey) return Promise.resolve(null);
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
    mapRoutes: normalizePublishedScheduleMapRoutes(mapView.routes),
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
    renderCurrentPassengerStops()
      .then(function() { applyCurrentViewportPlan(true); })
      .catch(function(err) {
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
      focusMap(point, true);
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
    var initialViewportPlan = getMapDisplayCenter().planViewport({
      points: currentMapDisplayPoints(),
      animate: false
    });
    var initialLocation = normalizeMapPoint(initialViewportPlan.center);
    mapObj = new longdo.Map({
      placeholder: document.getElementById('map'),
      zoom: initialViewportPlan.zoom,
      location: initialLocation
    });
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
        try { mapObj.Ui.Geolocation.visible(true); } catch(e){}
        console.log('Longdo map loaded');
        refreshMapSizeSafely();
        bindManualMapInteractionPause();
        renderCurrentPassengerStops()
          .then(function() { applyCurrentViewportPlan(false); })
          .catch(function(err) {
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
  var mapRoutes = PASSENGER_ROUTE_DATA && Array.isArray(PASSENGER_ROUTE_DATA.mapRoutes)
    ? PASSENGER_ROUTE_DATA.mapRoutes
    : [];
  var roadRoute = mapRoutes.find(function(route) {
    return route && route.geometryType === 'road_polyline' && Array.isArray(route.polyline) && route.polyline.length >= 2;
  });
  return {
    stations: curStops().slice(),
    polyline: roadRoute ? roadRoute.polyline.slice() : [],
    geometryType: roadRoute ? 'road_polyline' : 'missing_erp_map_route',
    routeViewId: roadRoute ? roadRoute.routeViewId : null
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
  var roadPolyline = routeData && routeData.geometryType === 'road_polyline' && Array.isArray(routeData.polyline)
    ? routeData.polyline.map(normalizeMapPolylinePoint).filter(Boolean)
    : [];
  if (roadPolyline.length < 2) {
    knownRouteLinePoints = [];
    try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
    routeLine = null;
    return Promise.resolve();
  }
  knownRouteLinePoints = roadPolyline.slice();
  try { if (routeLine) mapObj.Overlays.remove(routeLine); } catch(e){}
  try {
    routeLine = new longdo.Polyline(roadPolyline, {
      lineWidth: 5,
      lineColor: 'rgba(0, 117, 194, 0.88)',
      pointer: false
    });
    mapObj.Overlays.add(routeLine);
  } catch(e) {
    console.warn('ERP Map road polyline render failed:', e && e.message ? e.message : e);
    routeLine = null;
  }
  return Promise.resolve();
}

function placeBusMarkerAt(carId, latlng) {
  if (!mapReady || !mapObj || !latlng) return;
  var point = normalizeMapPoint(latlng);
  if (!point) return;

  var safeCarId = String(carId).replace(/[&<>"']/g, function(ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); });
  var busImgHtml = '<img src="' + BUS_ICON_SRC + '" alt="">';
  var label = String(carId);
  try { if (busMarkers[carId]) mapObj.Overlays.remove(busMarkers[carId]); } catch(e){}
  try { if (busTagMarkers[carId]) mapObj.Overlays.remove(busTagMarkers[carId]); } catch(e){}
  busMarkers[carId] = new longdo.Marker(point, {
    title: 'Vehicle ' + label,
    weight: longdo.OverlayWeight && longdo.OverlayWeight.Top,
    icon: { html: '<div class="map-bus-icon" onclick="window.selectPassengerBus(&quot;' + safeCarId + '&quot;)">' + busImgHtml + '</div>', offset: { x: 20, y: 20 } }
  });
  mapObj.Overlays.add(busMarkers[carId]);
  busTagMarkers[carId] = new longdo.Marker(point, {
    weight: longdo.OverlayWeight && longdo.OverlayWeight.Top,
    icon: { html: '<div class="map-bus-label" onclick="window.selectPassengerBus(&quot;' + safeCarId + '&quot;)">' + busImgHtml + label + '</div>', offset: { x: 10, y: -20 } }
  });
  mapObj.Overlays.add(busTagMarkers[carId]);
}

function updateAllBusesOnMap(buses) {
  allBusPositions = buses || {};
  if (!mapReady || !mapObj) return;
  var center = getMapDisplayCenter();
  if (!center || typeof center.prepareVehicleLayer !== 'function') return;
  var signals = Object.keys(buses || {}).map(function(id) {
    return Object.assign({ vehicleId: id }, buses[id] || {});
  });
  center.prepareVehicleLayer(signals, busDisplayState, { maxStepMeters: 250 }).forEach(function(item) {
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
  applyCurrentViewportPlan(true);
}

function removeBusFromMap(carId) {
  try { if (busMarkers[carId]) mapObj.Overlays.remove(busMarkers[carId]); } catch(e) {}
  try { if (busTagMarkers[carId]) mapObj.Overlays.remove(busTagMarkers[carId]); } catch(e) {}
  delete busMarkers[carId];
  delete busTagMarkers[carId];
  delete busDisplayState[carId];
}

  function setFollowUser(nextValue) {
    followUser = nextValue === true;
    emit('followChanged', followUser);
    if (followUser) applyCurrentViewportPlan(true);
  }


  // Passenger Preview no longer derives stop/order/map data from catalog
  // adapters. Approved display data comes from the publishedSchedule
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
    showUserLocation: showUserLocation,
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
