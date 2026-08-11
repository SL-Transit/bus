"use strict";

const crypto = require("node:crypto");
const { MAX_IMPORT_PACKAGE_BYTES, MAX_ENTITY_RECORDS } = require("../phase2/draft-service.js");
const { validateNetworkPackage } = require("../../contracts/greenfield-erp/v1/runtime/validate-network-package.js");
const { hasOperatorScope } = require("../phase4/authorization-service.js");
const { addHours, dateKey } = require("../phase4/retention-policy.js");
const { assertDraftCommand } = require("./draft-workflow-service.js");

const VALIDATION_JOB_ID_PATTERN = /^DVJ-[A-F0-9]{24}$/;
const MAX_VALIDATION_ERRORS = 100;
const MAX_VALIDATION_WARNINGS = 100;

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}
function validationJobError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = status || 400;
  return error;
}
function validationJobIdFor(actorUid, idempotencyKey) {
  return "DVJ-" + digest(actorUid + ":" + idempotencyKey).slice(0, 24).toUpperCase();
}
function boundedIssues(items, limit) {
  return (Array.isArray(items) ? items : []).slice(0, limit).map(function (item) {
    return {
      code: String(item && item.code || "validation_error").slice(0, 120),
      path: String(item && item.path || "$").slice(0, 300),
      message: String(item && item.message || "").slice(0, 500)
    };
  });
}
function publicValidationJob(job) {
  const validation = job && job.validation;
  return Object.freeze({
    jobId: job.jobId,
    draftId: job.draftId,
    expectedRevision: job.expectedRevision,
    status: job.status,
    attempts: job.attempts || 0,
    resultCode: job.resultCode || null,
    validation: validation ? {
      errors: boundedIssues(validation.errors, MAX_VALIDATION_ERRORS),
      warnings: boundedIssues(validation.warnings, MAX_VALIDATION_WARNINGS),
      errorCount: Number(validation.errorCount || 0),
      warningCount: Number(validation.warningCount || 0),
      truncated: validation.truncated === true
    } : null,
    createdAt: job.createdAt,
    lastTouchedAt: job.lastTouchedAt,
    expiresAt: job.expiresAt
  });
}

function createDraftValidationJobService(options) {
  const input = options || {};
  if (!input.store) throw new Error("greenfield_draft_validation_store_required");
  if (!input.retentionPolicy) throw new Error("retention_policy_required");
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };
  const workerLeaseSeconds = input.workerLeaseSeconds || 300;

  async function start(command) {
    const payload = assertDraftCommand(command.payload);
    const summary = await input.store.getDraftSummary(payload.draftId);
    if (!summary) throw validationJobError("draft_not_found", 404);
    if (summary.revision !== payload.expectedRevision) throw validationJobError("revision_conflict", 409);
    if (summary.status !== "draft") throw validationJobError("workflow_state_invalid", 409);
    if (!hasOperatorScope(command.account, summary.operatorScope)) {
      throw validationJobError("operator_scope_denied", 403);
    }
    const createdAt = now();
    const expiresAt = addHours(createdAt, input.retentionPolicy.importJobRetentionHours);
    return input.store.createQueuedJob({
      jobId: validationJobIdFor(command.actorUid, command.idempotencyKey),
      requestId: command.requestId,
      actorUid: command.actorUid,
      draftId: payload.draftId,
      expectedRevision: payload.expectedRevision,
      operatorScope: summary.operatorScope,
      createdAt,
      lastTouchedAt: createdAt,
      expiresAt,
      expiryDateKey: dateKey(expiresAt)
    });
  }

  async function status(jobId, account) {
    if (!VALIDATION_JOB_ID_PATTERN.test(jobId || "")) throw validationJobError("invalid_validation_job_id");
    const job = await input.store.getJob(jobId);
    if (!job) throw validationJobError("validation_job_not_found", 404);
    if (!hasOperatorScope(account, job.operatorScope)) throw validationJobError("operator_scope_denied", 403);
    return publicValidationJob(job);
  }

  async function process(jobId, workerId) {
    if (!VALIDATION_JOB_ID_PATTERN.test(jobId || "")) throw validationJobError("invalid_validation_job_id");
    const startedAt = now();
    const leaseExpiresAt = new Date(Date.parse(startedAt) + workerLeaseSeconds * 1000).toISOString();
    const claim = await input.store.claimJob({ jobId, workerId, startedAt, leaseExpiresAt });
    if (!claim.claimed) return { jobId, status: claim.status, reused: true };
    try {
      const snapshot = await input.store.readDraftPackage(claim.job);
      if (snapshot.packageBytes > MAX_IMPORT_PACKAGE_BYTES) throw validationJobError("draft_package_too_large", 413);
      if (snapshot.entityCount > MAX_ENTITY_RECORDS) throw validationJobError("draft_entity_limit_exceeded", 413);
      const allErrors = validateNetworkPackage(snapshot.package);
      const errors = boundedIssues(allErrors, MAX_VALIDATION_ERRORS);
      const warnings = [];
      const validation = {
        errors,
        warnings,
        errorCount: allErrors.length,
        warningCount: 0,
        truncated: allErrors.length > errors.length
      };
      const finishedAt = now();
      const result = await input.store.finishJob({
        jobId,
        draftId: claim.job.draftId,
        expectedRevision: claim.job.expectedRevision,
        actorUid: claim.job.actorUid,
        operatorScope: claim.job.operatorScope,
        finishedAt,
        validation,
        validationStatus: allErrors.length === 0 ? "valid" : "invalid",
        resultCode: allErrors.length === 0 ? "draft_valid" : "draft_invalid"
      });
      return { jobId, status: result.status, resultCode: result.resultCode, reused: result.reused === true };
    } catch (error) {
      const code = error && error.code || "validation_worker_failed";
      if ([
        "stale_draft_revision",
        "draft_not_found",
        "workflow_state_invalid",
        "draft_package_too_large",
        "draft_entity_limit_exceeded"
      ].includes(code)) {
        await input.store.finishFailedJob({
          jobId,
          draftId: claim.job.draftId,
          expectedRevision: claim.job.expectedRevision,
          failedAt: now(),
          resultCode: code
        });
        return { jobId, status: "failed", resultCode: code };
      }
      await input.store.markRetryableFailure({ jobId, failedAt: now(), errorCode: code });
      throw error;
    }
  }

  return Object.freeze({ process, start, status });
}

module.exports = {
  MAX_VALIDATION_ERRORS,
  MAX_VALIDATION_WARNINGS,
  VALIDATION_JOB_ID_PATTERN,
  boundedIssues,
  createDraftValidationJobService,
  publicValidationJob,
  validationJobError,
  validationJobIdFor
};