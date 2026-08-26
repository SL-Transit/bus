"use strict";

const crypto = require("node:crypto");
const { validateNetworkPackage } = require("../../contracts/greenfield-erp/v1/runtime/validate-network-package.js");

const PUBLISHED_SCHEMA_VERSION = "published-read-model-v1";
const MAX_SERVICE_DATES = 31;
const FORBIDDEN_SEGMENT = /[.#$[\]/]/;

function codedError(code, details) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce(function (output, key) {
      output[key] = canonicalize(value[key]);
      return output;
    }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function checksum(value) {
  return "sha256:" + crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function leafCount(value) {
  if (value === null || typeof value !== "object") return 1;
  const values = Array.isArray(value) ? value : Object.values(value);
  return values.reduce(function (sum, child) { return sum + leafCount(child); }, 0) || 1;
}

function safeSegment(value, label) {
  const text = String(value || "");
  if (!text || FORBIDDEN_SEGMENT.test(text)) throw codedError("published_unsafe_path_segment", label);
  return text;
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeServiceDates(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_SERVICE_DATES) {
    throw codedError("published_service_dates_required");
  }
  const dates = Array.from(new Set(values));
  dates.forEach(function (date) {
    if (!validDateKey(date)) throw codedError("published_service_date_invalid", date);
  });
  return dates.sort();
}

function indexBy(items, field) {
  return (items || []).reduce(function (result, item) {
    result[item[field]] = item;
    return result;
  }, {});
}

function calendarActive(calendar, date) {
  if (!calendar || date < calendar.startDate || date > calendar.endDate) return false;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = new Date(date + "T00:00:00.000Z").getUTCDay();
  return Boolean(calendar.weekdays && calendar.weekdays[dayNames[day]]);
}

function buildPublishedRecords(input) {
  const options = input || {};
  const pkg = options.package;
  const validationErrors = validateNetworkPackage(pkg);
  if (validationErrors.length) throw codedError("published_source_validation_failed", validationErrors);
  const serviceDates = normalizeServiceDates(options.serviceDates);
  const routing = options.routingSupplements || {};
  const segmentDurations = routing.segmentTravelSecondsByPatternId || {};

  const operators = indexBy(pkg.operators, "operatorId");
  const locations = indexBy(pkg.locations, "locationId");
  const routes = indexBy(pkg.routes, "routeId");
  const patterns = indexBy(pkg.journeyPatterns, "journeyPatternId");
  const calendars = indexBy(pkg.serviceCalendars, "serviceCalendarId");
  const recordMap = new Map();

  function add(path, value) {
    path.split("/").forEach(function (segment, position) {
      safeSegment(segment, path + ":" + position);
    });
    const normalized = canonicalize(value);
    if (recordMap.has(path) && canonicalJson(recordMap.get(path).value) !== canonicalJson(normalized)) {
      throw codedError("published_duplicate_path_conflict", path);
    }
    recordMap.set(path, { path, value: normalized, leafPaths: leafCount(normalized) });
  }

  Object.values(operators).forEach(function (item) { add("operatorsById/" + item.operatorId, item); });
  Object.values(locations).forEach(function (item) {
    add("locationsById/" + item.locationId, item);
    if (item.parentLocationId) {
      add("networkIndexes/parentLocationByLocationId/" + item.locationId, item.parentLocationId);
      add("networkIndexes/childrenByLocationId/" + item.parentLocationId + "/" + item.locationId, true);
    }
  });
  Object.values(routes).forEach(function (item) { add("routesById/" + item.routeId, item); });
  Object.values(calendars).forEach(function (item) { add("calendarsById/" + item.serviceCalendarId, item); });

  Object.values(patterns).forEach(function (pattern) {
    add("patternsByRouteId/" + pattern.routeId + "/" + pattern.journeyPatternId, {
      journeyPatternId: pattern.journeyPatternId,
      routeId: pattern.routeId,
      direction: pattern.direction
    });
    pattern.stops.forEach(function (stop) {
      const sequenceKey = String(stop.stopSequence).padStart(6, "0");
      add("patternStopsByPatternId/" + pattern.journeyPatternId + "/" + sequenceKey, stop);
      add("networkIndexes/routesByLocationId/" + stop.locationId + "/" + pattern.routeId, true);
      add("networkIndexes/patternsByLocationId/" + stop.locationId + "/" + pattern.journeyPatternId, pattern.routeId);
    });
  });

  pkg.fixedTrips.forEach(function (trip) {
    serviceDates.forEach(function (date) {
      if (calendarActive(calendars[trip.serviceCalendarId], date)) {
        add("fixedTripsByRouteDate/" + trip.routeId + "/" + date + "/" + trip.fixedTripId, trip);
      }
    });
  });

  pkg.stopTimes.forEach(function (time) {
    const sequenceKey = String(time.stopSequence).padStart(6, "0");
    add("stopTimesByTripId/" + time.fixedTripId + "/" + sequenceKey, time);
  });

  const frequencyPatternIds = new Set();
  pkg.frequencyServices.forEach(function (service) {
    frequencyPatternIds.add(service.journeyPatternId);
    serviceDates.forEach(function (date) {
      if (calendarActive(calendars[service.serviceCalendarId], date)) {
        add("frequenciesByRouteDate/" + service.routeId + "/" + date + "/" + service.frequencyServiceId, service);
      }
    });
  });

  frequencyPatternIds.forEach(function (patternId) {
    const pattern = patterns[patternId];
    const durations = segmentDurations[patternId] || {};
    for (let sequence = 1; sequence < pattern.stops.length; sequence += 1) {
      const duration = durations[String(sequence)];
      if (!Number.isInteger(duration) || duration <= 0 || duration > 86400) {
        throw codedError("frequency_segment_runtime_required", {
          journeyPatternId: patternId,
          fromStopSequence: sequence
        });
      }
      add("networkIndexes/segmentTravelSecondsByPatternId/" + patternId + "/" + String(sequence), duration);
    }
  });

  pkg.fareProducts.forEach(function (item) { add("fareProductsById/" + item.fareProductId, item); });
  pkg.fareRules.forEach(function (item) {
    add("fareRulesByRouteId/" + item.routeId + "/" + item.fareRuleId, item);
  });
  pkg.transferRules.forEach(function (item) {
    add("transfersByLocationId/" + item.fromLocationId + "/" + item.transferRuleId, item);
    add("networkIndexes/transfersToByLocationId/" + item.toLocationId + "/" + item.transferRuleId, item.fromLocationId);
  });

  const records = Array.from(recordMap.values()).sort(function (a, b) { return a.path.localeCompare(b.path); });
  const nodeCounts = records.reduce(function (counts, record) {
    const node = record.path.split("/")[0];
    counts[node] = (counts[node] || 0) + 1;
    return counts;
  }, {});

  return Object.freeze({
    schemaVersion: PUBLISHED_SCHEMA_VERSION,
    sourceSchemaVersion: pkg.metadata.schemaVersion,
    sourcePackageId: pkg.metadata.packageId,
    serviceDates,
    records,
    nodeCounts: canonicalize(nodeCounts),
    recordCount: records.length,
    leafPathCount: records.reduce(function (sum, record) { return sum + record.leafPaths; }, 0),
    modelHash: checksum(records.map(function (record) { return { path: record.path, value: record.value }; }))
  });
}

function materializeRecords(records) {
  const root = {};
  (records || []).forEach(function (record) {
    const segments = record.path.split("/");
    let cursor = root;
    segments.forEach(function (segment, position) {
      if (position === segments.length - 1) cursor[segment] = canonicalize(record.value);
      else {
        cursor[segment] = cursor[segment] || {};
        cursor = cursor[segment];
      }
    });
  });
  return root;
}

module.exports = {
  MAX_SERVICE_DATES,
  PUBLISHED_SCHEMA_VERSION,
  buildPublishedRecords,
  calendarActive,
  canonicalJson,
  canonicalize,
  checksum,
  leafCount,
  materializeRecords,
  normalizeServiceDates,
  safeSegment
};