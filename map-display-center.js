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
    normalizeVehicleSignal: normalizeVehicleSignal,
    planVehicleMarker: planVehicleMarker,
    prepareVehicleLayer: prepareVehicleLayer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitMapDisplayCenter;
})(typeof window !== 'undefined' ? window : globalThis);
