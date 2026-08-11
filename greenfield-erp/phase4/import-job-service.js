"use strict";

const crypto = require("node:crypto");
const { MAX_IMPORT_PACKAGE_BYTES } = require("../phase2/draft-service.js");
const { addDays, addHours, dateKey } = require("./retention-policy.js");

const SOURCE_CONTENT_TYPE = "application/json";
const SOURCE_PREFIX = "erp-import-quarantine/";
const JOB_ID_PATTERN = /^JOB-[A-F0-9]{24}$/;

function digest(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function jobError(code, status) { const error = new Error(code); error.code = code; error.httpStatus = status || 400; return error; }
function jobIdFor(requestId, actorUid) { return "JOB-" + digest(requestId + ":" + actorUid).slice(0, 24).toUpperCase(); }

function validateSource(source, actorUid) {
  if (!source || typeof source !== "object") throw jobError("staged_source_required");
  if (source.contentType !== SOURCE_CONTENT_TYPE) throw jobError("source_content_type_not_supported", 415);
  if (!Number.isInteger(source.sizeBytes) || source.sizeBytes < 1 || source.sizeBytes > MAX_IMPORT_PACKAGE_BYTES) throw jobError("source_size_invalid", 413);
  if (!/^sha256:[a-f0-9]{64}$/.test(source.checksumSha256 || "")) throw jobError("source_checksum_invalid");
  const expectedPrefix = SOURCE_PREFIX + actorUid + "/";
  if (typeof source.objectPath !== "string" || !source.objectPath.startsWith(expectedPrefix) || source.objectPath.includes("..")) throw jobError("source_path_denied", 403);
  if (typeof source.bucket !== "string" || source.bucket.length === 0 || source.bucket.includes("/")) throw jobError("source_bucket_invalid");
  return Object.freeze({ bucket: source.bucket, objectPath: source.objectPath, contentType: source.contentType, sizeBytes: source.sizeBytes, checksumSha256: source.checksumSha256 });
}

function createImportJobService(options) {
  const input = options || {};
  if (!input.jobStore) throw new Error("greenfield_job_store_required");
  if (!input.packageReader) throw new Error("greenfield_package_reader_required");
  if (!input.draftStore) throw new Error("greenfield_draft_store_required");
  if (typeof input.createValidatedDraft !== "function") throw new Error("greenfield_draft_service_required");
  if (!input.retentionPolicy) throw new Error("retention_policy_required");
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };
  const workerLeaseSeconds = input.workerLeaseSeconds || 300;

  async function start(command) {
    const createdAt = now();
    const source = validateSource(command.payload && command.payload.source, command.actorUid);
    const operatorScope = command.payload && Array.isArray(command.payload.operatorScope) ? Array.from(new Set(command.payload.operatorScope)) : [];
    if (operatorScope.length === 0 || operatorScope.some(function (id) { return typeof id !== "string" || !id; })) throw jobError("operator_scope_required");
    const jobId = jobIdFor(command.requestId, command.actorUid);
    return input.jobStore.createQueuedJob({
      jobId, requestId: command.requestId, actorUid: command.actorUid, source, operatorScope,
      createdAt, lastTouchedAt: createdAt,
      expiresAt: addHours(createdAt, input.retentionPolicy.importJobRetentionHours),
      expiryDateKey: dateKey(addHours(createdAt, input.retentionPolicy.importJobRetentionHours))
    });
  }

  async function status(jobId) {
    if (!JOB_ID_PATTERN.test(jobId || "")) throw jobError("invalid_job_id");
    const job = await input.jobStore.getJob(jobId);
    if (!job) throw jobError("job_not_found", 404);
    return job;
  }

  async function process(jobId, workerId) {
    if (!JOB_ID_PATTERN.test(jobId || "")) throw jobError("invalid_job_id");
    const startedAt = now();
    const leaseExpiresAt = new Date(Date.parse(startedAt) + workerLeaseSeconds * 1000).toISOString();
    const claim = await input.jobStore.claimJob({ jobId, workerId, startedAt, leaseExpiresAt });
    if (!claim.claimed) return { jobId, status: claim.status, reused: true };
    try {
      const pkg = await input.packageReader.readPackage(claim.job.source);
      const result = await input.createValidatedDraft({
        package: pkg,
        actorUid: claim.job.actorUid,
        store: input.draftStore,
        now,
        draftExpiresAt: addDays(now(), input.retentionPolicy.abandonedDraftRetentionDays)
      });
      const finishedAt = now();
      if (!result.ok) {
        await input.jobStore.finishJob({ jobId, status: "failed", finishedAt, resultCode: result.code, validationErrors: result.errors || [] });
        return { jobId, status: "failed", result };
      }
      await input.jobStore.finishJob({ jobId, status: "completed", finishedAt, draftId: result.draftId, resultCode: "draft_ready" });
      return { jobId, status: "completed", result };
    } catch (error) {
      await input.jobStore.markRetryableFailure({ jobId, failedAt: now(), errorCode: error && error.code || "worker_failed" });
      throw error;
    }
  }

  return Object.freeze({ process, start, status });
}

module.exports = { JOB_ID_PATTERN, SOURCE_CONTENT_TYPE, SOURCE_PREFIX, createImportJobService, jobIdFor, validateSource };