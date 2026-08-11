"use strict";

const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { canonicalJson, checksum, leafCount, safeSegment } = require("./read-model-builder.js");

const ERP_BASE_PATH = "data/erpDataCenter";
const PUBLISHED_BASE_PATH = "publishedReadModels";
const MAX_ATOMIC_SWITCH_BYTES = 64 * 1024;
const MAX_ATOMIC_SWITCH_LOCATIONS = 3;
const VERIFY_READ_CONCURRENCY = 25;

function codedError(code, details) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function requireDatabase(database) {
  if (!database || typeof database.ref !== "function") throw codedError("publication_injected_database_required");
}

function pathSegments(path) {
  return String(path || "").split("/").map(function (segment, index) {
    return safeSegment(segment, path + ":" + index);
  });
}

function snapshotValue(snapshot) {
  return snapshot && typeof snapshot.exists === "function" && snapshot.exists() ? snapshot.val() : null;
}

function createRtdbEmulatorPublicationStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({
    projectId: input.projectId,
    databaseEmulatorHost: input.databaseEmulatorHost
  });
  requireDatabase(input.database);
  if (input.erpBasePath && input.erpBasePath !== ERP_BASE_PATH) throw codedError("publication_erp_base_path_locked");
  if (input.publishedBasePath && input.publishedBasePath !== PUBLISHED_BASE_PATH) throw codedError("publication_read_model_path_locked");
  const database = input.database;

  function versionRoot(versionId) {
    return PUBLISHED_BASE_PATH + "/versions/" + safeSegment(versionId, "versionId");
  }

  async function getManifest(versionId) {
    return snapshotValue(await database.ref(versionRoot(versionId) + "/manifest").get());
  }

  async function releaseLock(lockRef, token) {
    await lockRef.transaction(function (current) {
      return current && current.token === token ? null : current;
    }, undefined, false);
  }

  return {
    async beginVersion(manifest) {
      const ref = database.ref(versionRoot(manifest.versionId) + "/manifest");
      let conflict = false;
      const result = await ref.transaction(function (current) {
        if (current === null) return manifest;
        if (current.requestHash !== manifest.requestHash) conflict = true;
        return;
      }, undefined, false);
      if (conflict) throw codedError("publication_version_conflict");
      return { reused: !result.committed, manifest: snapshotValue(result.snapshot) || manifest };
    },

    async writeChunk(versionId, chunk) {
      const manifest = await getManifest(versionId);
      if (!manifest || manifest.status !== "building") throw codedError("publication_version_not_building");
      const root = versionRoot(versionId);
      const updates = {};
      chunk.records.forEach(function (record) {
        pathSegments(record.path);
        updates[record.path] = record.value;
      });
      updates["chunkManifests/" + safeSegment(chunk.chunkId, "chunkId")] = {
        bytes: chunk.bytes,
        leafPaths: chunk.leafPaths,
        recordCount: chunk.recordCount,
        checksum: chunk.checksum
      };
      const payloadBytes = Buffer.byteLength(JSON.stringify(updates), "utf8");
      const payloadLeafPaths = leafCount(updates);
      if (payloadBytes > 5 * 1024 * 1024 || payloadLeafPaths > 5000) {
        throw codedError("publication_chunk_physical_limit_exceeded");
      }
      await database.ref(root).update(updates);
      return { payloadBytes, payloadLeafPaths };
    },

    async verifyChunk(versionId, chunk) {
      const root = versionRoot(versionId);
      const descriptor = snapshotValue(await database.ref(root + "/chunkManifests/" + chunk.chunkId).get());
      if (!descriptor || descriptor.checksum !== chunk.checksum) throw codedError("publication_chunk_descriptor_mismatch");
      const actual = [];
      for (let offset = 0; offset < chunk.records.length; offset += VERIFY_READ_CONCURRENCY) {
        const batch = chunk.records.slice(offset, offset + VERIFY_READ_CONCURRENCY);
        const values = await Promise.all(batch.map(function (record) {
          return database.ref(root + "/" + record.path).get();
        }));
        values.forEach(function (snapshot, index) {
          actual.push({ path: batch[index].path, value: snapshotValue(snapshot) });
        });
      }
      if (checksum(actual) !== chunk.checksum) throw codedError("publication_chunk_checksum_mismatch");
      return true;
    },

    async finalizeVersion(versionId, readyManifest) {
      const ref = database.ref(versionRoot(versionId) + "/manifest");
      let rejected = false;
      const result = await ref.transaction(function (current) {
        if (!current || current.requestHash !== readyManifest.requestHash || current.status !== "building") {
          rejected = true;
          return;
        }
        return readyManifest;
      }, undefined, false);
      if (rejected || !result.committed) throw codedError("publication_finalize_rejected");
      return snapshotValue(result.snapshot);
    },

    async failVersion(versionId, failureCode) {
      const ref = database.ref(versionRoot(versionId) + "/manifest");
      await ref.transaction(function (current) {
        if (!current || current.status !== "building") return;
        return { ...current, status: "failed", failureCode: String(failureCode || "publication_stage_failed") };
      }, undefined, false);
    },

    getManifest,

    async atomicSwitch(command) {
      const token = safeSegment(command.eventId, "eventId");
      const lockRef = database.ref(ERP_BASE_PATH + "/publication/locks/current");
      const lockStart = Date.parse(command.switchedAt);
      if (Number.isNaN(lockStart)) throw codedError("publication_switch_time_invalid");
      let denied = false;
      const lockResult = await lockRef.transaction(function (current) {
        const expires = current && Date.parse(current.expiresAt);
        if (current && current.token !== token && Number.isFinite(expires) && expires > lockStart) {
          denied = true;
          return;
        }
        return {
          token,
          acquiredAt: command.switchedAt,
          expiresAt: new Date(lockStart + 30000).toISOString()
        };
      }, undefined, false);
      if (denied || !lockResult.committed) throw codedError("publication_pointer_locked");

      try {
        const manifest = await getManifest(command.targetVersionId);
        if (!manifest || manifest.status !== "ready" || manifest.manifestHash !== command.manifest.manifestHash) {
          throw codedError("publication_version_not_ready");
        }
        const current = snapshotValue(await database.ref(PUBLISHED_BASE_PATH + "/current").get());
        const currentVersionId = current && current.versionId || null;
        if (currentVersionId !== command.expectedCurrentVersionId) {
          throw codedError("publication_current_version_conflict", { currentVersionId });
        }
        if (currentVersionId === command.targetVersionId) {
          return { ok: true, reused: true, versionId: command.targetVersionId, previousVersionId: currentVersionId };
        }

        const pointer = {
          versionId: command.targetVersionId,
          schemaVersion: manifest.schemaVersion,
          manifestHash: manifest.manifestHash,
          publishedAt: command.switchedAt
        };
        const history = {
          eventId: command.eventId,
          action: command.action,
          requestId: command.requestId,
          fromVersionId: currentVersionId,
          toVersionId: command.targetVersionId,
          actorUid: command.actorUid,
          reason: command.reason,
          occurredAt: command.switchedAt
        };
        const audit = {
          eventId: command.eventId,
          eventType: command.action === "rollback" ? "publication.rolledBack" : "publication.published",
          entityId: command.targetVersionId,
          actorUid: command.actorUid,
          occurredAt: command.switchedAt
        };
        const updates = {};
        updates[PUBLISHED_BASE_PATH + "/current"] = pointer;
        updates[ERP_BASE_PATH + "/publication/history/" + command.eventId] = history;
        updates[ERP_BASE_PATH + "/audit/events/" + command.eventId] = audit;
        const paths = Object.keys(updates);
        const bytes = Buffer.byteLength(canonicalJson(updates), "utf8");
        if (paths.length !== MAX_ATOMIC_SWITCH_LOCATIONS || bytes > MAX_ATOMIC_SWITCH_BYTES) {
          throw codedError("publication_atomic_switch_limit_exceeded");
        }
        await database.ref().update(updates);
        return {
          ok: true,
          reused: false,
          versionId: command.targetVersionId,
          previousVersionId: currentVersionId,
          eventId: command.eventId,
          atomicLocations: paths.length,
          atomicBytes: bytes
        };
      } finally {
        await releaseLock(lockRef, token);
      }
    }
  };
}

module.exports = {
  ERP_BASE_PATH,
  MAX_ATOMIC_SWITCH_BYTES,
  MAX_ATOMIC_SWITCH_LOCATIONS,
  PUBLISHED_BASE_PATH,
  VERIFY_READ_CONCURRENCY,
  createRtdbEmulatorPublicationStore
};