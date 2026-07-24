/**
 * driver-map-logic.js
 * Logic for driver-map.html — the driver-facing live map.
 *
 * Governing principle (same as passenger-logic.js): this page is a
 * display-only counter. It has no hardcoded stop coordinates, route
 * geometry, or marker-animation behavior of its own — it only asks the
 * ERP backend (Firebase) and renders whatever it is told. The Android
 * driver app does not embed any copy of this markup/CSS/behavior; it
 * simply loads this real hosted page in a WebView and calls
 * window.setDriverPosition(lat, lng) with the device's live GPS fix,
 * which is the one thing only the native app can supply.
 *
 * Firebase project: sl-transit-9464e (same active project as passenger.html).
 *
 * Firebase paths read (all live listeners, not one-time reads, so any
 * central change takes effect immediately with zero app changes):
 *   - data/erpDataCenter/catalog/stops        (stop pins: lat/lng/name/icon/order)
 *   - publishedSchedule/mapView/routes        (real road-following route polyline)
 *   - data/erpDataCenter/settings/driverMap   (animation/zoom/initial-view config)
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

  var STOPS_PATH = 'data/erpDataCenter/catalog/stops';
  var ROUTES_PATH = 'publishedSchedule/mapView/routes';
  var DRIVER_MAP_CONFIG_PATH = 'data/erpDataCenter/settings/driverMap';

  var map = null;
  var db = null;
  var driverMarker = null;
  var stopMarkers = [];
  var routeLine = null;
  var firstFix = true;
  var initialViewApplied = false;
  var lastLat = null, lastLng = null;
  var followMode = false;
  var animReq = null;

  // cfg มาจาก data/erpDataCenter/settings/driverMap เท่านั้น — ไม่มีค่าเริ่มต้นที่ "ตัดสินใจ" ไว้ล่วงหน้า
  // จนกว่าจะได้ค่าจริงจาก ERP, พฤติกรรมที่ยังไม่ระบุจะ fallback เป็นแบบไม่มีอนิเมชั่น/ซูมค้างตามที่ Leaflet
  // กำหนดเองตามธรรมชาติ ไม่ใช่ค่าที่แอพ/หน้านี้เดาเอาเอง
  var cfg = {
    animationEnabled: null,
    animationDurationMs: null,
    followZoomLevel: null,
    initialZoom: null,
    initialCenterLat: null,
    initialCenterLng: null
  };

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  function initMap() {
    map = L.map('map', { zoomControl: true }).setView([13.75, 101.4], 9); // มุมมองตั้งต้นชั่วคราว จนกว่า config/GPS จริงจะมาถึง
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var locateBtn = document.getElementById('locateBtn');
    locateBtn.addEventListener('click', function () {
      followMode = !followMode;
      locateBtn.classList.toggle('active', followMode);
      if (followMode && lastLat !== null) {
        var z = cfg.followZoomLevel != null ? cfg.followZoomLevel : 15;
        map.flyTo([lastLat, lastLng], z, { duration: 0.8 });
      }
    });
    ['dragstart', 'wheel', 'touchstart'].forEach(function (ev) {
      map.on(ev, function () {
        if (followMode) { followMode = false; locateBtn.classList.remove('active'); }
      });
    });
  }

  function applyInitialViewIfPossible() {
    if (!initialViewApplied && firstFix && cfg.initialCenterLat != null && cfg.initialCenterLng != null) {
      map.setView([cfg.initialCenterLat, cfg.initialCenterLng], cfg.initialZoom != null ? cfg.initialZoom : map.getZoom());
      initialViewApplied = true;
    }
  }

  function animateMarkerTo(fromLat, fromLng, toLat, toLng) {
    var enabled = cfg.animationEnabled !== false; // ปิดอนิเมชั่นได้เฉพาะเมื่อ ERP ตั้งค่า false อย่างชัดเจน
    if (!enabled) {
      driverMarker.setLatLng([toLat, toLng]);
      if (followMode) map.panTo([toLat, toLng], { animate: false });
      return;
    }
    var duration = cfg.animationDurationMs != null ? cfg.animationDurationMs : 900;
    if (animReq) cancelAnimationFrame(animReq);
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var lat = fromLat + (toLat - fromLat) * p;
      var lng = fromLng + (toLng - fromLng) * p;
      driverMarker.setLatLng([lat, lng]);
      if (followMode) map.panTo([lat, lng], { animate: false });
      if (p < 1) animReq = requestAnimationFrame(step);
    }
    animReq = requestAnimationFrame(step);
  }

  // เรียกจากแอพ Android ผ่าน evaluateJavascript('setDriverPosition(lat,lng)') ทุกครั้งที่มีพิกัด GPS ใหม่
  function setDriverPosition(lat, lng) {
    if (!driverMarker) {
      var icon = L.divIcon({ className: '', html: "<div class='map-user-dot'></div>", iconSize: [18, 18], iconAnchor: [9, 9] });
      driverMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 900 }).addTo(map);
      lastLat = lat; lastLng = lng;
    } else if (lastLat !== lat || lastLng !== lng) {
      animateMarkerTo(lastLat, lastLng, lat, lng);
      lastLat = lat; lastLng = lng;
    }
    if (firstFix) {
      if (cfg.initialCenterLat != null) {
        map.setView([cfg.initialCenterLat, cfg.initialCenterLng], cfg.initialZoom != null ? cfg.initialZoom : 12);
        initialViewApplied = true;
      } else {
        map.setView([lat, lng], 12);
      }
      firstFix = false;
    } else if (followMode) {
      map.panTo([lat, lng]);
    }
  }

  function renderStops(stops) {
    stopMarkers.forEach(function (m) { map.removeLayer(m); });
    stopMarkers = [];
    stops.forEach(function (s) {
      var iconDiv = L.divIcon({
        className: '',
        html: "<div class='map-stop-icon'>" + escHtml(s.icon || '\uD83D\uDE8F') + "</div>",
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      var iconM = L.marker([s.lat, s.lng], { icon: iconDiv, title: s.name || '' }).addTo(map);
      stopMarkers.push(iconM);

      var labelDiv = L.divIcon({
        className: '',
        html: "<div class='map-stop-label'>" + escHtml(s.name) + "</div>",
        iconSize: null, iconAnchor: [-6, 44]
      });
      var labelM = L.marker([s.lat, s.lng], { icon: labelDiv, interactive: false }).addTo(map);
      stopMarkers.push(labelM);
    });
  }

  function watchStops() {
    db.ref(STOPS_PATH).on('value', function (snap) {
      var val = snap.val() || {};
      var stops = Object.keys(val).map(function (key) {
        var s = val[key] || {};
        return {
          lat: Number(s.lat),
          lng: Number(s.lng),
          name: s.nameTh || s.name || s.stopTh || key,
          icon: s.icon || '',
          order: s.order == null ? 999999 : Number(s.order)
        };
      }).filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); });
      stops.sort(function (a, b) { return a.order - b.order; });
      renderStops(stops);
    });
  }

  function renderRoute(points) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (points.length > 1) {
      routeLine = L.polyline(points, { color: '#00B8A9', weight: 4, opacity: 0.75 }).addTo(map);
    }
  }

  function watchRoute() {
    db.ref(ROUTES_PATH).on('value', function (snap) {
      var val = snap.val() || {};
      var points = [];
      Object.keys(val).some(function (key) {
        var route = val[key] || {};
        if (route.geometryType !== 'road_polyline' || !Array.isArray(route.polyline)) return false;
        var pts = route.polyline
          .map(function (p) { return (p && isFinite(Number(p.lat)) && isFinite(Number(p.lng))) ? [Number(p.lat), Number(p.lng)] : null; })
          .filter(Boolean);
        if (pts.length > 1) { points = pts; return true; } // ใช้เส้นทางแรกที่มี geometry จริง
        return false;
      });
      renderRoute(points);
    });
  }

  function watchConfig() {
    db.ref(DRIVER_MAP_CONFIG_PATH).on('value', function (snap) {
      var val = snap.val() || {};
      Object.keys(val).forEach(function (k) { cfg[k] = val[k]; });
      applyInitialViewIfPossible();
    });
  }

  function init() {
    var app;
    try { app = global.firebase.initializeApp(FIREBASE_CONFIG); }
    catch (e) { app = global.firebase.app(); }
    db = app.database();

    initMap();
    watchStops();
    watchRoute();
    watchConfig();
  }

  global.setDriverPosition = setDriverPosition;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
