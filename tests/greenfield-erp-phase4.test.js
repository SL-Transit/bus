"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { authorizeCommand } = require("../greenfield-erp/phase4/authorization-service.js");
const { createCommandGateway, createFixedWindowRateLimiter } = require("../greenfield-erp/phase4/command-gateway.js");
const { createFirebaseHttpHandler } = require("../greenfield-erp/phase4/http-handler.js");
const valid = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

function accessReader(account) { return { async getAccount() { return account; } }; }
function responseMock() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value ? JSON.parse(value) : null; return this; }
  };
}

test("authorization requires coarse role, fine permission and operator scope", async () => {
  const account = { active: true, allowedCommands: ["import.validate"], resourceScopes: { operatorIds: ["OPR-BUS01"] } };
  const allowed = await authorizeCommand({ uid: "owner-001", role: "admin", command: "import.validate", payload: { package: valid }, accessReader: accessReader(account) });
  assert.equal(allowed.uid, "owner-001");

  await assert.rejects(authorizeCommand({ uid: "owner-001", role: "viewer", command: "import.validate", payload: { package: valid }, accessReader: accessReader(account) }), (error) => error.code === "coarse_role_denied");
  await assert.rejects(authorizeCommand({ uid: "owner-001", role: "admin", command: "import.validate", payload: { package: valid }, accessReader: accessReader({ ...account, allowedCommands: [] }) }), (error) => error.code === "fine_permission_denied");
  await assert.rejects(authorizeCommand({ uid: "owner-001", role: "admin", command: "import.validate", payload: { package: valid }, accessReader: accessReader({ ...account, resourceScopes: { operatorIds: ["OPR-OTHER"] } }) }), (error) => error.code === "operator_scope_denied");
});

test("gateway connects import.validate to Phase 2 idempotent draft service", async () => {
  const saved = [];
  const store = {
    async findExistingDraft() { return null; },
    async saveValidatedDraft(value) { saved.push(value); }
  };
  const gateway = createCommandGateway({
    draftStore: store,
    accessReader: accessReader({ active: true, allowedCommands: ["import.validate"], resourceScopes: { operatorIds: ["OPR-BUS01"] } }),
    now: () => "2026-08-11T00:00:00.000Z"
  });
  const output = await gateway.execute({ requestId: "REQ-20260811-0001", command: "import.validate", payload: { package: valid } }, { uid: "owner-001", role: "admin" });
  assert.equal(output.result.ok, true);
  assert.equal(output.result.reused, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].actorUid, "owner-001");
});

test("reserved workflow commands fail closed in Phase 4", async () => {
  const gateway = createCommandGateway({
    draftStore: {},
    accessReader: accessReader({ active: true, allowedCommands: ["review.request"], resourceScopes: { operatorIds: ["*"] } })
  });
  await assert.rejects(gateway.execute({ requestId: "REQ-20260811-0002", command: "review.request", payload: { package: valid } }, { uid: "owner-001", role: "admin" }), (error) => error.code === "command_not_implemented_phase4" && error.httpStatus === 501);
});

test("rate limiter is bounded per instance window", () => {
  let timestamp = 1000;
  const limiter = createFixedWindowRateLimiter({ maxRequests: 2, windowMs: 100, now: () => timestamp });
  limiter.consume("uid-1");
  limiter.consume("uid-1");
  assert.throws(() => limiter.consume("uid-1"), /rate_limit_exceeded/);
  timestamp = 1100;
  assert.doesNotThrow(() => limiter.consume("uid-1"));
});

test("HTTP handler verifies bearer token and returns a safe envelope", async () => {
  let received;
  const handler = createFirebaseHttpHandler({
    allowedOrigins: ["http://localhost:5000"],
    verifyIdToken: async (token) => { assert.equal(token, "token-1"); return { uid: "owner-001", role: "admin", ignoredPermissionBlob: "not-read" }; },
    gateway: { async execute(envelope, auth) { received = { envelope, auth }; return { requestId: envelope.requestId, command: envelope.command, result: { ok: true } }; } }
  });
  const response = responseMock();
  await handler({ method: "POST", headers: { origin: "http://localhost:5000", authorization: "Bearer token-1" }, body: { requestId: "REQ-20260811-0003", command: "import.validate", payload: {} } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(received.auth.role, "admin");
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5000");
});

test("HTTP handler rejects missing token and disallowed origin", async () => {
  const handler = createFirebaseHttpHandler({ allowedOrigins: ["http://localhost:5000"], verifyIdToken: async () => ({}), gateway: { async execute() { return {}; } } });
  const noToken = responseMock();
  await handler({ method: "POST", headers: {}, body: {} }, noToken);
  assert.equal(noToken.statusCode, 401);
  assert.equal(noToken.body.code, "unauthenticated");
  const wrongOrigin = responseMock();
  await handler({ method: "POST", headers: { origin: "https://example.invalid", authorization: "Bearer token" }, body: {} }, wrongOrigin);
  assert.equal(wrongOrigin.statusCode, 403);
  assert.equal(wrongOrigin.body.code, "origin_denied");
});

test("Cloud Function entry locks demo environment and cost options", () => {
  const root = path.resolve(__dirname, "..");
  const entry = fs.readFileSync(path.join(root, "greenfield-erp/phase4/functions/index.js"), "utf8");
  const reader = fs.readFileSync(path.join(root, "greenfield-erp/phase4/rtdb-access-reader.js"), "utf8");
  assert.match(entry, /assertDemoDatabaseEmulator/);
  assert.match(entry, /minInstances:\s*0/);
  assert.match(entry, /maxInstances:\s*3/);
  assert.match(entry, /concurrency:\s*10/);
  assert.match(entry, /asia-southeast1/);
  assert.match(reader, /ACCESS_BASE_PATH \+ "\/" \+ uid/);
  assert.doesNotMatch(reader, /ref\(["']data\/erpDataCenter["']\)/);
  assert.doesNotMatch(entry + reader, /publishedReadModels|publication\/current|firebase deploy/i);
});