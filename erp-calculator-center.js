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

  function normalizeRoadDistance(input) {
    input = input || {};
    var roadKm = num(input.roadDistanceKm, NaN);
    if (isFinite(roadKm) && roadKm >= 0) {
      return { distanceKm: roadKm, source: 'road', status: 'ready' };
    }
    var from = input.from || {};
    var to = input.to || {};
    var factor = num(input.fallbackRoadDistanceFactor, 1.3);
    if (!geo || !from || !to) return { distanceKm: null, source: 'unavailable', status: 'missing_coordinates' };
    var straightKm = geo.distanceKm(from.lat, from.lng, to.lat, to.lng);
    if (!isFinite(straightKm)) return { distanceKm: null, source: 'unavailable', status: 'missing_coordinates' };
    return { distanceKm: straightKm * factor, source: 'fallback', status: 'ready' };
  }

  function estimateEta(input) {
    input = input || {};
    var distance = normalizeRoadDistance(input);
    if (distance.status !== 'ready') {
      return { etaMinutes: null, displayText: '-', distanceKm: null, distanceSource: distance.source, status: distance.status };
    }
    var eta = geo && geo.estimateEtaFromDistanceKm
      ? geo.estimateEtaFromDistanceKm(distance.distanceKm, input.speedKmh, input)
      : null;
    if (!eta || eta.status !== 'moving') {
      return { etaMinutes: null, displayText: '-', distanceKm: distance.distanceKm, distanceSource: distance.source, status: eta ? eta.status : 'unavailable' };
    }
    return {
      etaMinutes: eta.etaMinutes,
      displayText: formatDuration(eta.etaMinutes),
      distanceKm: distance.distanceKm,
      distanceSource: distance.source,
      status: 'moving'
    };
  }

  function formatDuration(minutes) {
    var value = Math.max(0, Math.round(num(minutes, 0)));
    if (value < 60) return value + ' นาที';
    var hours = Math.floor(value / 60);
    var rest = value % 60;
    return rest ? hours + ' ชั่วโมง ' + rest + ' นาที' : hours + ' ชั่วโมง';
  }

  function findCatchableTrip(input) {
    input = input || {};
    var arrivalMinutes = num(input.arrivalMinutesOfDay, NaN);
    var buffer = num(input.transferBufferMinutes, 0);
    var trips = Array.isArray(input.trips) ? input.trips : [];
    if (!isFinite(arrivalMinutes)) return null;
    for (var i = 0; i < trips.length; i += 1) {
      var depart = minutesOfDay(trips[i].time || trips[i].departureTime || trips[i].roundTime);
      if (depart !== null && depart >= arrivalMinutes + buffer) {
        return {
          time: trips[i].time || trips[i].departureTime || trips[i].roundTime,
          trip: trips[i],
          waitMinutes: depart - arrivalMinutes,
          bufferMinutes: buffer
        };
      }
    }
    return null;
  }

  function minutesOfDay(timeText) {
    var match = String(timeText || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var hours = num(match[1], NaN);
    var minutes = num(match[2], NaN);
    if (!isFinite(hours) || !isFinite(minutes) || hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function combineFare(legs) {
    legs = Array.isArray(legs) ? legs : [];
    return legs.reduce(function(total, leg) {
      return total + Math.max(0, num(leg && (leg.price || leg.fare || leg.amount), 0));
    }, 0);
  }

  global.SLTransitCalculatorCenter = {
    normalizeRoadDistance: normalizeRoadDistance,
    estimateEta: estimateEta,
    formatDuration: formatDuration,
    findCatchableTrip: findCatchableTrip,
    minutesOfDay: minutesOfDay,
    combineFare: combineFare
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitCalculatorCenter;
})(typeof window !== 'undefined' ? window : globalThis);
