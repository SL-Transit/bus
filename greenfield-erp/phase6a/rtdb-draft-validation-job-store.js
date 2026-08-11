"use strict";

const crypto = require("node:crypto");
const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { DEFAULT_BASE_PATH, ID_FIELDS } = require("../phase2/rtdb-emulator-draft-store.js");

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}
function safeSegment(value, label) {
  if (typeof value !== "string" || !value || /[.#$[\]/]/.test(value)) {
    throw new Error("unsafe_validation_job_segment:" + label);
  }
  return value;
}
function storeError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = status || 409;
  return error;
}
function entityArrays(entities) {
  const source = entities && typeof entities === "object" ? entities : {};
  const output = {};
  Object.keys(ID_FIELDS).forEach(function (entityType) {
    const values = source[entityType] && typeof source[entityType] === "object" ? source[entityType] : {};
    output[entityType] = Object.keys(values).sort().map(function (id) { return values[id]; });
  });
  return output;
}

function createRtdbDraftValidationJobStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({ projectId: input.projectId, databaseEmulatorHost: input.databaseEmulatorHost });
  if (!input.database || typeof input.database.ref !== "function") throw new Error("greenfield_injected_database_required");
  const database = input.database;
  const basePath = input.basePath || DEFAULT_BASE_PATH;
  if (basePath !== DEFAULT_BASE_PATH) throw new Error("greenfield_erp_base_path_locked");

  async function getDraftSummary(draftId) {
    safeSegment(draftId, "draftId");
    const snapshot = await database.ref(basePath + "/authoring/drafts/" + draftId + "/metadata").get();
    return snapshot.exists() ? snapshot.val() : null;
  }

  async function createQueuedJob(job) {
    const jobId = safeSegment(job.jobId, "jobId");
    const metadataRef = database.ref(basePath + "/draftValidationJobs/" + jobId + "/metadata");
    const creationToken = crypto.randomBytes(16).toString("hex");
    const transaction = await metadataRef.transaction(function (current) {
      if (current) return current;
      return {
        jobId,
        requestId: job.requestId,
        actorUid: job.actorUid,
        draftId: job.draftId,
        expectedRevision: job.expectedRevision,
        operatorScope: job.operatorScope,
        status: "queued",
        attempts: 0,
        retentionClass: "draft_validation_job",
        creationToken,
        createdAt: job.createdAt,
        lastTouchedAt: job.lastTouchedAt,
        expiresAt: job.expiresAt
      };
    }, undefined, false);
    const metadata = transaction && transaction.snapshot && transaction.snapshot.val();
    if (!metadata) throw storeError("validation_job_create_failed", 500);
    const reused = metadata.creationToken !== creationToken;
    if (reused) {
      if (metadata.actorUid !== job.actorUid || metadata.draftId !== job.draftId || metadata.expectedRevision !== job.expectedRevision) {
        throw storeError("idempotency_key_reused", 409);
      }
      return { ok: true, reused: true, jobId, status: metadata.status, expiresAt: metadata.expiresAt };
    }

    const draftRef = database.ref(basePath + "/authoring/drafts/" + job.draftId + "/metadata");
    const draftTransaction = await draftRef.transaction(function (current) {
      if (!current || current.revision !== job.expectedRevision || current.status !== "draft") return current;
      return {
        ...current,
        validationStatus: "queued",
        validatedRevision: null,
        validationErrorCount: null,
        validationWarningCount: null,
        validationJobId: jobId,
        validationRequestedAt: job.createdAt,
        validationRequestedByUid: job.actorUid,
        lastTouchedAt: job.createdAt
      };
    }, undefined, false);
    const draft = draftTransaction && draftTransaction.snapshot && draftTransaction.snapshot.val();
    if (!draft) {
      await finishFailedJob({ jobId, failedAt: job.createdAt, resultCode: "draft_not_found" });
      throw storeError("draft_not_found", 404);
    }
    if (draft.revision !== job.expectedRevision) {
      await finishFailedJob({ jobId, failedAt: job.createdAt, resultCode: "revision_conflict" });
      throw storeError("revision_conflict", 409);
    }
    if (draft.status !== "draft" || draft.validationJobId !== jobId) {
      await finishFailedJob({ jobId, failedAt: job.createdAt, resultCode: "workflow_state_invalid" });
      throw storeError("workflow_state_invalid", 409);
    }

    const auditId = "AUD-" + digest(jobId + ":queued").slice(0, 24).toUpperCase();
    const updates = {};
    updates["maintenance/expiryBuckets/" + job.expiryDateKey + "/validationJobs/" + jobId] = true;
    updates["taskOutbox/draftValidation/" + jobId] = { jobId, status: "ready", createdAt: job.createdAt };
    updates["audit/events/" + auditId] = {
      eventId: auditId,
      eventType: "draft.validation.queued",
      entityId: job.draftId,
      actorUid: job.actorUid,
      operatorScope: job.operatorScope,
      requestId: job.requestId,
      baseRevision: job.expectedRevision,
      occurredAt: job.createdAt
    };
    await database.ref(basePath).update(updates);
    return { ok: true, reused: false, jobId, status: "queued", expiresAt: job.expiresAt };
  }

  async function getJob(jobId) {
    safeSegment(jobId, "jobId");
    const snapshot = await database.ref(basePath + "/draftValidationJobs/" + jobId).get();
    if (!snapshot.exists()) return null;
    const value = snapshot.val() || {};
    return { ...(value.metadata || {}), validation: value.validation || null };
  }

  async function claimJob(claim) {
    safeSegment(claim.jobId, "jobId");
    safeSegment(claim.workerId, "workerId");
    const ref = database.ref(basePath + "/draftValidationJobs/" + claim.jobId + "/metadata");
    const claimToken = crypto.randomBytes(16).toString("hex");
    const transaction = await ref.transaction(function (current) {
      if (!current) return current;
      if (current.status === "completed" || current.status === "failed") return current;
      if (current.status === "processing" && current.leaseExpiresAt && current.leaseExpiresAt > claim.startedAt) return current;
      return {
        ...current,
        status: "processing",
        workerId: claim.workerId,
        claimToken,
        leaseExpiresAt: claim.leaseExpiresAt,
        lastTouchedAt: claim.startedAt,
        attempts: (current.attempts || 0) + 1
      };
    }, undefined, false);
    const job = transaction && transaction.snapshot && transaction.snapshot.val();
    return {
      claimed: Boolean(job && job.status === "processing" && job.claimToken === claimToken),
      status: job && job.status || "missing",
      job
    };
  }

  async function readDraftPackage(job) {
    const draftId = safeSegment(job.draftId, "draftId");
    const draftSnapshot = await database.ref(basePath + "/authoring/drafts/" + draftId).get();
    if (!draftSnapshot.exists()) throw storeError("draft_not_found", 404);
    const draft = draftSnapshot.val() || {};
    const metadata = draft.metadata || {};
    if (metadata.revision !== job.expectedRevision) throw storeError("stale_draft_revision", 409);
    if (metadata.status !== "draft") throw storeError("workflow_state_invalid", 409);
    const packageSnapshot = await database.ref(basePath + "/importPackages/" + metadata.packageId + "/metadata").get();
    const source = packageSnapshot.exists() ? packageSnapshot.val() : {};
    const arrays = entityArrays(draft.entities);
    const pkg = {
      metadata: {
        packageId: metadata.packageId,
        schemaVersion: metadata.schemaVersion,
        templateVersion: source.templateVersion,
        sourceChecksumSha256: source.sourceChecksumSha256,
        mode: "validate_only",
        operatorScope: metadata.operatorScope,
        idempotencyKey: source.idempotencyKey || job.requestId
      },
      ...arrays
    };
    return {
      package: pkg,
      packageBytes: Buffer.byteLength(JSON.stringify(pkg), "utf8"),
      entityCount: Object.keys(ID_FIELDS).reduce(function (sum, entityType) {
        return sum + arrays[entityType].length;
      }, 0)
    };
  }

  async function finishJob(result) {
    safeSegment(result.jobId, "jobId");
    const draftRef = database.ref(basePath + "/authoring/drafts/" + result.draftId + "/metadata");
    const transaction = await draftRef.transaction(function (current) {
      if (!current || current.revision !== result.expectedRevision || current.status !== "draft") return current;
      if (current.validationJobId !== result.jobId && current.lastValidationJobId !== result.jobId) return current;
      return {
        ...current,
        validationStatus: result.validationStatus,
        validatedRevision: result.expectedRevision,
        validationErrorCount: result.validation.errorCount,
        validationWarningCount: result.validation.warningCount,
        lastValidationJobId: result.jobId,
        lastValidatedAt: result.finishedAt,
        lastTouchedAt: result.finishedAt
      };
    }, undefined, false);
    const metadata = transaction && transaction.snapshot && transaction.snapshot.val();
    const applied = Boolean(
      metadata &&
      metadata.revision === result.expectedRevision &&
      metadata.lastValidationJobId === result.jobId &&
      metadata.validatedRevision === result.expectedRevision
    );
    if (!applied) {
      await finishFailedJob({ jobId: result.jobId, failedAt: result.finishedAt, resultCode: "stale_draft_revision" });
      return { status: "failed", resultCode: "stale_draft_revision", reused: false };
    }

    const auditId = "AUD-" + digest(result.jobId + ":finished").slice(0, 24).toUpperCase();
    const updates = {};
    updates["draftValidationJobs/" + result.jobId + "/metadata/status"] = "completed";
    updates["draftValidationJobs/" + result.jobId + "/metadata/finishedAt"] = result.finishedAt;
    updates["draftValidationJobs/" + result.jobId + "/metadata/lastTouchedAt"] = result.finishedAt;
    updates["draftValidationJobs/" + result.jobId + "/metadata/resultCode"] = result.resultCode;
    updates["draftValidationJobs/" + result.jobId + "/metadata/leaseExpiresAt"] = null;
    updates["draftValidationJobs/" + result.jobId + "/metadata/workerId"] = null;
    updates["draftValidationJobs/" + result.jobId + "/metadata/claimToken"] = null;
    updates["draftValidationJobs/" + result.jobId + "/validation"] = result.validation;
    updates["taskOutbox/draftValidation/" + result.jobId + "/status"] = "completed";
    updates["audit/events/" + auditId] = {
      eventId: auditId,
      eventType: result.validationStatus === "valid" ? "draft.validation.valid" : "draft.validation.invalid",
      entityId: result.draftId,
      actorUid: "system:validation-worker",
      operatorScope: result.operatorScope,
      baseRevision: result.expectedRevision,
      resultRevision: result.expectedRevision,
      validationErrorCount: result.validation.errorCount,
      occurredAt: result.finishedAt
    };
    await database.ref(basePath).update(updates);
    return { status: "completed", resultCode: result.resultCode, reused: false };
  }

  async function finishFailedJob(result) {
    safeSegment(result.jobId, "jobId");
    const updates = {};
    updates["draftValidationJobs/" + result.jobId + "/metadata/status"] = "failed";
    updates["draftValidationJobs/" + result.jobId + "/metadata/finishedAt"] = result.failedAt;
    updates["draftValidationJobs/" + result.jobId + "/metadata/lastTouchedAt"] = result.failedAt;
    updates["draftValidationJobs/" + result.jobId + "/metadata/resultCode"] = result.resultCode;
    updates["draftValidationJobs/" + result.jobId + "/metadata/leaseExpiresAt"] = null;
    updates["draftValidationJobs/" + result.jobId + "/metadata/workerId"] = null;
    updates["draftValidationJobs/" + result.jobId + "/metadata/claimToken"] = null;
    updates["taskOutbox/draftValidation/" + result.jobId + "/status"] = "failed";
    await database.ref(basePath).update(updates);
  }

  async function markRetryableFailure(result) {
    safeSegment(result.jobId, "jobId");
    const updates = {};
    updates["draftValidationJobs/" + result.jobId + "/metadata/status"] = "retryable";
    updates["draftValidationJobs/" + result.jobId + "/metadata/lastTouchedAt"] = result.failedAt;
    updates["draftValidationJobs/" + result.jobId + "/metadata/lastErrorCode"] = result.errorCode;
    updates["draftValidationJobs/" + result.jobId + "/metadata/leaseExpiresAt"] = null;
    updates["draftValidationJobs/" + result.jobId + "/metadata/workerId"] = null;
    updates["draftValidationJobs/" + result.jobId + "/metadata/claimToken"] = null;
    updates["taskOutbox/draftValidation/" + result.jobId + "/status"] = "retryable";
    await database.ref(basePath).update(updates);
  }

  return Object.freeze({
    claimJob,
    createQueuedJob,
    finishFailedJob,
    finishJob,
    getDraftSummary,
    getJob,
    markRetryableFailure,
    readDraftPackage
  });
}

module.exports = {
  createRtdbDraftValidationJobStore,
  entityArrays,
  safeSegment,
  storeError
};