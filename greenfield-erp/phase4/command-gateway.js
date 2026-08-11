"use strict";

const { authorizeCommand, hasOperatorScope } = require("./authorization-service.js");

const MAX_COMMAND_BYTES = 1024 * 1024;
const REQUEST_ID_PATTERN = /^REQ-[A-Z0-9][A-Z0-9_-]{7,63}$/;

function commandError(code, httpStatus) { const error = new Error(code); error.code = code; error.httpStatus = httpStatus || 400; return error; }
function commandBytes(envelope) { return Buffer.byteLength(JSON.stringify(envelope || {}), "utf8"); }
function createFixedWindowRateLimiter(options) {
  const input = options || {}; const maxRequests = input.maxRequests || 20; const windowMs = input.windowMs || 60000;
  const now = typeof input.now === "function" ? input.now : Date.now; const windows = new Map();
  return { consume(key) { const timestamp = now(); const current = windows.get(key); if (!current || timestamp - current.startedAt >= windowMs) { windows.set(key, { startedAt: timestamp, count: 1 }); return; } current.count += 1; if (current.count > maxRequests) throw commandError("rate_limit_exceeded", 429); } };
}
function assertEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw commandError("invalid_command_envelope");
  if (!REQUEST_ID_PATTERN.test(envelope.requestId || "")) throw commandError("invalid_request_id");
  if (commandBytes(envelope) > MAX_COMMAND_BYTES) throw commandError("command_payload_too_large", 413);
  if (typeof envelope.command !== "string") throw commandError("invalid_command");
}
function publicJob(job) {
  return { jobId: job.jobId, status: job.status, attempts: job.attempts || 0, draftId: job.draftId || null, resultCode: job.resultCode || null, createdAt: job.createdAt, lastTouchedAt: job.lastTouchedAt, expiresAt: job.expiresAt };
}

function createCommandGateway(options) {
  const input = options || {};
  if (!input.importJobService) throw new Error("greenfield_import_job_service_required");
  if (!input.accessReader) throw new Error("greenfield_access_reader_required");
  const limiter = input.rateLimiter || createFixedWindowRateLimiter();
  async function execute(envelope, authContext) {
    assertEnvelope(envelope);
    const auth = authContext || {}; limiter.consume(auth.uid || "anonymous");
    const authorization = await authorizeCommand({ uid: auth.uid, role: auth.role, command: envelope.command, payload: envelope.payload, accessReader: input.accessReader });
    if (envelope.command === "import.start") {
      const result = await input.importJobService.start({ requestId: envelope.requestId, payload: envelope.payload, actorUid: auth.uid });
      return Object.freeze({ requestId: envelope.requestId, command: envelope.command, accepted: true, result });
    }
    if (envelope.command === "import.status") {
      const job = await input.importJobService.status(envelope.payload && envelope.payload.jobId);
      if (!hasOperatorScope(authorization.account, job.operatorScope)) throw commandError("operator_scope_denied", 403);
      return Object.freeze({ requestId: envelope.requestId, command: envelope.command, result: publicJob(job) });
    }
    throw commandError("command_not_implemented_phase4", 501);
  }
  return Object.freeze({ execute });
}

module.exports = { MAX_COMMAND_BYTES, REQUEST_ID_PATTERN, commandBytes, createFixedWindowRateLimiter, createCommandGateway, publicJob };