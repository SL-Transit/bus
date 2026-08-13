"use strict";

const crypto = require("node:crypto");
const { validateNetworkPackage } = require("../../contracts/greenfield-erp/v1/runtime/validate-network-package.js");

const MAX_IMPORT_PACKAGE_BYTES = 25 * 1024 * 1024;
const MAX_ENTITY_RECORDS = 50000;
const ENTITY_ARRAYS = [
  "operators", "locations", "routes", "journeyPatterns", "serviceCalendars",
  "fixedTrips", "stopTimes", "frequencyServices", "fareProducts", "fareRules", "transferRules"
];
const OPERATIONAL_ENTITY_ARRAYS = [
  "accounts", "accountAccesses", "locationAccesses", "locationSurveys", "routeDrafts",
  "routeDraftStops", "calendarExceptions", "queues", "vehicles", "drivers", "vehicleBlocks",
  "driverDuties", "assignments", "bookingPolicies", "incidents", "platformAssignments", "serviceGroups",
  "scheduleRules", "dailyQueueRules"
];

function hash(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}
function packageSizeBytes(pkg) {
  return Buffer.byteLength(JSON.stringify(pkg), "utf8");
}
function entityCount(pkg) {
  const networkCount = ENTITY_ARRAYS.reduce(function (total, key) {
    return total + (Array.isArray(pkg[key]) ? pkg[key].length : 0);
  }, 0);
  const operational = pkg && pkg.operationalRecords || {};
  return OPERATIONAL_ENTITY_ARRAYS.reduce(function (total, key) {
    return total + (Array.isArray(operational[key]) ? operational[key].length : 0);
  }, networkCount);
}
function assertStore(store) {
  if (!store || typeof store.findExistingDraft !== "function" || typeof store.saveValidatedDraft !== "function") {
    throw new Error("greenfield_draft_store_required");
  }
}
async function createValidatedDraft(input) {
  const options = input || {};
  const pkg = options.package;
  const actorUid = options.actorUid;
  const store = options.store;
  const now = typeof options.now === "function" ? options.now : function () { return new Date().toISOString(); };
  assertStore(store);
  if (typeof actorUid !== "string" || actorUid.length === 0) {
    throw new Error("greenfield_actor_uid_required");
  }
  const bytes = packageSizeBytes(pkg);
  if (bytes > MAX_IMPORT_PACKAGE_BYTES) {
    return { ok: false, code: "import_package_too_large", errors: [] };
  }
  const records = entityCount(pkg || {});
  if (records > MAX_ENTITY_RECORDS) {
    return { ok: false, code: "import_package_too_many_records", errors: [] };
  }
  if (options.draftExpiresAt !== undefined && (typeof options.draftExpiresAt !== "string" || Number.isNaN(Date.parse(options.draftExpiresAt)))) {
    throw new Error("greenfield_draft_expiry_invalid");
  }
  const errors = validateNetworkPackage(pkg);
  if (errors.length) {
    return { ok: false, code: "validation_failed", errors };
  }

  const key = pkg.metadata.idempotencyKey;
  const idempotencyHash = hash(key);
  const existing = await store.findExistingDraft(idempotencyHash);
  if (existing) {
    return {
      ok: true,
      reused: true,
      draftId: existing.draftId,
      packageId: existing.packageId,
      validationErrors: []
    };
  }

  const draftId = "DRF-" + hash(pkg.metadata.packageId + ":" + key).slice(0, 24).toUpperCase();
  const createdAt = now();
  await store.saveValidatedDraft({
    draftId,
    package: pkg,
    actorUid,
    createdAt,
    idempotencyHash,
    packageBytes: bytes,
    entityCount: records,
    expiresAt: options.draftExpiresAt || null
  });
  return {
    ok: true,
    reused: false,
    draftId,
    packageId: pkg.metadata.packageId,
    packageBytes: bytes,
    entityCount: records,
    expiresAt: options.draftExpiresAt || null,
    validationErrors: []
  };
}

module.exports = {
  MAX_IMPORT_PACKAGE_BYTES,
  MAX_ENTITY_RECORDS,
  ENTITY_ARRAYS,
  OPERATIONAL_ENTITY_ARRAYS,
  createValidatedDraft,
  packageSizeBytes,
  entityCount
};
