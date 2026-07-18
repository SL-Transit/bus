"use strict";

const { buildDriverWorkDay } = require("./driver-work-producer.js");

const DEFAULT_ROTATION_CONFIG = {
  enabled: true,
  baseDate: "2026-07-16",
  vehicles: ["veh_001", "veh_002", "veh_003", "veh_004"],
  queues: ["queue_001", "queue_002", "queue_003", "queue_004"],
  baseAssignments: {
    veh_001: "queue_001",
    veh_002: "queue_002",
    veh_003: "queue_003",
    veh_004: "queue_004"
  }
};

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function bangkokParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = {};
  formatter.formatToParts(date || new Date()).forEach((part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
  });
  return parts;
}

function bangkokServiceDate(date) {
  const parts = bangkokParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function bangkokTime(date) {
  const parts = bangkokParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function dateOrdinal(serviceDate) {
  const match = clean(serviceDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function daysBetween(baseDate, serviceDate) {
  const base = dateOrdinal(baseDate);
  const target = dateOrdinal(serviceDate);
  if (base === null || target === null) return null;
  return target - base;
}

function normalizeRotationConfig(config) {
  const source = config && config.enabled !== false ? config : DEFAULT_ROTATION_CONFIG;
  const merged = Object.assign({}, DEFAULT_ROTATION_CONFIG, source || {});
  merged.vehicles = Array.isArray(merged.vehicles) && merged.vehicles.length ? merged.vehicles.map(clean).filter(Boolean) : DEFAULT_ROTATION_CONFIG.vehicles;
  merged.queues = Array.isArray(merged.queues) && merged.queues.length ? merged.queues.map(clean).filter(Boolean) : DEFAULT_ROTATION_CONFIG.queues;
  merged.baseAssignments = Object.assign({}, DEFAULT_ROTATION_CONFIG.baseAssignments, merged.baseAssignments || {});
  return merged;
}

function buildRotatingDailyAssignments(serviceDate, rotationConfig) {
  const config = normalizeRotationConfig(rotationConfig);
  if (config.enabled === false) return {};
  const offset = daysBetween(config.baseDate, serviceDate);
  if (offset === null || !config.vehicles.length || !config.queues.length) return {};
  const assignments = {};
  config.vehicles.forEach((vehicleId) => {
    const baseQueue = clean(config.baseAssignments[vehicleId]);
    const baseIndex = config.queues.indexOf(baseQueue);
    if (baseIndex < 0) return;
    const queueIndex = ((baseIndex + offset) % config.queues.length + config.queues.length) % config.queues.length;
    const queueId = config.queues[queueIndex];
    assignments[vehicleId] = {
      assignmentId: `auto_${serviceDate.replace(/-/g, "")}_${vehicleId}_${queueId}`,
      queueId
    };
  });
  return assignments;
}

function mergeAssignments(autoAssignments, storedAssignments) {
  return Object.assign({}, autoAssignments || {}, storedAssignments || {});
}

function buildUpdates(input) {
  input = input || {};
  const serviceDate = clean(input.serviceDate);
  const currentTime = clean(input.currentTime);
  const erpDataCenter = input.erpDataCenter || {};
  const hasErp = erpDataCenter && erpDataCenter.fleet && erpDataCenter.fleet.vehicles && erpDataCenter.fleet.queues;
  const autoAssignments = buildRotatingDailyAssignments(serviceDate, input.rotationConfig);
  const dailyAssignments = mergeAssignments(autoAssignments, input.dailyAssignments);
  const result = buildDriverWorkDay({
    erpDataCenter,
    serviceDate,
    currentTime,
    dailyAssignments,
    manualOverrides: input.manualOverrides
  });
  const updates = {};
  Object.entries(result.contractsByRuntimeVehicleId || {}).forEach(([vehicleId, contract]) => {
    updates[`operations/driverWorkByServiceDate/${serviceDate}/${vehicleId}`] = contract;
  });
  updates[`operations/driverWorkGenerationStatus/${serviceDate}`] = {
    generatedAt: input.generatedAt || Date.now(),
    serviceDate,
    currentTime,
    source: "auto_driver_work_scheduler",
    status: hasErp && result.blockers.length === 0 ? "ready" : "blocked",
    readyCount: result.counts.ready,
    serviceCompleteCount: result.counts.serviceComplete,
    unassignedCount: result.counts.unassigned,
    fixedCount: result.counts.fixed,
    rotationCount: result.counts.rotation,
    manualOverrideCount: result.counts.manualOverride,
    blockers: result.blockers.slice(0, 20),
    autoAssignments
  };
  return {
    serviceDate,
    currentTime,
    dailyAssignments,
    result,
    updates
  };
}

module.exports = {
  DEFAULT_ROTATION_CONFIG,
  bangkokServiceDate,
  bangkokTime,
  buildRotatingDailyAssignments,
  buildUpdates,
  daysBetween,
  normalizeRotationConfig,
  mergeAssignments
};
