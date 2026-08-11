"use strict";

const crypto = require("node:crypto");
const { MAX_IMPORT_PACKAGE_BYTES } = require("../phase2/draft-service.js");

const UPLOAD_ID_PATTERN = /^UPL-[A-F0-9]{24}$/;
const CONTENT_TYPE = "application/json";
const AUTHORIZATION_TTL_SECONDS = 900;

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function uploadError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = status || 400;
  return error;
}

function safeFileName(value) {
  if (typeof value !== "string") return "";
  const name = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}.json$/i.test(name)) return "";
  return name;
}

function validateUploadRequest(payload) {
  const input = payload || {};
  const fileName = safeFileName(input.fileName);
  if (!fileName) throw uploadError("upload_file_name_invalid");
  if (input.contentType !== CONTENT_TYPE) throw uploadError("upload_content_type_not_supported", 415);
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_IMPORT_PACKAGE_BYTES) {
    throw uploadError("upload_size_invalid", 413);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(input.checksumSha256 || "")) {
    throw uploadError("upload_checksum_invalid");
  }
  return Object.freeze({
    fileName,
    contentType: CONTENT_TYPE,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256
  });
}

function uploadIdFor(actorUid, idempotencyKey) {
  return "UPL-" + digest(actorUid + ":" + idempotencyKey).slice(0, 24).toUpperCase();
}

function createUploadAuthorizationService(options) {
  const input = options || {};
  if (!input.store || typeof input.store.createAuthorization !== "function") {
    throw new Error("greenfield_upload_authorization_store_required");
  }
  if (typeof input.buildUploadTarget !== "function") {
    throw new Error("greenfield_upload_target_builder_required");
  }
  if (typeof input.bucketName !== "string" || !input.bucketName) {
    throw new Error("greenfield_upload_bucket_required");
  }
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };
  const ttlSeconds = input.ttlSeconds || AUTHORIZATION_TTL_SECONDS;

  async function authorize(command) {
    const upload = validateUploadRequest(command.payload);
    const uploadId = uploadIdFor(command.actorUid, command.idempotencyKey);
    const objectPath = "erp-import-quarantine/" + command.actorUid + "/" + uploadId + ".json";
    const createdAt = now();
    const expiresAt = new Date(Date.parse(createdAt) + ttlSeconds * 1000).toISOString();
    const authorization = await input.store.createAuthorization({
      uploadId,
      actorUid: command.actorUid,
      idempotencyKey: command.idempotencyKey,
      operatorScope: command.operatorScope,
      bucket: input.bucketName,
      objectPath,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      checksumSha256: upload.checksumSha256,
      originalFileName: upload.fileName,
      createdAt,
      expiresAt
    });
    const target = input.buildUploadTarget({
      bucket: input.bucketName,
      objectPath,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      expiresAt
    });
    if (!target || typeof target.url !== "string" || !/^https?:///.test(target.url)) {
      throw uploadError("upload_target_unavailable", 503);
    }
    return Object.freeze({
      uploadId,
      reused: authorization.reused === true,
      expiresAt,
      target: {
        url: target.url,
        method: target.method || "POST",
        headers: Object.freeze({ ...(target.headers || {}), "content-type": upload.contentType })
      },
      source: Object.freeze({
        bucket: input.bucketName,
        objectPath,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        checksumSha256: upload.checksumSha256
      })
    });
  }

  return Object.freeze({ authorize });
}

module.exports = {
  AUTHORIZATION_TTL_SECONDS,
  CONTENT_TYPE,
  UPLOAD_ID_PATTERN,
  createUploadAuthorizationService,
  safeFileName,
  uploadIdFor,
  validateUploadRequest
};