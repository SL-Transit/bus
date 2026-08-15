"use strict";

const { hasOperatorScope } = require("../phase4/authorization-service.js");
const { ID_FIELDS } = require("../phase2/rtdb-emulator-draft-store.js");

const DRAFT_ID_PATTERN = /^DRF-[A-F0-9]{24}$/;
const MAX_DRAFT_OPERATIONS = 100;
const MAX_DRAFT_CHANGE_BYTES = 512 * 1024;
const MAX_DRAFT_PAGE_ITEMS = 50;
const MAX_DRAFT_PAGE_BYTES = 256 * 1024;

function workflowError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = status || 400;
  return error;
}

function safeId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && ![".", "#", "$", "[", "]", "/"].some(function (character) { return value.includes(character); });
}

function assertDraftCommand(payload) {
  const input = payload || {};
  if (!DRAFT_ID_PATTERN.test(input.draftId || "")) throw workflowError("invalid_draft_id");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw workflowError("expected_revision_required");
  }
  return input;
}

function validateOperations(operations) {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > MAX_DRAFT_OPERATIONS) {
    throw workflowError("draft_operations_invalid");
  }
  const normalized = operations.map(function (operation) {
    if (!operation || typeof operation !== "object") throw workflowError("draft_operation_invalid");
    const idField = ID_FIELDS[operation.entityType];
    if (!idField || !safeId(operation.entityId)) throw workflowError("draft_entity_target_invalid");
    if (operation.value !== null) {
      if (!operation.value || typeof operation.value !== "object" || Array.isArray(operation.value)) {
        throw workflowError("draft_entity_value_invalid");
      }
      if (operation.value[idField] !== operation.entityId) {
        throw workflowError("draft_entity_id_mismatch");
      }
    }
    return Object.freeze({
      entityType: operation.entityType,
      entityId: operation.entityId,
      value: operation.value === null ? null : operation.value
    });
  });
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_DRAFT_CHANGE_BYTES) {
    throw workflowError("draft_changes_too_large", 413);
  }
  return Object.freeze(normalized);
}

function scopeFor(summary, operations) {
  const values = new Set(Array.isArray(summary.operatorScope) ? summary.operatorScope : []);
  (operations || []).forEach(function (operation) {
    if (operation.entityType === "operators") values.add(operation.entityId);
    if (operation.value && typeof operation.value.operatorId === "string") values.add(operation.value.operatorId);
  });
  return Array.from(values);
}

function assertAccountScope(account, operatorScope) {
  if (!hasOperatorScope(account, operatorScope)) throw workflowError("operator_scope_denied", 403);
}

function createDraftWorkflowService(options) {
  const input = options || {};
  if (!input.store || typeof input.store.getDraftSummary !== "function") {
    throw new Error("greenfield_draft_workflow_store_required");
  }
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };

  async function loadAuthorized(payload, account, operations) {
    const command = assertDraftCommand(payload);
    const summary = await input.store.getDraftSummary(command.draftId);
    if (!summary) throw workflowError("draft_not_found", 404);
    const operatorScope = scopeFor(summary, operations);
    if (operatorScope.length === 0) throw workflowError("draft_operator_scope_missing", 409);
    assertAccountScope(account, operatorScope);
    return { command, summary, operatorScope };
  }

  async function readDraft(command) {
    const context = await loadAuthorized(command.payload, command.account);
    if (context.summary.revision !== context.command.expectedRevision) {
      throw workflowError("revision_conflict", 409);
    }
    const entityType = command.payload && command.payload.entityType;
    if (!ID_FIELDS[entityType]) throw workflowError("draft_entity_type_invalid");
    const cursor = command.payload && command.payload.cursor;
    if (cursor !== undefined && cursor !== null && !safeId(cursor)) throw workflowError("draft_cursor_invalid");
    const requestedLimit = command.payload && command.payload.limit;
    const limit = requestedLimit === undefined ? 25 : requestedLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DRAFT_PAGE_ITEMS) {
      throw workflowError("draft_page_limit_invalid");
    }
    const page = await input.store.readDraftPage({
      draftId: context.command.draftId,
      entityType,
      cursor: cursor || null,
      limit: limit + 1
    });
    const entries = [];
    for (const entry of page.entries || []) {
      if (entries.length >= limit) break;
      const candidate = entries.concat([entry]);
      if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_DRAFT_PAGE_BYTES) {
        if (entries.length === 0) throw workflowError("draft_page_record_too_large", 413);
        break;
      }
      entries.push(entry);
    }
    const hasMore = (page.entries || []).length > entries.length;
    return Object.freeze({
      draftId: context.command.draftId,
      status: context.summary.status,
      revision: context.summary.revision,
      validationStatus: context.summary.validationStatus || "required",
      validatedRevision: context.summary.validatedRevision || null,
      validationErrorCount: context.summary.validationErrorCount,
      entityType,
      entries,
      nextCursor: hasMore && entries.length ? entries[entries.length - 1].entityId : null,
      hasMore
    });
  }

  async function saveDraft(command) {
    const operations = validateOperations(command.payload && command.payload.operations);
    const context = await loadAuthorized(command.payload, command.account, operations);
    const changeSummary = command.payload && command.payload.changeSummary;
    if (typeof changeSummary !== "string" || changeSummary.trim().length < 3 || changeSummary.length > 500) {
      throw workflowError("change_summary_invalid");
    }
    return input.store.saveDraft({
      draftId: context.command.draftId,
      expectedRevision: context.command.expectedRevision,
      actorUid: command.actorUid,
      idempotencyKey: command.idempotencyKey,
      requestId: command.requestId,
      operatorScope: context.operatorScope,
      operations,
      changeSummary: changeSummary.trim(),
      occurredAt: now()
    });
  }

  async function requestReview(command) {
    const context = await loadAuthorized(command.payload, command.account);
    return input.store.requestReview({
      draftId: context.command.draftId,
      expectedRevision: context.command.expectedRevision,
      actorUid: command.actorUid,
      idempotencyKey: command.idempotencyKey,
      requestId: command.requestId,
      operatorScope: context.operatorScope,
      occurredAt: now()
    });
  }

  async function decideApproval(command) {
    const context = await loadAuthorized(command.payload, command.account);
    const decision = command.payload && command.payload.decision;
    if (!["approve", "reject"].includes(decision)) throw workflowError("approval_decision_invalid");
    const comment = command.payload && command.payload.comment;
    if (comment !== undefined && (typeof comment !== "string" || comment.length > 1000)) {
      throw workflowError("approval_comment_invalid");
    }
    return input.store.decideApproval({
      draftId: context.command.draftId,
      expectedRevision: context.command.expectedRevision,
      actorUid: command.actorUid,
      idempotencyKey: command.idempotencyKey,
      requestId: command.requestId,
      operatorScope: context.operatorScope,
      decision,
      comment: typeof comment === "string" ? comment.trim() : "",
      occurredAt: now()
    });
  }

  return Object.freeze({ decideApproval, readDraft, requestReview, saveDraft });
}

module.exports = {
  DRAFT_ID_PATTERN,
  MAX_DRAFT_CHANGE_BYTES,
  MAX_DRAFT_OPERATIONS,
  MAX_DRAFT_PAGE_BYTES,
  MAX_DRAFT_PAGE_ITEMS,
  assertDraftCommand,
  createDraftWorkflowService,
  safeId,
  scopeFor,
  validateOperations,
  workflowError
};