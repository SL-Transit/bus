const geo = require('../geo-engine.js');

const origin = { lat: 13.692383, lng: 101.054183 };
const nearby = { lat: 13.694, lng: 101.055 };
const far = { lat: 13.75, lng: 101.35 };

const km = geo.distanceKm(origin.lat, origin.lng, nearby.lat, nearby.lng);
if (!(km > 0 && km < 1)) throw new Error('nearby distance outside expected range');

if (!geo.isWithinRadiusKm(origin, nearby, 0.5)) throw new Error('nearby point should be inside radius');
if (geo.isWithinRadiusKm(origin, far, 0.5)) throw new Error('far point should be outside radius');

const inside = geo.radiusState(0.3, 0.5);
if (!inside.inside || inside.remainingKm !== 0) throw new Error('inside radius state invalid');

const outside = geo.radiusState(1.2, 0.5);
if (outside.inside || outside.remainingKm <= 0) throw new Error('outside radius state invalid');

const eta = geo.estimateVehicleEta({ lat: 13.692383, lng: 101.054183, speedKmh: 30 }, far, { roadDistanceFactor: 1.3 });
if (!eta || !(eta.etaMinutes > 0) || eta.status !== 'moving') throw new Error('eta estimate invalid');

const stopped = geo.estimateVehicleEta({ lat: 13.692383, lng: 101.054183, speedKmh: 0 }, far);
if (!stopped || stopped.status !== 'stopped') throw new Error('stopped eta state invalid');

console.log('geo-engine ok');
