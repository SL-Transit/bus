"use strict";

const { createValidatedDraft } = require("../phase2/draft-service.js");
const { authorizeCommand } = require("./authorization-service.js");

const MAX_COMMAND_BYTES = 26 * 1024 * 1024;
const REQUEST_ID_PATTERN = /^REQ-[A-Z0-9][A-Z0-9_-]{7,63}$/;

function commandError(code, httpStatus) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = httpStatus || 400;
  return error;
}

function commandBytes(envelope) {
  return Buffer.byteLength(JSON.stringify(envelope || {}), "utf8");
}

function createFixedWindowRateLimiter(options) {
  const input = options || {};
  const maxRequests = input.maxRequests || 20;
  const windowMs = input.windowMs || 60000;
  const now = typeof input.now === "function" ? input.now : Date.now;
  const windows = new Map();
  return {
    consume(key) {
      const timestamp = now();
      const current = windows.get(key);
      if (!current || timestamp - current.startedAt >= windowMs) {
        windows.set(key, { startedAt: timestamp, count: 1 });
        return;
      }
      current.count += 1;
      if (current.count > maxRequests) throw commandError("rate_limit_exceeded", 429);
    }
  };
}

function assertEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw commandError("invalid_command_envelope", 400);
  if (!REQUEST_ID_PATTERN.test(envelope.requestId || "")) throw commandError("invalid_request_id", 400);
  if (commandBytes(envelope) > MAX_COMMAND_BYTES) throw commandError("command_payload_too_large", 413);
  if (typeof envelope.command !== "string") throw commandError("invalid_command", 400);
}

function createCommandGateway(options) {
  const input = options || {};
  if (!input.draftStore) throw new Error("greenfield_draft_store_required");
  if (!input.accessReader) throw new Error("greenfield_access_reader_required");
  const limiter = input.rateLimiter || createFixedWindowRateLimiter();
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };

  async function execute(envelope, authContext) {
    assertEnvelope(envelope);
    const auth = authContext || {};
    limiter.consume(auth.uid || "anonymous");
    await authorizeCommand({
      uid: auth.uid,
      role: auth.role,
      command: envelope.command,
      payload: envelope.payload,
      accessReader: input.accessReader
    });

    if (envelope.command !== "import.validate") {
      throw commandError("command_not_implemented_phase4", 501);
    }
    if (!envelope.payload || !envelope.payload.package) throw commandError("network_package_required", 400);

    const result = await createValidatedDraft({
      package: envelope.payload.package,
      actorUid: auth.uid,
      store: input.draftStore,
      now
    });
    return Object.freeze({ requestId: envelope.requestId, command: envelope.command, result });
  }

  return Object.freeze({ execute });
}

module.exports = {
  MAX_COMMAND_BYTES,
  REQUEST_ID_PATTERN,
  commandBytes,
  createFixedWindowRateLimiter,
  createCommandGateway
};