(function(global) {
  'use strict';

  var geo = global.SLTransitGeo;
  if (!geo && typeof require === 'function') {
    try { geo = require('./geo-engine.js'); } catch (err) { geo = null; }
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function normalizePoint(point) {
    point = point || {};
    var lat = num(point.lat == null ? point.latitude : point.lat, NaN);
    var lng = num(point.lng == null ? (point.lon == null ? point.longitude : point.lon) : point.lng, NaN);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
    return { lat: lat, lng: lng };
  }

  function viewportZoomForSpan(span, options) {
    options = options || {};
    span = Math.max(0, num(span, 0));
    var zoom;
    if (span <= 0.005) zoom = 16;
    else if (span <= 0.015) zoom = 14;
    else if (span <= 0.04) zoom = 12;
    else if (span <= 0.12) zoom = 11;
    else if (span <= 0.3) zoom = 10;
    else if (span <= 0.7) zoom = 9;
    else zoom = 8;
    return Math.max(num(options.minZoom, 8), Math.min(num(options.maxZoom, 16), zoom));
  }

  function planViewport(input) {
    input = input || {};
    if (input.followEnabled === false) {
      return { apply: false, mode: 'preserve', center: null, zoom: null, bounds: null, animate: false, lockInteractionMs: 0 };
    }

    var focusPoint = normalizePoint(input.focusPoint);
    if (focusPoint) {
      return {
        apply: true,
        mode: 'focus',
        center: focusPoint,
        zoom: num(input.focusZoom, 14),
        bounds: { minLat: focusPoint.lat, maxLat: focusPoint.lat, minLng: focusPoint.lng, maxLng: focusPoint.lng },
        animate: input.animate === true,
        lockInteractionMs: Math.max(0, num(input.lockInteractionMs, 900))
      };
    }

    var points = (Array.isArray(input.points) ? input.points : []).map(normalizePoint).filter(Boolean);
    if (points.length) {
      var minLat = Math.min.apply(Math, points.map(function(point) { return point.lat; }));
      var maxLat = Math.max.apply(Math, points.map(function(point) { return point.lat; }));
      var minLng = Math.min.apply(Math, points.map(function(point) { return point.lng; }));
      var maxLng = Math.max.apply(Math, points.map(function(point) { return point.lng; }));
      return {
        apply: true,
        mode: 'overview',
        center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
        zoom: viewportZoomForSpan(Math.max(maxLat - minLat, maxLng - minLng), input),
        bounds: { minLat: minLat, maxLat: maxLat, minLng: minLng, maxLng: maxLng },
        animate: input.animate === true,
        lockInteractionMs: Math.max(0, num(input.lockInteractionMs, 900))
      };
    }

    var defaultCenter = normalizePoint(input.defaultCenter) || { lat: 13.71, lng: 101.245 };
    return {
      apply: true,
      mode: 'default',
      center: defaultCenter,
      zoom: num(input.defaultZoom, 10),
      bounds: null,
      animate: false,
      lockInteractionMs: Math.max(0, num(input.lockInteractionMs, 900))
    };
  }

  function planFollowInteraction(input) {
    input = input || {};
    var followEnabled = input.followEnabled !== false;
    var now = num(input.now, Date.now());
    var programmaticMoveUntil = num(input.programmaticMoveUntil, 0);
    if (now < programmaticMoveUntil) {
      return { followEnabled: followEnabled, changed: false, reason: 'programmatic_move' };
    }
    if (!followEnabled) {
      return { followEnabled: false, changed: false, reason: 'already_paused' };
    }
    return { followEnabled: false, changed: true, reason: String(input.reason || 'manual_map_interaction') };
  }

  function normalizeVehicleSignal(signal) {
    signal = signal || {};
    var lat = num(signal.lat, NaN);
    var lng = num(signal.lng == null ? signal.lon : signal.lng, NaN);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return {
      vehicleId: String(signal.vehicleId || signal.id || ''),
      lat: lat,
      lng: lng,
      heading: num(signal.heading, null),
      speedKmh: num(signal.speedKmh == null ? signal.speed : signal.speedKmh, null),
      updatedAt: signal.updatedAt || signal.timestamp || null,
      source: signal.source || 'map_display_center'
    };
  }

  function distanceMeters(a, b) {
    if (!a || !b) return NaN;
    if (geo && geo.distanceMeters) return geo.distanceMeters(a.lat, a.lng, b.lat, b.lng);
    var R = 6371000;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function bearingBetween(from, to) {
    if (!from || !to) return NaN;
    var lat1 = from.lat * Math.PI / 180;
    var lat2 = to.lat * Math.PI / 180;
    var dLng = (to.lng - from.lng) * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function projectPoint(point, headingDeg, meters) {
    var R = 6371000;
    var brng = headingDeg * Math.PI / 180;
    var lat1 = point.lat * Math.PI / 180;
    var lng1 = point.lng * Math.PI / 180;
    var d = meters / R;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    var lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
  }

  function vehicleTimestamp(signal) {
    var raw = signal && (signal.gpsTs || signal.gpsts || signal.locationUpdatedAt || signal.updatedAt || signal.timestamp || signal.ts);
    var ts = num(raw, NaN);
    return isFinite(ts) && ts > 0 ? ts : Date.now();
  }

  function planVehicleMarker(previous, signal, options) {
    options = options || {};
    var next = normalizeVehicleSignal(signal);
    if (!next) return { status: 'invalid_signal', point: previous && previous.point ? previous.point : null, vehicle: null };
    var nextPoint = { lat: next.lat, lng: next.lng };
    var gpsTs = vehicleTimestamp(signal);
    if (!previous || !previous.point) {
      return {
        status: 'place',
        point: nextPoint,
        vehicle: next,
        animation: null,
        displayState: { point: nextPoint, display: nextPoint, anchor: nextPoint, lastGpsTs: gpsTs, speedMs: 0, heading: next.heading }
      };
    }
    var maxStepMeters = num(options.maxStepMeters, 250);
    var anchor = normalizePoint(previous.anchor) || normalizePoint(previous.point);
    var display = normalizePoint(previous.display) || normalizePoint(previous.point) || anchor;
    var lastGpsTs = num(previous.lastGpsTs, 0);
    if (lastGpsTs && gpsTs < lastGpsTs) {
      return {
        status: 'stale_signal',
        point: display,
        vehicle: next,
        animation: { mode: 'stale_ignored', durationMs: 0 },
        displayState: previous
      };
    }
    var rawMeters = distanceMeters(anchor, nextPoint);
    var dtSec = lastGpsTs && gpsTs > lastGpsTs ? Math.max((gpsTs - lastGpsTs) / 1000, 0.001) : 0.12;
    var impliedSpeedMs = isFinite(rawMeters) && dtSec > 0 ? rawMeters / dtSec : 0;
    var maxReasonableSpeedMs = num(options.maxReasonableSpeedMs, 45);
    if (impliedSpeedMs > maxReasonableSpeedMs) {
      return {
        status: 'impossible_jump_ignored',
        point: display,
        vehicle: next,
        distanceMeters: rawMeters,
        animation: { mode: 'jump_ignored', durationMs: 0 },
        displayState: previous
      };
    }

    var limitedAnchor = nextPoint;
    if (isFinite(rawMeters) && rawMeters > maxStepMeters) {
      var ratio = Math.max(0, Math.min(1, maxStepMeters / rawMeters));
      limitedAnchor = {
        lat: anchor.lat + (nextPoint.lat - anchor.lat) * ratio,
        lng: anchor.lng + (nextPoint.lng - anchor.lng) * ratio
      };
    }
    var packetSpeedKmh = num(next.speedKmh, 0);
    var speedMs = packetSpeedKmh > 0.5 ? packetSpeedKmh / 3.6 : impliedSpeedMs;
    speedMs = Math.max(0, Math.min(speedMs, 27.8));
    var heading = isFinite(num(next.heading, NaN)) ? next.heading : bearingBetween(anchor, limitedAnchor);
    var ageMs = Math.max(0, Date.now() - gpsTs);
    var target = limitedAnchor;
    if (speedMs > 0.4 && isFinite(heading) && ageMs <= num(options.maxPredictMs, 10000)) {
      var predictMeters = Math.min(speedMs * (ageMs / 1000), num(options.maxPredictMeters, 300));
      target = projectPoint(limitedAnchor, heading, predictMeters);
    }
    var nextDisplay = target;
    var durationMs = Math.max(0, Math.min(450, Math.max(120, dtSec * 180)));
    var mode = isFinite(rawMeters) && rawMeters > maxStepMeters ? 'no_warp_smooth_limited' : 'smooth';
    return {
      status: mode,
      point: nextDisplay,
      targetPoint: target,
      vehicle: next,
      distanceMeters: rawMeters,
      animation: { mode: mode, durationMs: durationMs, maxStepMeters: maxStepMeters },
      displayState: { point: nextDisplay, display: nextDisplay, anchor: limitedAnchor, lastGpsTs: gpsTs, speedMs: speedMs, heading: heading }
    };
  }

  function prepareVehicleLayer(signals, previousByVehicleId, options) {
    signals = Array.isArray(signals) ? signals : [];
    previousByVehicleId = previousByVehicleId || {};
    return signals.map(function(signal) {
      var id = String((signal && (signal.vehicleId || signal.id)) || '');
      return planVehicleMarker(previousByVehicleId[id], signal, options);
    }).filter(function(item) {
      return item.vehicle && item.vehicle.vehicleId;
    });
  }

  global.SLTransitMapDisplayCenter = {
    normalizePoint: normalizePoint,
    viewportZoomForSpan: viewportZoomForSpan,
    planViewport: planViewport,
    planFollowInteraction: planFollowInteraction,
    normalizeVehicleSignal: normalizeVehicleSignal,
    planVehicleMarker: planVehicleMarker,
    prepareVehicleLayer: prepareVehicleLayer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitMapDisplayCenter;
})(typeof window !== 'undefined' ? window : globalThis);
