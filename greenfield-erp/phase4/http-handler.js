"use strict";

const { MAX_COMMAND_BYTES } = require("./command-gateway.js");

function httpError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = status;
  return error;
}

function setHeader(response, name, value) {
  if (response && typeof response.setHeader === "function") response.setHeader(name, value);
  else if (response && typeof response.set === "function") response.set(name, value);
}

function sendJson(response, status, body) {
  if (typeof response.status === "function") response.status(status);
  else response.statusCode = status;
  setHeader(response, "content-type", "application/json; charset=utf-8");
  if (typeof response.json === "function") return response.json(body);
  return response.end(JSON.stringify(body));
}

function requestOrigin(request) {
  return request.headers && (request.headers.origin || request.headers.Origin) || "";
}

function applyCors(request, response, allowedOrigins) {
  const origin = requestOrigin(request);
  if (!origin) return;
  if (!allowedOrigins.includes(origin)) throw httpError("origin_denied", 403);
  setHeader(response, "access-control-allow-origin", origin);
  setHeader(response, "vary", "Origin");
  setHeader(response, "access-control-allow-methods", "POST, OPTIONS");
  setHeader(response, "access-control-allow-headers", "authorization, content-type");
  setHeader(response, "access-control-max-age", "600");
}

function bearerToken(request) {
  const value = request.headers && (request.headers.authorization || request.headers.Authorization);
  const match = typeof value === "string" ? value.match(/^Bearer ([^\s]+)$/) : null;
  if (!match) throw httpError("unauthenticated", 401);
  return match[1];
}

function bodyObject(request) {
  const length = Number(request.headers && request.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > MAX_COMMAND_BYTES) throw httpError("command_payload_too_large", 413);
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body); }
    catch (_error) { throw httpError("invalid_json", 400); }
  }
  throw httpError("invalid_json", 400);
}

function createFirebaseHttpHandler(options) {
  const input = options || {};
  if (typeof input.verifyIdToken !== "function") throw new Error("greenfield_token_verifier_required");
  if (!input.gateway || typeof input.gateway.execute !== "function") throw new Error("greenfield_command_gateway_required");
  const allowedOrigins = Array.isArray(input.allowedOrigins) ? input.allowedOrigins : [];

  return async function greenfieldErpCommandHandler(request, response) {
    try {
      applyCors(request, response, allowedOrigins);
      if (request.method === "OPTIONS") return sendJson(response, 204, {});
      if (request.method !== "POST") throw httpError("method_not_allowed", 405);
      const decoded = await input.verifyIdToken(bearerToken(request));
      const uid = decoded && (decoded.uid || decoded.sub);
      const role = decoded && decoded.role;
      const result = await input.gateway.execute(bodyObject(request), { uid, role });
      return sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      const status = Number.isInteger(error && error.httpStatus) ? error.httpStatus : 500;
      const code = error && typeof error.code === "string" ? error.code : "internal_error";
      return sendJson(response, status, { ok: false, code });
    }
  };
}

module.exports = { applyCors, bearerToken, bodyObject, createFirebaseHttpHandler, sendJson };