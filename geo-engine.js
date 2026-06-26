(function(global) {
  'use strict';

  var EARTH_RADIUS_KM = 6371;
  var EARTH_RADIUS_M = 6371000;

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    lat1 = num(lat1, NaN);
    lng1 = num(lng1, NaN);
    lat2 = num(lat2, NaN);
    lng2 = num(lng2, NaN);
    if ([lat1, lng1, lat2, lng2].some(function(v) { return !isFinite(v); })) return NaN;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distanceMeters(lat1, lng1, lat2, lng2) {
    var km = distanceKm(lat1, lng1, lat2, lng2);
    return isFinite(km) ? km * 1000 : NaN;
  }

  function isWithinRadiusKm(point, target, radiusKm) {
    if (!point || !target) return false;
    var km = distanceKm(point.lat, point.lng == null ? point.lon : point.lng, target.lat, target.lng == null ? target.lon : target.lng);
    return isFinite(km) && km <= num(radiusKm, 0);
  }

  function radiusState(distanceKmValue, radiusKm) {
    var distance = num(distanceKmValue, NaN);
    var radius = num(radiusKm, 0);
    return {
      distanceKm: isFinite(distance) ? distance : null,
      radiusKm: radius,
      inside: isFinite(distance) && distance <= radius,
      remainingKm: isFinite(distance) ? Math.max(0, distance - radius) : null
    };
  }

  function estimateVehicleEta(vehicleLocation, targetLocation, options) {
    options = options || {};
    if (!vehicleLocation || !targetLocation) return null;
    var speedKmh = num(vehicleLocation.speedKmh || vehicleLocation.speed, 0);
    if (speedKmh < num(options.minMovingSpeedKmh, 2)) {
      return { etaMinutes: null, distanceKm: null, arrivalTimeText: '', status: 'stopped' };
    }
    var factor = num(options.roadDistanceFactor, 1);
    var km = distanceKm(vehicleLocation.lat, vehicleLocation.lng, targetLocation.lat, targetLocation.lng) * factor;
    if (!isFinite(km)) return null;
    var etaMinutes = Math.max(1, Math.round((km / speedKmh) * 60));
    var now = options.now ? new Date(options.now) : new Date();
    var arrival = new Date(now.getTime() + etaMinutes * 60000);
    return {
      etaMinutes: etaMinutes,
      distanceKm: km,
      arrivalTimeText: String(arrival.getHours()).padStart(2, '0') + ':' + String(arrival.getMinutes()).padStart(2, '0'),
      status: 'moving'
    };
  }

  global.SLTransitGeo = {
    distanceKm: distanceKm,
    distanceMeters: distanceMeters,
    isWithinRadiusKm: isWithinRadiusKm,
    radiusState: radiusState,
    estimateVehicleEta: estimateVehicleEta
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitGeo;
})(typeof window !== 'undefined' ? window : globalThis);
