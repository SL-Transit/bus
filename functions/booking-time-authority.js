"use strict";

function normalizeTime(value) {
  const text = String(value == null ? "" : value).trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function resolveBookingTime(input, canonicalTrip) {
  input = input || {};
  canonicalTrip = canonicalTrip || {};
  const canonicalTime = normalizeTime(
    canonicalTrip.departureTime || canonicalTrip.canonicalDepartureTime ||
    canonicalTrip.pickupTime || canonicalTrip.time
  );
  if (!canonicalTime) return { ok: false, error: "canonical_trip_time_missing", time: "" };

  const supplied = [input.time, input.pickupTime, input.departTime]
    .filter((value) => value != null && String(value).trim() !== "")
    .map(normalizeTime);
  if (!supplied.length || supplied.some((time) => !time || time !== canonicalTime)) {
    return { ok: false, error: "authoritative_time_mismatch", time: canonicalTime };
  }
  return { ok: true, error: "", time: canonicalTime };
}

module.exports = { normalizeTime, resolveBookingTime };
