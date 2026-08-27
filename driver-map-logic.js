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
 *   - publishedSchedule/mapView               (ERP Data Center stop pins/icons/road route)
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

  var MAP_VIEW_PATH = 'publishedSchedule/mapView';
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
  var pendingDriverPosition = null;

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

  function stopMarkersAreFixedScreenSize(mapView) {
    var policy = mapView && mapView.displayPolicy && mapView.displayPolicy.stopMarkers;
    return policy && policy.scaleMode === 'fixed_screen_size';
  }

  function stopMarkerPolicy(mapView) {
    return mapView && mapView.displayPolicy && mapView.displayPolicy.stopMarkers || {};
  }

  function policyNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function applyStopMarkerDisplayPolicy(mapView) {
    var policy = stopMarkerPolicy(mapView);
    var root = document.documentElement || document.body;
    if (!root || !root.style) return;
    root.style.setProperty('--erp-map-stop-icon-size', policyNumber(policy.iconSizePx, 34) + 'px');
    root.style.setProperty('--erp-map-stop-icon-font-size', policyNumber(policy.iconFontSizePx, 18) + 'px');
    root.style.setProperty('--erp-map-stop-label-font-size', policyNumber(policy.labelFontSizePx, 11) + 'px');
    if (root.dataset) root.dataset.erpMapStopScaleMode = policy.scaleMode || '';
  }

  function leafletOptionsForMapView(mapView) {
    var fixedStopMarkers = stopMarkersAreFixedScreenSize(mapView);
    return {
      zoomControl: true,
      zoomAnimation: !fixedStopMarkers,
      markerZoomAnimation: !fixedStopMarkers,
      fadeAnimation: !fixedStopMarkers
    };
  }

  function initMap(mapView) {
    applyStopMarkerDisplayPolicy(mapView);
    map = L.map('map', {
      zoomControl: leafletOptionsForMapView(mapView).zoomControl,
      zoomAnimation: leafletOptionsForMapView(mapView).zoomAnimation,
      markerZoomAnimation: leafletOptionsForMapView(mapView).markerZoomAnimation,
      fadeAnimation: leafletOptionsForMapView(mapView).fadeAnimation
    }).setView([13.75, 101.4], 9); // มุมมองตั้งต้นชั่วคราว จนกว่า config/GPS จริงจะมาถึง
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
    if (!map) return;
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

  var passengerMarkers = {};
  var pendingTicketList = null;
  var pendingPassengerLocations = [];

  function ensurePassengerMarker(bookingId, name, phone) {
    var entry = passengerMarkers[bookingId];
    if (!entry) {
      entry = { marker: null, name: name, phone: phone };
      passengerMarkers[bookingId] = entry;
    } else {
      if (name) entry.name = name;
      if (phone) entry.phone = phone;
    }
    if (entry.marker) refreshPassengerPopup(entry);
    return entry;
  }

  function refreshPassengerPopup(entry) {
    var name = escHtml(entry.name || 'ผู้โดยสาร');
    var phoneDigits = String(entry.phone || '').replace(/[^0-9+]/g, '');
    var phoneHtml = phoneDigits
      ? '<a href="tel:' + phoneDigits + '" class="map-passenger-call">📞 ' + escHtml(entry.phone) + '</a>'
      : '<span class="map-passenger-call map-passenger-call--none">ไม่มีเบอร์โทร</span>';
    entry.marker.bindPopup('<div class="map-passenger-popup"><b>' + name + '</b><br>' + phoneHtml + '</div>');
  }

  function removePassengerMarker(bookingId) {
    var entry = passengerMarkers[bookingId];
    if (!entry) return;
    if (entry.marker) map.removeLayer(entry.marker);
    delete passengerMarkers[bookingId];
  }

  // เรียกจากแอพ Android ผ่าน evaluateJavascript('setPassengerLocation("BK123", lat, lng)') เท่านั้น —
  // หน้าเว็บนี้ไม่มี Firebase Auth ของตัวเอง จึงไม่มีทางบังคับกฎ "คนขับที่ถูกมอบหมายเท่านั้นถึงจะอ่านได้"
  // เอง ฝั่ง native (ที่ authenticated และผ่านการเช็คสิทธิ์ตาม Firebase rules อยู่แล้ว) เป็นผู้อ่าน
  // Firebase แทนและส่งพิกัดที่ผ่านการตรวจสอบแล้วเข้ามาเท่านั้น
  function setPassengerLocation(bookingId, lat, lng) {
    if (!map) { pendingPassengerLocations.push({ bookingId: bookingId, lat: lat, lng: lng }); return; }
    var entry = ensurePassengerMarker(bookingId);
    if (!entry.marker) {
      var icon = L.divIcon({ className: '', html: "<div class='map-passenger-dot'>👤</div>", iconSize: [30, 30], iconAnchor: [15, 15] });
      entry.marker = L.marker([lat, lng], { icon: icon, zIndexOffset: 800 }).addTo(map);
      refreshPassengerPopup(entry);
    } else {
      entry.marker.setLatLng([lat, lng]);
    }
  }

  // เรียกจากแอพ Android เมื่อผู้โดยสารปิดการแชร์ หรือไม่ใช่ตั๋วที่ active แล้ว
  function removePassengerLocation(bookingId) {
    removePassengerMarker(bookingId);
  }

  // เรียกจากแอพ Android ผ่าน evaluateJavascript('setDriverTicketList([...])') ทุกครั้งที่รายชื่อ
  // ตั๋ววันนี้ของรถคันนี้เปลี่ยน (bookingId/name/phone) — คนขับคนนี้ผ่านการตรวจสิทธิ์ว่าเป็นผู้ได้รับ
  // มอบหมาย booking นี้แล้วเท่านั้นถึงจะเห็นเบอร์โทร (ดู MainActivity.startTicketListRelay) — ใช้เพื่อ
  // ตั้งชื่อ/เบอร์บนหมุด และล้างหมุดของตั๋วที่ไม่ active แล้ว (ขึ้นรถ/ยกเลิก) ตำแหน่งจริงมาจาก
  // setPassengerLocation เท่านั้น
  function setDriverTicketList(tickets) {
    if (!map) { pendingTicketList = tickets; return; }
    tickets = Array.isArray(tickets) ? tickets : [];
    var activeIds = {};
    tickets.forEach(function (t) {
      if (!t || !t.bookingId) return;
      activeIds[t.bookingId] = true;
      ensurePassengerMarker(t.bookingId, t.name, t.phone);
    });
    Object.keys(passengerMarkers).forEach(function (id) {
      if (!activeIds[id]) removePassengerMarker(id);
    });
  }

  // เรียกจากแอพ Android ผ่าน evaluateJavascript('setDriverPosition(lat,lng)') ทุกครั้งที่มีพิกัด GPS ใหม่
  function setDriverPosition(lat, lng) {
    if (!map) {
      pendingDriverPosition = { lat: lat, lng: lng };
      return;
    }
    if (!driverMarker) {
      var icon = L.divIcon({ className: '', html: "<div class='map-bus-icon'><img src='assets/passenger-bus-icon.png' alt=''></div>", iconSize: [40, 40], iconAnchor: [20, 20] });
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

  function renderStops(stops, mapView) {
    var policy = stopMarkerPolicy(mapView);
    var iconSizePx = policyNumber(policy.iconSizePx, 34);
    var labelAnchorY = iconSizePx + 10;
    stopMarkers.forEach(function (m) { map.removeLayer(m); });
    stopMarkers = [];
    stops.forEach(function (s) {
      var iconDiv = L.divIcon({
        className: '',
        html: "<div class='map-stop-icon'>" + escHtml(s.icon || '\uD83D\uDE8F') + "</div>",
        iconSize: [iconSizePx, iconSizePx], iconAnchor: [iconSizePx / 2, iconSizePx / 2]
      });
      var iconM = L.marker([s.lat, s.lng], { icon: iconDiv, title: s.name || '' }).addTo(map);
      stopMarkers.push(iconM);

      var labelDiv = L.divIcon({
        className: '',
        html: "<div class='map-stop-label'>" + escHtml(s.name) + "</div>",
        iconSize: null, iconAnchor: [-6, labelAnchorY]
      });
      var labelM = L.marker([s.lat, s.lng], { icon: labelDiv, interactive: false }).addTo(map);
      stopMarkers.push(labelM);
    });
  }

  function normalizeStops(rawStops) {
    if (!rawStops) return [];
    var source = Array.isArray(rawStops)
      ? rawStops
      : Object.keys(rawStops).map(function (key) {
        var s = rawStops[key] || {};
        if (s.stopKey == null && s.key == null) s.key = key;
        return s;
      });
    return source.map(function (s, index) {
        s = s || {};
        return {
          lat: Number(s.lat),
          lng: Number(s.lng),
          name: s.label || s.displayNameTh || s.nameTh || s.name || s.stopTh || s.stopKey || s.key || '',
          icon: s.icon || '\uD83D\uDE8F',
          order: s.displayOrder == null ? index : Number(s.displayOrder)
        };
      })
      .filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); });
  }

  function renderRoute(points) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (points.length > 1) {
      routeLine = L.polyline(points, { color: '#00B8A9', weight: 4, opacity: 0.75 }).addTo(map);
    }
  }

  function extractRoadRoute(rawRoutes) {
    var val = rawRoutes || {};
    var routes = Array.isArray(val) ? val : Object.keys(val).map(function (key) { return val[key]; });
    var points = [];
    routes.some(function (route) {
      route = route || {};
      if (route.geometryType !== 'road_polyline' || !Array.isArray(route.polyline)) return false;
      var pts = route.polyline
        .map(function (p) { return (p && isFinite(Number(p.lat)) && isFinite(Number(p.lng))) ? [Number(p.lat), Number(p.lng)] : null; })
        .filter(Boolean);
      if (pts.length > 1) { points = pts; return true; } // ใช้เส้นทางแรกที่มี geometry จริง
      return false;
    });
    return points;
  }

  function watchMapView() {
    db.ref(MAP_VIEW_PATH).on('value', function (snap) {
      var mapView = snap.val() || {};
      applyStopMarkerDisplayPolicy(mapView);
      if (!map) {
        initMap(mapView);
        if (pendingDriverPosition) {
          setDriverPosition(pendingDriverPosition.lat, pendingDriverPosition.lng);
          pendingDriverPosition = null;
        }
        if (pendingTicketList) {
          setDriverTicketList(pendingTicketList);
          pendingTicketList = null;
        }
        if (pendingPassengerLocations.length) {
          pendingPassengerLocations.forEach(function (p) { setPassengerLocation(p.bookingId, p.lat, p.lng); });
          pendingPassengerLocations = [];
        }
      }
      renderStops(normalizeStops(mapView.stops), mapView);
      renderRoute(extractRoadRoute(mapView.routes));
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

    watchMapView();
    watchConfig();
  }

  global.setDriverPosition = setDriverPosition;
  global.setDriverTicketList = setDriverTicketList;
  global.setPassengerLocation = setPassengerLocation;
  global.removePassengerLocation = removePassengerLocation;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
