"use strict";

const crypto = require("node:crypto");
const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { DEFAULT_BASE_PATH } = require("../phase2/rtdb-emulator-draft-store.js");

const DEFAULT_LOCK_SECONDS = 60;

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function storeError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = status || 409;
  return error;
}

function safeSegment(value, label) {
  if (typeof value !== "string" || !value || [".", "#", "$", "[", "]", "/"].some(function (character) { return value.includes(character); })) {
    throw new Error("unsafe_workflow_segment:" + label);
  }
  return value;
}

function withoutLock(metadata) {
  const output = { ...metadata };
  delete output.workflowLock;
  return output;
}

function createRtdbDraftWorkflowStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({
    projectId: input.projectId,
    databaseEmulatorHost: input.databaseEmulatorHost
  });
  if (!input.database || typeof input.database.ref !== "function") {
    throw new Error("greenfield_injected_database_required");
  }
  const database = input.database;
  const basePath = input.basePath || DEFAULT_BASE_PATH;
  if (basePath !== DEFAULT_BASE_PATH) throw new Error("greenfield_erp_base_path_locked");
  const lockSeconds = input.lockSeconds || DEFAULT_LOCK_SECONDS;

  function receiptId(actorUid, idempotencyKey) {
    return digest(actorUid + ":" + idempotencyKey);
  }

  async function existingReceipt(command) {
    const id = receiptId(command.actorUid, command.idempotencyKey);
    const snapshot = await database.ref(basePath + "/commandReceipts/" + id).get();
    if (!snapshot.exists()) return null;
    const receipt = snapshot.val();
    if (receipt.command !== command.command || receipt.entityId !== command.draftId) {
      throw storeError("idempotency_key_reused", 409);
    }
    return receipt.result;
  }

  async function acquire(command, allowedStatuses, precondition) {
    safeSegment(command.draftId, "draftId");
    safeSegment(command.actorUid, "actorUid");
    const prior = await existingReceipt(command);
    if (prior) return { reused: true, result: prior };
    const commandKey = receiptId(command.actorUid, command.idempotencyKey);
    const metadataRef = database.ref(basePath + "/authoring/drafts/" + command.draftId + "/metadata");
    const lockExpiresAt = new Date(Date.parse(command.occurredAt) + lockSeconds * 1000).toISOString();
    const transaction = await metadataRef.transaction(function (current) {
      if (!current) return current;
      if (current.workflowLock && current.workflowLock.commandKey === commandKey) return current;
      if (current.workflowLock && current.workflowLock.expiresAt > command.occurredAt) return current;
      if (current.revision !== command.expectedRevision || !allowedStatuses.includes(current.status)) return current;
      if (typeof precondition === "function" && !precondition(current)) return current;
      return {
        ...current,
        workflowLock: {
          command: command.command,
          commandKey,
          actorUid: command.actorUid,
          baseRevision: current.revision,
          targetRevision: current.revision + 1,
          acquiredAt: command.occurredAt,
          expiresAt: lockExpiresAt
        }
      };
    }, undefined, false);
    const metadata = transaction && transaction.snapshot && transaction.snapshot.val();
    if (!metadata) throw storeError("draft_not_found", 404);
    if (!metadata.workflowLock || metadata.workflowLock.commandKey !== commandKey) {
      if (metadata.revision !== command.expectedRevision) throw storeError("revision_conflict", 409);
      if (!allowedStatuses.includes(metadata.status)) throw storeError("workflow_state_invalid", 409);
      if (metadata.workflowLock && metadata.workflowLock.expiresAt > command.occurredAt) throw storeError("draft_locked", 409);
      throw storeError("workflow_precondition_failed", 409);
    }
    return { reused: false, commandKey, metadata };
  }

  async function finalize(command, lockedMetadata, finalMetadata, entityUpdates, eventType, result) {
    const eventId = "AUD-" + digest(command.command + ":" + command.commandKey).slice(0, 24).toUpperCase();
    const receipt = receiptId(command.actorUid, command.idempotencyKey);
    const updates = { ...(entityUpdates || {}) };
    updates["authoring/drafts/" + command.draftId + "/metadata"] = finalMetadata;
    updates["audit/events/" + eventId] = {
      eventId,
      eventType,
      entityId: command.draftId,
      actorUid: command.actorUid,
      operatorScope: command.operatorScope,
      requestId: command.requestId,
      baseRevision: lockedMetadata.workflowLock.baseRevision,
      resultRevision: result.revision,
      occurredAt: command.occurredAt
    };
    updates["commandReceipts/" + receipt] = {
      command: command.command,
      entityId: command.draftId,
      actorUid: command.actorUid,
      idempotencyHash: receipt,
      result,
      createdAt: command.occurredAt
    };
    await database.ref(basePath).update(updates);
    return Object.freeze({ ...result, reused: false });
  }

  async function getDraftSummary(draftId) {
    safeSegment(draftId, "draftId");
    const metadataSnapshot = await database.ref(basePath + "/authoring/drafts/" + draftId + "/metadata").get();
    if (!metadataSnapshot.exists()) return null;
    const metadata = metadataSnapshot.val();
    if (!Array.isArray(metadata.operatorScope) || metadata.operatorScope.length === 0) {
      const operators = await database.ref(basePath + "/authoring/drafts/" + draftId + "/entities/operators").get();
      metadata.operatorScope = operators.exists() ? Object.keys(operators.val()) : [];
    }
    return metadata;
  }

  async function readDraftPage(command) {
    safeSegment(command.draftId, "draftId");
    safeSegment(command.entityType, "entityType");
    let query = database.ref(
      basePath + "/authoring/drafts/" + command.draftId + "/entities/" + command.entityType
    ).orderByKey();
    if (command.cursor) {
      safeSegment(command.cursor, "cursor");
      query = query.startAfter(command.cursor);
    }
    const snapshot = await query.limitToFirst(command.limit).get();
    const values = snapshot.exists() ? snapshot.val() : {};
    return {
      entries: Object.keys(values || {}).sort().map(function (entityId) {
        return { entityId, value: values[entityId] };
      })
    };
  }

  async function saveDraft(command) {
    const lock = await acquire({ ...command, command: "draft.save" }, ["draft", "rejected"]);
    if (lock.reused) return Object.freeze({ ...lock.result, reused: true });
    const targetRevision = lock.metadata.workflowLock.targetRevision;
    const finalMetadata = withoutLock(lock.metadata);
    finalMetadata.status = "draft";
    finalMetadata.revision = targetRevision;
    finalMetadata.operatorScope = command.operatorScope;
    finalMetadata.validationStatus = "required";
    finalMetadata.validatedRevision = null;
    finalMetadata.validationErrorCount = null;
    finalMetadata.validationWarningCount = null;
    finalMetadata.validationJobId = null;
    finalMetadata.validationRequestedAt = null;
    finalMetadata.validationRequestedByUid = null;
    finalMetadata.lastValidationJobId = null;
    finalMetadata.lastValidatedAt = null;
    finalMetadata.lastTouchedAt = command.occurredAt;
    finalMetadata.lastChangedAt = command.occurredAt;
    finalMetadata.lastChangedByUid = command.actorUid;
    finalMetadata.changeSummary = command.changeSummary;
    const entityUpdates = {};
    command.operations.forEach(function (operation) {
      entityUpdates["authoring/drafts/" + command.draftId + "/entities/" + operation.entityType + "/" + operation.entityId] = operation.value;
    });
    const result = {
      draftId: command.draftId,
      status: "draft",
      revision: targetRevision,
      validationStatus: "required"
    };
    return finalize(
      { ...command, command: "draft.save", commandKey: lock.commandKey },
      lock.metadata,
      finalMetadata,
      entityUpdates,
      "draft.saved",
      result
    );
  }

  async function requestReview(command) {
    const lock = await acquire(
      { ...command, command: "review.request" },
      ["draft"],
      function (metadata) {
        return metadata.validationStatus === "valid" &&
          metadata.validatedRevision === metadata.revision &&
          Number(metadata.validationErrorCount || 0) === 0;
      }
    );
    if (lock.reused) return Object.freeze({ ...lock.result, reused: true });
    const targetRevision = lock.metadata.workflowLock.targetRevision;
    const finalMetadata = withoutLock(lock.metadata);
    finalMetadata.status = "review_requested";
    finalMetadata.revision = targetRevision;
    finalMetadata.lastTouchedAt = command.occurredAt;
    finalMetadata.review = {
      requestedByUid: command.actorUid,
      requestedAt: command.occurredAt,
      contentRevision: lock.metadata.revision
    };
    const result = {
      draftId: command.draftId,
      status: "review_requested",
      revision: targetRevision,
      contentRevision: lock.metadata.revision
    };
    return finalize(
      { ...command, command: "review.request", commandKey: lock.commandKey },
      lock.metadata,
      finalMetadata,
      {},
      "review.requested",
      result
    );
  }

  async function decideApproval(command) {
    const lock = await acquire(
      { ...command, command: "approval.decide" },
      ["review_requested"],
      function (metadata) {
        return metadata.createdByUid !== command.actorUid &&
          metadata.lastChangedByUid !== command.actorUid;
      }
    );
    if (lock.reused) return Object.freeze({ ...lock.result, reused: true });
    const targetRevision = lock.metadata.workflowLock.targetRevision;
    const finalMetadata = withoutLock(lock.metadata);
    finalMetadata.status = command.decision === "approve" ? "approved" : "rejected";
    finalMetadata.revision = targetRevision;
    finalMetadata.lastTouchedAt = command.occurredAt;
    finalMetadata.approval = {
      decision: command.decision,
      decidedByUid: command.actorUid,
      decidedAt: command.occurredAt,
      comment: command.comment
    };
    const result = {
      draftId: command.draftId,
      status: finalMetadata.status,
      revision: targetRevision,
      decision: command.decision
    };
    return finalize(
      { ...command, command: "approval.decide", commandKey: lock.commandKey },
      lock.metadata,
      finalMetadata,
      {},
      command.decision === "approve" ? "approval.approved" : "approval.rejected",
      result
    );
  }

  return Object.freeze({ decideApproval, getDraftSummary, readDraftPage, requestReview, saveDraft });
}

module.exports = {
  DEFAULT_LOCK_SECONDS,
  createRtdbDraftWorkflowStore,
  digest,
  storeError,
  withoutLock
};