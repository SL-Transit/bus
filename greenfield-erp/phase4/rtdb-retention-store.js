"use strict";

const crypto = require("node:crypto");
const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { DEFAULT_BASE_PATH } = require("../phase2/rtdb-emulator-draft-store.js");
const { ENTITY_ARRAYS } = require("../phase2/draft-service.js");
const { dateKey } = require("./retention-policy.js");

function digest(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function safe(value, name) { if (typeof value !== "string" || !value || /[.#$[\]/]/.test(value)) throw new Error("unsafe_cleanup_segment:" + name); return value; }
function snapshotKeys(snapshot, type) { const values = snapshot && snapshot.val() || {}; return Object.keys(values).map(function (id) { return { type, id, expiryDateKey: null }; }); }

function createRtdbRetentionStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({ projectId: input.projectId, databaseEmulatorHost: input.databaseEmulatorHost });
  if (!input.database || typeof input.database.ref !== "function") throw new Error("greenfield_injected_database_required");
  if (typeof input.deleteSource !== "function") throw new Error("greenfield_source_deleter_required");
  const database = input.database;
  const basePath = input.basePath || DEFAULT_BASE_PATH;
  if (basePath !== DEFAULT_BASE_PATH) throw new Error("greenfield_erp_base_path_locked");

  async function defer(type, id, oldDate, now) {
    const nextDate = new Date(Date.parse(now) + 86400000).toISOString().slice(0, 10);
    const updates = {};
    updates["maintenance/expiryBuckets/" + oldDate + "/" + type + "/" + id] = null;
    updates["maintenance/expiryBuckets/" + nextDate + "/" + type + "/" + id] = true;
    await database.ref(basePath).update(updates);
    return { action: "deferred", nextDate };
  }

  return Object.freeze({
    async acquireLease(lease) {
      safe(lease.runId, "runId");
      const leaseRef = database.ref(basePath + "/maintenance/cleanupLease");
      await leaseRef.get();
      const result = await leaseRef.transaction(function (current) {
        if (current && current.leaseExpiresAt > lease.startedAt && current.runId !== lease.runId) return;
        return lease;
      }, undefined, false);
      return Boolean(result && result.committed);
    },
    async releaseLease(runId) {
      const leaseRef = database.ref(basePath + "/maintenance/cleanupLease");
      await leaseRef.get();
      await leaseRef.transaction(function (current) { return current && current.runId === runId ? null : current; }, undefined, false);
    },
    async getCursor() {
      const snapshot = await database.ref(basePath + "/maintenance/cleanupState/nextDate").get();
      return snapshot.exists() ? snapshot.val() : null;
    },
    async saveCursor(value) { await database.ref(basePath + "/maintenance/cleanupState/nextDate").set(value); },
    async listCandidates(expiryDateKey, limit) {
      const jobSnapshot = await database.ref(basePath + "/maintenance/expiryBuckets/" + expiryDateKey + "/importJobs").limitToFirst(limit).get();
      const jobs = snapshotKeys(jobSnapshot, "importJobs").map(function (item) { return { ...item, expiryDateKey }; });
      if (jobs.length >= limit) return jobs;
      const uploadSnapshot = await database.ref(basePath + "/maintenance/expiryBuckets/" + expiryDateKey + "/uploadAuthorizations").limitToFirst(limit - jobs.length).get();
      const uploads = snapshotKeys(uploadSnapshot, "uploadAuthorizations").map(function (item) { return { ...item, expiryDateKey }; });
      if (jobs.length + uploads.length >= limit) return jobs.concat(uploads);
      const draftSnapshot = await database.ref(basePath + "/maintenance/expiryBuckets/" + expiryDateKey + "/drafts").limitToFirst(limit - jobs.length - uploads.length).get();
      return jobs.concat(uploads, snapshotKeys(draftSnapshot, "drafts").map(function (item) { return { ...item, expiryDateKey }; }));
    },
    async cleanupImportJob(candidate) {
      safe(candidate.id, "jobId");
      const path = basePath + "/importJobs/" + candidate.id + "/metadata";
      const snapshot = await database.ref(path).get();
      if (!snapshot.exists()) {
        await database.ref(basePath + "/maintenance/expiryBuckets/" + candidate.expiryDateKey + "/importJobs/" + candidate.id).remove();
        return { action: "stale_index_removed" };
      }
      const job = snapshot.val();
      if (job.protectedFromCleanup === true || !job.expiresAt || job.expiresAt > candidate.now || (job.status === "processing" && job.leaseExpiresAt > candidate.now)) return defer("importJobs", candidate.id, candidate.expiryDateKey, candidate.now);
      if (!["queued", "retryable", "failed", "completed"].includes(job.status)) return defer("importJobs", candidate.id, candidate.expiryDateKey, candidate.now);
      if (job.source) await input.deleteSource(job.source);
      const auditId = "AUD-" + digest(candidate.id + ":cleanup:" + candidate.now).slice(0, 24).toUpperCase();
      const updates = {};
      updates["importJobs/" + candidate.id] = null;
      updates["taskOutbox/importValidation/" + candidate.id] = null;
      if (job.requestHash) updates["importJobsByRequest/" + job.requestHash] = null;
      updates["maintenance/expiryBuckets/" + candidate.expiryDateKey + "/importJobs/" + candidate.id] = null;
      updates["audit/events/" + auditId] = { eventId: auditId, eventType: "retention.import_job.deleted", entityId: candidate.id, actorUid: "system:retention", occurredAt: candidate.now };
      await database.ref(basePath).update(updates);
      return { action: "deleted" };
    },
    async cleanupUploadAuthorization(candidate) {
      safe(candidate.id, "uploadId");
      const path = basePath + "/uploadAuthorizations/" + candidate.id;
      const snapshot = await database.ref(path).get();
      if (!snapshot.exists()) {
        await database.ref(basePath + "/maintenance/expiryBuckets/" + candidate.expiryDateKey + "/uploadAuthorizations/" + candidate.id).remove();
        return { action: "stale_index_removed" };
      }
      const authorization = snapshot.val();
      if (authorization.protectedFromCleanup === true || !authorization.expiresAt || authorization.expiresAt > candidate.now) {
        return defer("uploadAuthorizations", candidate.id, candidate.expiryDateKey, candidate.now);
      }
      await input.deleteSource({
        bucket: authorization.bucket,
        objectPath: authorization.objectPath,
        contentType: authorization.contentType,
        sizeBytes: authorization.sizeBytes,
        checksumSha256: authorization.checksumSha256
      });
      const auditId = "AUD-" + digest(candidate.id + ":cleanup:" + candidate.now).slice(0, 24).toUpperCase();
      const updates = {};
      updates["uploadAuthorizations/" + candidate.id] = null;
      updates["maintenance/expiryBuckets/" + candidate.expiryDateKey + "/uploadAuthorizations/" + candidate.id] = null;
      updates["audit/events/" + auditId] = { eventId: auditId, eventType: "retention.upload_authorization.deleted", entityId: candidate.id, actorUid: "system:retention", occurredAt: candidate.now };
      await database.ref(basePath).update(updates);
      return { action: "deleted" };
    },    async cleanupDraft(candidate) {
      safe(candidate.id, "draftId");
      const metadataSnapshot = await database.ref(basePath + "/authoring/drafts/" + candidate.id + "/metadata").get();
      if (!metadataSnapshot.exists()) {
        await database.ref(basePath + "/maintenance/expiryBuckets/" + candidate.expiryDateKey + "/drafts/" + candidate.id).remove();
        return { action: "stale_index_removed" };
      }
      const metadata = metadataSnapshot.val();
      if (metadata.status !== "draft" || metadata.protectedFromCleanup === true || !metadata.expiresAt || metadata.expiresAt > candidate.now) return defer("drafts", candidate.id, candidate.expiryDateKey, candidate.now);
      for (const entityType of ENTITY_ARRAYS) {
        const update = {}; update["authoring/drafts/" + candidate.id + "/entities/" + entityType] = null;
        await database.ref(basePath).update(update);
      }
      const auditId = "AUD-" + digest(candidate.id + ":cleanup:" + candidate.now).slice(0, 24).toUpperCase();
      const updates = {};
      updates["authoring/drafts/" + candidate.id] = null;
      updates["maintenance/expiryBuckets/" + candidate.expiryDateKey + "/drafts/" + candidate.id] = null;
      updates["audit/events/" + auditId] = { eventId: auditId, eventType: "retention.draft.deleted", entityId: candidate.id, actorUid: "system:retention", occurredAt: candidate.now };
      await database.ref(basePath).update(updates);
      return { action: "deleted" };
    }
  });
}

module.exports = { createRtdbRetentionStore };