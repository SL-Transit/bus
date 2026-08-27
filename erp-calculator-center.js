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

  function isoDateFromDate(date) {
    var d = date instanceof Date ? date : new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function recommendedBookingTrips(input) {
    input = input || {};
    var trips = Array.isArray(input.trips) ? input.trips.slice() : [];
    var serviceDate = String(input.serviceDate || '');
    var now = input.now instanceof Date ? input.now : new Date();
    var today = isoDateFromDate(now);
    var cutoff = serviceDate === today ? now.getHours() * 60 + now.getMinutes() : null;
    var firstUpcomingIndex = -1;
    trips.forEach(function(trip, index) {
      var depart = minutesOfDay(trip && (trip.pickupTime || trip.time || trip.departureTime || trip.roundTime));
      /* connection-reference trips (ERP connectionOptions, e.g. cross-group transfer
         pairs with no fixed daily schedule) describe a suggested connection pattern,
         not a literal today-only departure — they must not be excluded by today's
         clock cutoff or every cross-group pair loses its recommended card once the
         reference time of day has passed. */
      var alwaysEligible = !!(trip && trip.referenceOnly === true);
      if (firstUpcomingIndex === -1 && (cutoff == null || alwaysEligible || (depart !== null && depart >= cutoff))) {
        firstUpcomingIndex = index;
      }
    });
    /* Safety net: if every trip in this pair looks "past" (e.g. malformed/missing
       time field on an otherwise valid ERP entry), still surface a recommended trip
       instead of silently dropping the whole recommended-card UI for that pair. */
    if (firstUpcomingIndex === -1 && trips.length) {
      firstUpcomingIndex = 0;
    }
    return trips.map(function(trip, index) {
      var copy = Object.assign({}, trip);
      var depart = minutesOfDay(copy.pickupTime || copy.time || copy.departureTime || copy.roundTime);
      var isPast = cutoff != null && depart !== null && depart < cutoff && copy.referenceOnly !== true;
      copy.recommendationRank = index;
      copy.recommended = index === firstUpcomingIndex;
      copy.recommendationSource = 'erp_logic_center';
      copy.timeDisplayState = isPast ? 'past' : 'available_for_display';
      copy.displayMuted = copy.displayMuted === true || isPast;
      return copy;
    });
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

  function calculateBookingTotal(input) {
    input = input || {};
    if (input.fareAmount == null) return { status: 'missing_fare', totalAmount: null };
    if (input.serviceFeeAmount == null) return { status: 'missing_service_fee', totalAmount: null };
    var fareAmount = num(input.fareAmount, NaN);
    var serviceFeeAmount = num(input.serviceFeeAmount, NaN);
    var passengerCount = num(input.passengerCount, NaN);
    var maxPassengers = input.maxPassengers == null ? null : num(input.maxPassengers, NaN);
    if (!isFinite(fareAmount) || fareAmount < 0) return { status: 'missing_fare', totalAmount: null };
    if (!isFinite(serviceFeeAmount) || serviceFeeAmount < 0) return { status: 'missing_service_fee', totalAmount: null };
    if (!isFinite(passengerCount) || passengerCount < 1 || Math.floor(passengerCount) !== passengerCount) {
      return { status: 'invalid_passenger_count', totalAmount: null };
    }
    if (maxPassengers !== null && (!isFinite(maxPassengers) || maxPassengers < 1 || passengerCount > maxPassengers)) {
      return { status: 'passenger_limit_exceeded', totalAmount: null, maxPassengers: isFinite(maxPassengers) ? maxPassengers : null };
    }
    var fareSubtotal = fareAmount * passengerCount;
    var serviceFeeTotal = serviceFeeAmount * passengerCount;
    return {
      status: 'ready',
      passengerCount: passengerCount,
      maxPassengers: maxPassengers,
      fareAmount: fareAmount,
      fareSubtotal: fareSubtotal,
      serviceFeeAmount: serviceFeeAmount,
      serviceFeeTotal: serviceFeeTotal,
      totalAmount: fareSubtotal + serviceFeeTotal
    };
  }

  global.SLTransitCalculatorCenter = {
    normalizeRoadDistance: normalizeRoadDistance,
    estimateEta: estimateEta,
    formatDuration: formatDuration,
    findCatchableTrip: findCatchableTrip,
    recommendedBookingTrips: recommendedBookingTrips,
    minutesOfDay: minutesOfDay,
    combineFare: combineFare,
    calculateBookingTotal: calculateBookingTotal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitCalculatorCenter;
})(typeof window !== 'undefined' ? window : globalThis);
