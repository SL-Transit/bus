"use strict";

const crypto = require("node:crypto");
const { assertDemoDatabaseEmulator } = require("./environment-guard.js");
const { estimateChunks, INTERNAL_CHUNK_BYTES, INTERNAL_CHUNK_PATHS } = require("../../contracts/greenfield-erp/v1/runtime/validate-network-package.js");

const DEFAULT_BASE_PATH = "data/erpDataCenter";
const ID_FIELDS = Object.freeze({
  operators: "operatorId",
  locations: "locationId",
  routes: "routeId",
  journeyPatterns: "journeyPatternId",
  serviceCalendars: "serviceCalendarId",
  fixedTrips: "fixedTripId",
  stopTimes: "stopTimeId",
  frequencyServices: "frequencyServiceId",
  fareProducts: "fareProductId",
  fareRules: "fareRuleId",
  transferRules: "transferRuleId"
});

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}
function safeSegment(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[.#$[\]/]/.test(value)) {
    throw new Error("greenfield_unsafe_path_segment:" + label);
  }
  return value;
}
function leafCount(value) {
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) {
    return value.reduce(function (sum, item) { return sum + leafCount(item); }, 0) || 1;
  }
  const values = Object.values(value);
  return values.reduce(function (sum, item) { return sum + leafCount(item); }, 0) || 1;
}
function entityRecords(draftId, pkg) {
  const records = [];
  Object.keys(ID_FIELDS).forEach(function (entityType) {
    const idField = ID_FIELDS[entityType];
    (pkg[entityType] || []).forEach(function (value) {
      const id = safeSegment(value[idField], idField);
      records.push({
        path: "authoring/drafts/" + draftId + "/entities/" + entityType + "/" + id,
        value,
        leafPaths: leafCount(value)
      });
    });
  });
  return records;
}
function assertDatabase(database) {
  if (!database || typeof database.ref !== "function") {
    throw new Error("greenfield_injected_database_required");
  }
}
function createRtdbEmulatorDraftStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({
    projectId: input.projectId,
    databaseEmulatorHost: input.databaseEmulatorHost
  });
  assertDatabase(input.database);
  const database = input.database;
  const basePath = input.basePath || DEFAULT_BASE_PATH;
  if (basePath !== DEFAULT_BASE_PATH) {
    throw new Error("greenfield_erp_base_path_locked");
  }

  return {
    async findExistingDraft(idempotencyHash) {
      safeSegment(idempotencyHash, "idempotencyHash");
      const snapshot = await database.ref(basePath + "/importPackagesByIdempotency/" + idempotencyHash).get();
      return snapshot && typeof snapshot.exists === "function" && snapshot.exists() ? snapshot.val() : null;
    },

    async saveValidatedDraft(inputDraft) {
      const draftId = safeSegment(inputDraft.draftId, "draftId");
      const packageId = safeSegment(inputDraft.package.metadata.packageId, "packageId");
      const auditEventId = "AUD-" + digest(draftId + ":" + inputDraft.createdAt).slice(0, 24).toUpperCase();
      const metadataPath = basePath + "/authoring/drafts/" + draftId + "/metadata";

      await database.ref(metadataPath).set({
        draftId,
        packageId,
        schemaVersion: inputDraft.package.metadata.schemaVersion,
        status: "writing",
        revision: 0,
        createdAt: inputDraft.createdAt,
        createdByUid: inputDraft.actorUid,
        packageBytes: inputDraft.packageBytes,
        entityCount: inputDraft.entityCount
      });

      const records = entityRecords(draftId, inputDraft.package);
      const chunks = estimateChunks(records, {
        maxBytes: INTERNAL_CHUNK_BYTES,
        maxPaths: INTERNAL_CHUNK_PATHS
      });
      for (const chunk of chunks) {
        const updates = {};
        chunk.records.forEach(function (record) {
          updates[record.path] = record.value;
        });
        await database.ref(basePath).update(updates);
      }

      const finalUpdates = {};
      finalUpdates["authoring/drafts/" + draftId + "/metadata/status"] = "draft";
      finalUpdates["authoring/drafts/" + draftId + "/metadata/revision"] = 1;
      finalUpdates["importPackages/" + packageId + "/metadata"] = {
        packageId,
        schemaVersion: inputDraft.package.metadata.schemaVersion,
        templateVersion: inputDraft.package.metadata.templateVersion,
        sourceChecksumSha256: inputDraft.package.metadata.sourceChecksumSha256,
        mode: "validate_only",
        status: "validated",
        draftId
      };
      finalUpdates["importPackagesByIdempotency/" + inputDraft.idempotencyHash] = {
        packageId,
        draftId
      };
      finalUpdates["audit/events/" + auditEventId] = {
        eventId: auditEventId,
        eventType: "draft.created",
        entityId: draftId,
        actorUid: inputDraft.actorUid,
        occurredAt: inputDraft.createdAt
      };
      await database.ref(basePath).update(finalUpdates);
      return { draftId, chunkCount: chunks.length, status: "draft" };
    }
  };
}

module.exports = {
  DEFAULT_BASE_PATH,
  ID_FIELDS,
  createRtdbEmulatorDraftStore,
  entityRecords,
  leafCount
};