"use strict";

const crypto = require("node:crypto");
const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { DEFAULT_BASE_PATH } = require("../phase2/rtdb-emulator-draft-store.js");

function digest(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function safe(value, name) { if (typeof value !== "string" || !value || /[.#$[\]/]/.test(value)) throw new Error("unsafe_job_segment:" + name); return value; }

function createRtdbImportJobStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({ projectId: input.projectId, databaseEmulatorHost: input.databaseEmulatorHost });
  if (!input.database || typeof input.database.ref !== "function") throw new Error("greenfield_injected_database_required");
  const database = input.database;
  const basePath = input.basePath || DEFAULT_BASE_PATH;
  if (basePath !== DEFAULT_BASE_PATH) throw new Error("greenfield_erp_base_path_locked");

  return Object.freeze({
    async createQueuedJob(job) {
      const jobId = safe(job.jobId, "jobId");
      const metadataRef = database.ref(basePath + "/importJobs/" + jobId + "/metadata");
      const requestHash = digest(job.requestId + ":" + job.actorUid);
      let created = false;
      const transaction = await metadataRef.transaction(function (current) {
        if (current) return current;
        created = true;
        return {
          jobId, requestId: job.requestId, requestHash, actorUid: job.actorUid, status: "queued", attempts: 0,
          operatorScope: job.operatorScope, source: job.source, retentionClass: "import_job",
          createdAt: job.createdAt, lastTouchedAt: job.lastTouchedAt, expiresAt: job.expiresAt
        };
      }, undefined, false);
      const reused = !created;
      const auditId = "AUD-" + digest(jobId + ":queued").slice(0, 24).toUpperCase();
      const updates = {};
      updates["importJobsByRequest/" + requestHash] = jobId;
      updates["maintenance/expiryBuckets/" + job.expiryDateKey + "/importJobs/" + jobId] = true;
      updates["taskOutbox/importValidation/" + jobId] = { jobId, status: "ready", createdAt: job.createdAt };
      updates["audit/events/" + auditId] = { eventId: auditId, eventType: "import.job.queued", entityId: jobId, actorUid: job.actorUid, occurredAt: job.createdAt };
      await database.ref(basePath).update(updates);
      return { ok: true, reused, jobId, status: "queued", expiresAt: job.expiresAt };
    },
    async getJob(jobId) {
      safe(jobId, "jobId");
      const snapshot = await database.ref(basePath + "/importJobs/" + jobId + "/metadata").get();
      return snapshot.exists() ? snapshot.val() : null;
    },
    async claimJob(inputClaim) {
      safe(inputClaim.jobId, "jobId"); safe(inputClaim.workerId, "workerId");
      const ref = database.ref(basePath + "/importJobs/" + inputClaim.jobId + "/metadata");
      const transaction = await ref.transaction(function (current) {
        if (!current || current.status === "completed" || current.status === "failed") return;
        if (current.status === "processing" && current.leaseExpiresAt && current.leaseExpiresAt > inputClaim.startedAt) return;
        return { ...current, status: "processing", workerId: inputClaim.workerId, leaseExpiresAt: inputClaim.leaseExpiresAt, lastTouchedAt: inputClaim.startedAt, attempts: (current.attempts || 0) + 1 };
      }, undefined, false);
      const job = transaction && transaction.snapshot && transaction.snapshot.val();
      return { claimed: Boolean(transaction && transaction.committed), status: job && job.status || "missing", job };
    },
    async finishJob(result) {
      safe(result.jobId, "jobId");
      const updates = {};
      updates["importJobs/" + result.jobId + "/metadata/status"] = result.status;
      updates["importJobs/" + result.jobId + "/metadata/finishedAt"] = result.finishedAt;
      updates["importJobs/" + result.jobId + "/metadata/lastTouchedAt"] = result.finishedAt;
      updates["importJobs/" + result.jobId + "/metadata/resultCode"] = result.resultCode;
      updates["importJobs/" + result.jobId + "/metadata/leaseExpiresAt"] = null;
      updates["importJobs/" + result.jobId + "/metadata/workerId"] = null;
      if (result.draftId) updates["importJobs/" + result.jobId + "/metadata/draftId"] = result.draftId;
      if (result.validationErrors) updates["importJobs/" + result.jobId + "/validation/errors"] = result.validationErrors;
      updates["taskOutbox/importValidation/" + result.jobId + "/status"] = result.status;
      await database.ref(basePath).update(updates);
    },
    async markRetryableFailure(result) {
      safe(result.jobId, "jobId");
      const updates = {};
      updates["importJobs/" + result.jobId + "/metadata/status"] = "retryable";
      updates["importJobs/" + result.jobId + "/metadata/lastTouchedAt"] = result.failedAt;
      updates["importJobs/" + result.jobId + "/metadata/lastErrorCode"] = result.errorCode;
      updates["importJobs/" + result.jobId + "/metadata/leaseExpiresAt"] = null;
      updates["importJobs/" + result.jobId + "/metadata/workerId"] = null;
      updates["taskOutbox/importValidation/" + result.jobId + "/status"] = "retryable";
      await database.ref(basePath).update(updates);
    }
  });
}

module.exports = { createRtdbImportJobStore };