"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const workbook = require("../erp-workbook-booking-source");
const { selectLineTripOptions } = require("../functions/line-trip-options");

test("LINE drops same-label trips on a different route and requires matching canonical trip data", () => {
  const fare = { sourceRowId: "fare_a", routeId: "route_a", fromNameTh: "ต้นทางทดลอง", toNameTh: "ปลายทางทดลอง", amount: 120 };
  const trip = { sourceRowId: "row_a", scheduleOfferId: "trip_a", routeId: "route_a", originNameTh: fare.fromNameTh,
    destinationNameTh: fare.toNameTh, departureTime: "09:00", bookingEnabled: true };
  const source = { routeFareRows: { a: fare }, scheduleRows: {
    a: trip,
    b: { ...trip, sourceRowId: "row_b", scheduleOfferId: "trip_b", routeId: "route_b" },
    c: { ...trip, sourceRowId: "row_c", scheduleOfferId: "trip_c", bookingEnabled: false },
    d: { ...trip, sourceRowId: "row_d", scheduleOfferId: "trip_d" }
  } };
  const route = workbook.build(source.routeFareRows, source.scheduleRows).selectedRouteByRowId(fare.sourceRowId);
  assert.equal(route.segments[0].times.length, 4);
  const checked = [];
  const options = selectLineTripOptions({ source, route, findCanonicalWorkbookPair(snapshot, booking) {
    assert.equal(snapshot, source);
    assert.equal(booking.pairKey, fare.sourceRowId);
    assert.equal(booking.routeId, fare.routeId);
    checked.push(booking.tripId);
    if (booking.tripId === "trip_a") return { ...trip, pairKey: fare.sourceRowId, scheduleRowId: trip.sourceRowId };
    return null;
  } });
  assert.deepEqual(checked, ["trip_a", "trip_d"]);
  assert.deepEqual(options, [{ id: "trip_a", label: "09:00" }]);
});
