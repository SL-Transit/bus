(function(global) {
  'use strict';

  var geo = global.SLTransitGeo;
  if (!geo && typeof require === 'function') {
    try { geo = require('./geo-engine.js'); } catch (err) { geo = null; }
  }

  function hasPoint(point) {
    return point && isFinite(Number(point.lat)) && isFinite(Number(point.lng == null ? point.lon : point.lng));
  }

  function isWithinRadius(point, target, radiusKm) {
    if (!hasPoint(point) || !hasPoint(target)) return false;
    if (geo && typeof geo.isWithinRadiusKm === 'function') return geo.isWithinRadiusKm(point, target, radiusKm);
    return false;
  }

  function originBoardingState(input) {
    input = input || {};
    if (input.boarded === true) return { status: 'boarded', atPickup: true };
    var atPickup = isWithinRadius(input.vehiclePoint, input.pickupPoint, input.pickupRadiusKm || 0.35);
    return {
      status: atPickup ? 'vehicle_at_pickup' : 'waiting_vehicle',
      atPickup: atPickup
    };
  }

  function arrivalInfo(booking) {
    booking = booking || {};
    if (booking.arrivedTransferPoint && booking.arrivedTransferPoint.ts) {
      return { type: 'transfer', ts: Number(booking.arrivedTransferPoint.ts), status: 'arrived_transfer_point' };
    }
    if (booking.arrivedDestination && booking.arrivedDestination.ts) {
      return { type: 'destination', ts: Number(booking.arrivedDestination.ts), status: 'arrived_destination' };
    }
    return null;
  }

  function serviceEnded(booking, now, endAfterMs) {
    var info = arrivalInfo(booking);
    now = Number(now || Date.now());
    endAfterMs = Number(endAfterMs || 0);
    return !!(info && info.ts && now - info.ts >= endAfterMs);
  }

  function journeyArrivalState(input) {
    input = input || {};
    var existing = arrivalInfo(input.booking);
    if (existing) return existing;
    if (input.boarded !== true) return { status: 'waiting_boarding', type: '' };
    var targetType = input.targetType === 'transfer' ? 'transfer' : 'destination';
    var near = isWithinRadius(input.sourcePoint, input.targetPoint, input.arrivalRadiusKm || 0.35);
    if (!near && !(input.etaMinutes !== null && input.etaMinutes !== undefined && Number(input.etaMinutes) <= 1)) {
      return { status: 'in_transit', type: targetType };
    }
    return {
      status: targetType === 'transfer' ? 'arrived_transfer_point' : 'arrived_destination',
      type: targetType
    };
  }

  global.SLTransitJourneyStatusCenter = {
    originBoardingState: originBoardingState,
    arrivalInfo: arrivalInfo,
    serviceEnded: serviceEnded,
    journeyArrivalState: journeyArrivalState
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitJourneyStatusCenter;
})(typeof window !== 'undefined' ? window : globalThis);
