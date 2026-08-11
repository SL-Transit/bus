"use strict";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error("invalid_retention_policy:" + name);
  return value;
}

function parseRetentionPolicy(value) {
  const input = typeof value === "string" ? JSON.parse(value) : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("retention_policy_required");
  if (!DATE_PATTERN.test(input.cleanupStartDate || "")) throw new Error("invalid_retention_policy:cleanupStartDate");
  const parsed = {
    importJobRetentionHours: requiredInteger(input.importJobRetentionHours, "importJobRetentionHours", 1, 24 * 365),
    abandonedDraftRetentionDays: requiredInteger(input.abandonedDraftRetentionDays, "abandonedDraftRetentionDays", 1, 3650),
    cleanupStartDate: input.cleanupStartDate,
    batchSize: requiredInteger(input.batchSize, "batchSize", 1, 100),
    maxDaysPerRun: requiredInteger(input.maxDaysPerRun, "maxDaysPerRun", 1, 31),
    leaseSeconds: requiredInteger(input.leaseSeconds, "leaseSeconds", 30, 1800)
  };
  return Object.freeze(parsed);
}

function addHours(iso, hours) { return new Date(Date.parse(iso) + hours * 3600000).toISOString(); }
function addDays(iso, days) { return new Date(Date.parse(iso) + days * 86400000).toISOString(); }
function dateKey(iso) { return String(iso).slice(0, 10); }
function nextDateKey(value) { return new Date(Date.parse(value + "T00:00:00.000Z") + 86400000).toISOString().slice(0, 10); }

module.exports = { DATE_PATTERN, addDays, addHours, dateKey, nextDateKey, parseRetentionPolicy };