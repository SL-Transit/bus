"use strict";

const crypto = require("node:crypto");
const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { DEFAULT_BASE_PATH } = require("../phase2/rtdb-emulator-draft-store.js");
const { UPLOAD_ID_PATTERN } = require("./upload-authorization-service.js");

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assertDatabase(database) {
  if (!database || typeof database.ref !== "function") {
    throw new Error("greenfield_injected_database_required");
  }
}

function createRtdbUploadAuthorizationStore(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({
    projectId: input.projectId,
    databaseEmulatorHost: input.databaseEmulatorHost
  });
  assertDatabase(input.database);
  const database = input.database;
  const basePath = input.basePath || DEFAULT_BASE_PATH;
  if (basePath !== DEFAULT_BASE_PATH) throw new Error("greenfield_erp_base_path_locked");

  return Object.freeze({
    async createAuthorization(record) {
      if (!UPLOAD_ID_PATTERN.test(record.uploadId || "")) throw new Error("invalid_upload_id");
      const ref = database.ref(basePath + "/uploadAuthorizations/" + record.uploadId);
      const creationToken = crypto.randomBytes(16).toString("hex");
      const transaction = await ref.transaction(function (current) {
        if (current) return current;
        return {
          uploadId: record.uploadId,
          actorUid: record.actorUid,
          idempotencyHash: digest(record.actorUid + ":" + record.idempotencyKey),
          operatorScope: record.operatorScope,
          bucket: record.bucket,
          objectPath: record.objectPath,
          contentType: record.contentType,
          sizeBytes: record.sizeBytes,
          checksumSha256: record.checksumSha256,
          originalFileName: record.originalFileName,
          status: "authorized",
          creationToken,
          retentionClass: "upload_authorization",
          createdAt: record.createdAt,
          expiresAt: record.expiresAt
        };
      }, undefined, false);
      const stored = transaction && transaction.snapshot && transaction.snapshot.val();
      if (!stored) throw new Error("upload_authorization_write_failed");
      if (stored.actorUid !== record.actorUid || stored.objectPath !== record.objectPath ||
          stored.checksumSha256 !== record.checksumSha256 || stored.sizeBytes !== record.sizeBytes) {
        const error = new Error("idempotency_key_reused");
        error.code = "idempotency_key_reused";
        error.httpStatus = 409;
        throw error;
      }
      const reused = stored.creationToken !== creationToken;
      if (!reused) {
        const auditId = "AUD-" + digest(record.uploadId + ":authorized").slice(0, 24).toUpperCase();
        const updates = {};
        updates["audit/events/" + auditId] = {
          eventId: auditId,
          eventType: "upload.authorized",
          entityId: record.uploadId,
          actorUid: record.actorUid,
          operatorScope: record.operatorScope,
          occurredAt: record.createdAt
        };
        updates["maintenance/expiryBuckets/" + record.expiresAt.slice(0, 10) + "/uploadAuthorizations/" + record.uploadId] = true;
        await database.ref(basePath).update(updates);
      }
      return { uploadId: record.uploadId, reused, expiresAt: stored.expiresAt };
    },
    async consumeAuthorization(inputConsume) {
      const match = typeof inputConsume.source.objectPath === "string" && inputConsume.source.objectPath.match(/\/(UPL-[A-F0-9]{24})[.]json$/);
      if (!match) throw new Error("upload_authorization_not_found");
      const uploadId = match[1];
      const ref = database.ref(basePath + "/uploadAuthorizations/" + uploadId);
      const transaction = await ref.transaction(function (current) {
        if (!current) return current;
        if (current.actorUid !== inputConsume.actorUid || current.bucket !== inputConsume.source.bucket ||
            current.objectPath !== inputConsume.source.objectPath || current.sizeBytes !== inputConsume.source.sizeBytes ||
            current.checksumSha256 !== inputConsume.source.checksumSha256 || current.contentType !== inputConsume.source.contentType) return current;
        if (current.status === "consumed") return current;
        if (current.status !== "authorized" || current.expiresAt <= inputConsume.consumedAt) return current;
        return { ...current, status: "consumed", consumedAt: inputConsume.consumedAt };
      }, undefined, false);
      const stored = transaction && transaction.snapshot && transaction.snapshot.val();
      if (!stored) throw new Error("upload_authorization_not_found");
      if (stored.actorUid !== inputConsume.actorUid || stored.objectPath !== inputConsume.source.objectPath ||
          stored.checksumSha256 !== inputConsume.source.checksumSha256 || stored.status !== "consumed") {
        const error = new Error("upload_authorization_invalid");
        error.code = "upload_authorization_invalid";
        error.httpStatus = 403;
        throw error;
      }
      await database.ref(basePath + "/maintenance/expiryBuckets/" + stored.expiresAt.slice(0, 10) + "/uploadAuthorizations/" + uploadId).remove();
      return { uploadId, reused: stored.consumedAt !== inputConsume.consumedAt };
    }
  });
}

module.exports = { createRtdbUploadAuthorizationStore };