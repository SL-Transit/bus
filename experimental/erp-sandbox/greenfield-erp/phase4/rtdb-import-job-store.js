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
      const creationToken = crypto.randomBytes(16).toString("hex");
      const transaction = await metadataRef.transaction(function (current) {
        if (current) return current;
        return {
          jobId, requestId: job.requestId, requestHash, actorUid: job.actorUid, status: "queued", attempts: 0,
          operatorScope: job.operatorScope, source: job.source, retentionClass: "import_job", creationToken,
          createdAt: job.createdAt, lastTouchedAt: job.lastTouchedAt, expiresAt: job.expiresAt
        };
      }, undefined, false);
      const metadata = transaction && transaction.snapshot && transaction.snapshot.val();
      const reused = !metadata || metadata.creationToken !== creationToken;
      if (reused) return { ok: true, reused: true, jobId, status: metadata && metadata.status || "queued", expiresAt: metadata && metadata.expiresAt || null };
      const auditId = "AUD-" + digest(jobId + ":queued").slice(0, 24).toUpperCase();
      const updates = {};
      updates["importJobsByRequest/" + requestHash] = jobId;
      updates["maintenance/expiryBuckets/" + job.expiryDateKey + "/importJobs/" + jobId] = true;
      updates["taskOutbox/importValidation/" + jobId] = { jobId, status: "ready", createdAt: job.createdAt };
      updates["audit/events/" + auditId] = { eventId: auditId, eventType: "import.job.queued", entityId: jobId, actorUid: job.actorUid, occurredAt: job.createdAt };
      await database.ref(basePath).update(updates);
      return { ok: true, reused: false, jobId, status: "queued", expiresAt: metadata.expiresAt };
    },
    async getJob(jobId) {
      safe(jobId, "jobId");
      const snapshot = await database.ref(basePath + "/importJobs/" + jobId).get();
      if (!snapshot.exists()) return null;
      const record = snapshot.val() || {};
      return { ...(record.metadata || {}), validation: record.validation || null };
    },
    async claimJob(inputClaim) {
      safe(inputClaim.jobId, "jobId"); safe(inputClaim.workerId, "workerId");
      const ref = database.ref(basePath + "/importJobs/" + inputClaim.jobId + "/metadata");
      const claimToken = crypto.randomBytes(16).toString("hex");
      const transaction = await ref.transaction(function (current) {
        if (!current) return { jobId: inputClaim.jobId, status: "claim_pending", claimToken, createdAt: inputClaim.startedAt };
        if (current.status === "completed" || current.status === "failed") return current;
        if (current.status === "processing" && current.leaseExpiresAt && current.leaseExpiresAt > inputClaim.startedAt) return current;
        return { ...current, status: "processing", workerId: inputClaim.workerId, claimToken, leaseExpiresAt: inputClaim.leaseExpiresAt, lastTouchedAt: inputClaim.startedAt, attempts: (current.attempts || 0) + 1 };
      }, undefined, false);
      const job = transaction && transaction.snapshot && transaction.snapshot.val();
      if (job && job.status === "claim_pending" && job.claimToken === claimToken) {
        await ref.transaction(function (current) { return current && current.status === "claim_pending" && current.claimToken === claimToken ? null : current; }, undefined, false);
        return { claimed: false, status: "missing", job: null };
      }
      const claimed = Boolean(job && job.status === "processing" && job.claimToken === claimToken);
      return { claimed, status: job && job.status || "missing", job };
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
      updates["importJobs/" + result.jobId + "/metadata/claimToken"] = null;
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
      updates["importJobs/" + result.jobId + "/metadata/claimToken"] = null;
      updates["taskOutbox/importValidation/" + result.jobId + "/status"] = "retryable";
      await database.ref(basePath).update(updates);
    }
  });
}

module.exports = { createRtdbImportJobStore };