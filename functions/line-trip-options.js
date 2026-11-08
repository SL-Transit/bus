"use strict";

// Read-only LINE draft. Use the workbook view and the booking resolver on the
// same trusted snapshot. The caller owns date, publication and capacity checks.
function selectLineTripOptions({ source, route, findCanonicalWorkbookPair }) {
  if (!source || !route || typeof findCanonicalWorkbookPair !== "function" ||
      !route.pairKey || !route.routeId || route.bookingEligible !== true ||
      route.referenceOnly === true || route.externalReference === true) return [];

  const accepted = new Map();
  const ambiguous = new Set();
  for (const segment of route.segments || []) {
    if (segment.routeId !== route.routeId || segment.bookingEligible !== true) continue;
    for (const trip of segment.times || []) {
      const id = trip.scheduleOfferId;
      if (trip.bookingEligible !== true || trip.routeId !== route.routeId ||
          typeof id !== "string" || !id || id.length > 160 || trip.tripId !== id ||
          !trip.scheduleRowId || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(trip.departureTime)) continue;
      const match = findCanonicalWorkbookPair(source, {
        pairKey: route.pairKey,
        routeId: route.routeId,
        origin: route.originLabel,
        destination: route.destinationLabel,
        tripId: id
      });
      if (!match || match.pairKey !== route.pairKey || match.routeId !== route.routeId ||
          match.scheduleOfferId !== id || match.scheduleRowId !== trip.scheduleRowId ||
          match.departureTime !== trip.departureTime) continue;
      if (accepted.has(id)) ambiguous.add(id);
      accepted.set(id, { id, label: match.departureTime });
    }
  }
  return [...accepted.values()].filter(option => !ambiguous.has(option.id));
}

module.exports = { selectLineTripOptions };
