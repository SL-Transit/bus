"use strict";

const SCHEMA_VERSION = "greenfield-erp-v1";
const INTERNAL_CHUNK_BYTES = 5 * 1024 * 1024;
const INTERNAL_CHUNK_PATHS = 5000;
const SERVICE_TIME = /^(?:[0-3]?\d|4[0-7]):[0-5]\d:[0-5]\d$/;

function issue(errors, code, path, message) {
  errors.push({ code, path, message });
}
function arrayOf(value, name, errors) {
  if (!Array.isArray(value)) {
    issue(errors, "type.array", name, name + " must be an array");
    return [];
  }
  return value;
}
function uniqueIndex(items, idField, name, errors) {
  const index = new Map();
  items.forEach(function (item, position) {
    const id = item && item[idField];
    if (typeof id !== "string" || id.length === 0) {
      issue(errors, "id.required", name + "[" + position + "]." + idField, "stable id is required");
    } else if (index.has(id)) {
      issue(errors, "id.duplicate", name + "[" + position + "]." + idField, id + " is duplicated");
    } else {
      index.set(id, item);
    }
  });
  return index;
}
function seconds(value) {
  if (typeof value !== "string" || !SERVICE_TIME.test(value)) return null;
  const parts = value.split(":").map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
function validateMetadata(metadata, errors) {
  if (!metadata || typeof metadata !== "object") {
    issue(errors, "metadata.required", "metadata", "metadata is required");
    return;
  }
  if (metadata.schemaVersion !== SCHEMA_VERSION) {
    issue(errors, "metadata.schemaVersion", "metadata.schemaVersion", "unsupported schema version");
  }
  if (metadata.mode !== "validate_only") {
    issue(errors, "metadata.mode", "metadata.mode", "Phase 1 accepts validate_only only");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(metadata.sourceChecksumSha256 || "")) {
    issue(errors, "metadata.checksum", "metadata.sourceChecksumSha256", "sha256 checksum is required");
  }
  if (!Array.isArray(metadata.operatorScope) || metadata.operatorScope.length === 0) {
    issue(errors, "metadata.operatorScope", "metadata.operatorScope", "operator scope is required");
  }
}
function validateNetworkPackage(pkg) {
  const errors = [];
  if (!pkg || typeof pkg !== "object") {
    return [{ code: "package.required", path: "$", message: "package is required" }];
  }
  validateMetadata(pkg.metadata, errors);
  const operators = arrayOf(pkg.operators, "operators", errors);
  const locations = arrayOf(pkg.locations, "locations", errors);
  const routes = arrayOf(pkg.routes, "routes", errors);
  const patterns = arrayOf(pkg.journeyPatterns, "journeyPatterns", errors);
  const calendars = arrayOf(pkg.serviceCalendars, "serviceCalendars", errors);
  const fixedTrips = arrayOf(pkg.fixedTrips, "fixedTrips", errors);
  const stopTimes = arrayOf(pkg.stopTimes, "stopTimes", errors);
  const frequencies = arrayOf(pkg.frequencyServices, "frequencyServices", errors);
  const fareProducts = arrayOf(pkg.fareProducts, "fareProducts", errors);
  const fareRules = arrayOf(pkg.fareRules, "fareRules", errors);
  const transfers = arrayOf(pkg.transferRules, "transferRules", errors);

  const operatorById = uniqueIndex(operators, "operatorId", "operators", errors);
  const locationById = uniqueIndex(locations, "locationId", "locations", errors);
  const routeById = uniqueIndex(routes, "routeId", "routes", errors);
  const patternById = uniqueIndex(patterns, "journeyPatternId", "journeyPatterns", errors);
  const calendarById = uniqueIndex(calendars, "serviceCalendarId", "serviceCalendars", errors);
  const tripById = uniqueIndex(fixedTrips, "fixedTripId", "fixedTrips", errors);
  uniqueIndex(stopTimes, "stopTimeId", "stopTimes", errors);
  const frequencyById = uniqueIndex(frequencies, "frequencyServiceId", "frequencyServices", errors);
  const fareProductById = uniqueIndex(fareProducts, "fareProductId", "fareProducts", errors);
  uniqueIndex(fareRules, "fareRuleId", "fareRules", errors);
  uniqueIndex(transfers, "transferRuleId", "transferRules", errors);

  routes.forEach(function (route, i) {
    if (!operatorById.has(route.operatorId)) issue(errors, "foreignKey.route.operator", "routes[" + i + "].operatorId", "operator does not exist");
    if (!["fixed", "frequency", "hybrid"].includes(route.serviceMode)) issue(errors, "route.serviceMode", "routes[" + i + "].serviceMode", "invalid serviceMode");
  });
  patterns.forEach(function (pattern, i) {
    if (!routeById.has(pattern.routeId)) issue(errors, "foreignKey.pattern.route", "journeyPatterns[" + i + "].routeId", "route does not exist");
    const stops = Array.isArray(pattern.stops) ? pattern.stops : [];
    if (stops.length < 2) issue(errors, "pattern.stops", "journeyPatterns[" + i + "].stops", "at least two stops are required");
    stops.forEach(function (stop, j) {
      if (stop.stopSequence !== j + 1) issue(errors, "pattern.sequence", "journeyPatterns[" + i + "].stops[" + j + "].stopSequence", "sequence must be contiguous from 1");
      if (!locationById.has(stop.locationId)) issue(errors, "foreignKey.pattern.location", "journeyPatterns[" + i + "].stops[" + j + "].locationId", "location does not exist");
    });
  });
  fixedTrips.forEach(function (trip, i) {
    const route = routeById.get(trip.routeId);
    const pattern = patternById.get(trip.journeyPatternId);
    if (!route) issue(errors, "foreignKey.fixedTrip.route", "fixedTrips[" + i + "].routeId", "route does not exist");
    if (route && !["fixed", "hybrid"].includes(route.serviceMode)) issue(errors, "fixedTrip.mode", "fixedTrips[" + i + "].routeId", "fixed trip requires fixed or hybrid route");
    if (!pattern || pattern.routeId !== trip.routeId) issue(errors, "foreignKey.fixedTrip.pattern", "fixedTrips[" + i + "].journeyPatternId", "pattern must exist on same route");
    if (!calendarById.has(trip.serviceCalendarId)) issue(errors, "foreignKey.fixedTrip.calendar", "fixedTrips[" + i + "].serviceCalendarId", "calendar does not exist");
    if (seconds(trip.departureTime) === null) issue(errors, "time.fixedTrip", "fixedTrips[" + i + "].departureTime", "invalid service time");
  });

  const timesByTrip = new Map();
  stopTimes.forEach(function (time, i) {
    if (!tripById.has(time.fixedTripId)) issue(errors, "foreignKey.stopTime.trip", "stopTimes[" + i + "].fixedTripId", "fixed trip does not exist");
    if (!locationById.has(time.locationId)) issue(errors, "foreignKey.stopTime.location", "stopTimes[" + i + "].locationId", "location does not exist");
    const arrival = seconds(time.arrivalTime);
    const departure = seconds(time.departureTime);
    if (arrival === null || departure === null || departure < arrival) issue(errors, "stopTime.rowOrder", "stopTimes[" + i + "]", "departure must not be before arrival");
    if (!timesByTrip.has(time.fixedTripId)) timesByTrip.set(time.fixedTripId, []);
    timesByTrip.get(time.fixedTripId).push({ time, i, arrival, departure });
  });
  timesByTrip.forEach(function (rows) {
    rows.sort(function (a, b) { return a.time.stopSequence - b.time.stopSequence; });
    let previousDeparture = null;
    rows.forEach(function (row, position) {
      if (row.time.stopSequence !== position + 1) issue(errors, "stopTime.sequence", "stopTimes[" + row.i + "].stopSequence", "sequence must be contiguous from 1");
      if (previousDeparture !== null && row.arrival !== null && row.arrival < previousDeparture) issue(errors, "stopTime.monotonic", "stopTimes[" + row.i + "].arrivalTime", "time moves backwards");
      previousDeparture = row.departure;
    });
  });

  frequencies.forEach(function (service, i) {
    const route = routeById.get(service.routeId);
    const pattern = patternById.get(service.journeyPatternId);
    if (!route) issue(errors, "foreignKey.frequency.route", "frequencyServices[" + i + "].routeId", "route does not exist");
    if (route && !["frequency", "hybrid"].includes(route.serviceMode)) issue(errors, "frequency.mode", "frequencyServices[" + i + "].routeId", "frequency requires frequency or hybrid route");
    if (!pattern || pattern.routeId !== service.routeId) issue(errors, "foreignKey.frequency.pattern", "frequencyServices[" + i + "].journeyPatternId", "pattern must exist on same route");
    if (!calendarById.has(service.serviceCalendarId)) issue(errors, "foreignKey.frequency.calendar", "frequencyServices[" + i + "].serviceCalendarId", "calendar does not exist");
    const start = seconds(service.startTime);
    const end = seconds(service.endTime);
    if (start === null || end === null || end <= start) issue(errors, "frequency.window", "frequencyServices[" + i + "]", "endTime must be after startTime");
    if (!Number.isInteger(service.headwaySeconds) || service.headwaySeconds < 60 || service.headwaySeconds > 86400) issue(errors, "frequency.headway", "frequencyServices[" + i + "].headwaySeconds", "headway must be 60..86400 seconds");
  });

  fareRules.forEach(function (rule, i) {
    if (!fareProductById.has(rule.fareProductId)) issue(errors, "foreignKey.fare.product", "fareRules[" + i + "].fareProductId", "fare product does not exist");
    if (!routeById.has(rule.routeId)) issue(errors, "foreignKey.fare.route", "fareRules[" + i + "].routeId", "route does not exist");
    ["originLocationId", "destinationLocationId"].forEach(function (field) {
      if (rule[field] && !locationById.has(rule[field])) issue(errors, "foreignKey.fare.location", "fareRules[" + i + "]." + field, "location does not exist");
    });
    if (!Number.isInteger(rule.amountMinor) || rule.amountMinor < 0) issue(errors, "fare.amountMinor", "fareRules[" + i + "].amountMinor", "amountMinor must be non-negative integer");
  });
  transfers.forEach(function (rule, i) {
    const path = "transferRules[" + i + "]";
    if (!locationById.has(rule.fromLocationId) || !locationById.has(rule.toLocationId)) issue(errors, "foreignKey.transfer.location", path, "transfer locations must exist");
    if (!Number.isInteger(rule.minimumTransferSeconds) || rule.minimumTransferSeconds < 0 || !Number.isInteger(rule.maximumTransferSeconds) || rule.maximumTransferSeconds < rule.minimumTransferSeconds) issue(errors, "transfer.window", path, "maximum must be >= a non-negative minimum");
    [["from", rule.fromOperatorId], ["to", rule.toOperatorId]].forEach(function (side) {
      if (side[1] && !operatorById.has(side[1])) issue(errors, "foreignKey.transfer.operator", path + "." + side[0] + "OperatorId", "operator does not exist");
    });
    [["from", rule.fromServiceMode, rule.fromServiceId, rule.fromOperatorId], ["to", rule.toServiceMode, rule.toServiceId, rule.toOperatorId]].forEach(function (side) {
      const name = side[0];
      const mode = side[1];
      const serviceId = side[2];
      const operatorId = side[3];
      if (mode && !["fixed", "frequency"].includes(mode)) issue(errors, "transfer.serviceMode", path + "." + name + "ServiceMode", "transfer service mode must be fixed or frequency");
      if (!serviceId) return;
      const fixed = tripById.get(serviceId);
      const frequency = frequencyById.get(serviceId);
      if (!fixed && !frequency) {
        issue(errors, "foreignKey.transfer.service", path + "." + name + "ServiceId", "fixed trip or frequency service does not exist");
        return;
      }
      if (fixed && frequency) {
        issue(errors, "transfer.serviceSelector", path + "." + name + "ServiceId", "service id is ambiguous across fixed and frequency services");
        return;
      }
      const service = fixed || frequency;
      const actualMode = fixed ? "fixed" : "frequency";
      const route = routeById.get(service.routeId);
      if ((mode && mode !== actualMode) || (operatorId && route && operatorId !== route.operatorId)) {
        issue(errors, "transfer.serviceSelector", path + "." + name + "ServiceId", "service id does not match transfer mode or operator");
      }
    });
  });
  return errors;
}
function expectedWaitSeconds(service) {
  return service && Number.isFinite(service.headwaySeconds) ? service.headwaySeconds / 2 : null;
}
function estimateChunks(records, options) {
  const settings = options || {};
  const maxBytes = settings.maxBytes || INTERNAL_CHUNK_BYTES;
  const maxPaths = settings.maxPaths || INTERNAL_CHUNK_PATHS;
  const chunks = [];
  let current = { bytes: 0, paths: 0, records: [] };
  (records || []).forEach(function (record) {
    const bytes = Buffer.byteLength(JSON.stringify(record), "utf8");
    const paths = Number.isInteger(record.leafPaths) ? record.leafPaths : 1;
    if (bytes > maxBytes || paths > maxPaths) throw new Error("record_exceeds_internal_chunk_limit");
    if (current.records.length && (current.bytes + bytes > maxBytes || current.paths + paths > maxPaths)) {
      chunks.push(current);
      current = { bytes: 0, paths: 0, records: [] };
    }
    current.bytes += bytes;
    current.paths += paths;
    current.records.push(record);
  });
  if (current.records.length) chunks.push(current);
  return chunks;
}
module.exports = { SCHEMA_VERSION, INTERNAL_CHUNK_BYTES, INTERNAL_CHUNK_PATHS, validateNetworkPackage, expectedWaitSeconds, estimateChunks };