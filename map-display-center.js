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

  function planVehicleMarker(previous, signal, options) {
    options = options || {};
    var next = normalizeVehicleSignal(signal);
    if (!next) return { status: 'invalid_signal', point: previous && previous.point ? previous.point : null, vehicle: null };
    if (!previous || !previous.point) {
      return { status: 'place', point: { lat: next.lat, lng: next.lng }, vehicle: next, animation: null };
    }
    var maxStepMeters = num(options.maxStepMeters, 250);
    var meters = geo && geo.distanceMeters
      ? geo.distanceMeters(previous.point.lat, previous.point.lng, next.lat, next.lng)
      : NaN;
    if (!isFinite(meters) || meters <= maxStepMeters) {
      return { status: 'move', point: { lat: next.lat, lng: next.lng }, vehicle: next, distanceMeters: meters, animation: { mode: 'smooth' } };
    }
    var ratio = Math.max(0, Math.min(1, maxStepMeters / meters));
    return {
      status: 'smooth_limited',
      point: {
        lat: previous.point.lat + (next.lat - previous.point.lat) * ratio,
        lng: previous.point.lng + (next.lng - previous.point.lng) * ratio
      },
      targetPoint: { lat: next.lat, lng: next.lng },
      vehicle: next,
      distanceMeters: meters,
      animation: { mode: 'no_warp', maxStepMeters: maxStepMeters }
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
