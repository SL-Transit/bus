"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const { authorizeCommand } = require("../greenfield-erp/phase4/authorization-service.js");
const { createCommandGateway, createFixedWindowRateLimiter } = require("../greenfield-erp/phase4/command-gateway.js");
const { createFirebaseHttpHandler } = require("../greenfield-erp/phase4/http-handler.js");
const { createImportJobService, jobIdFor } = require("../greenfield-erp/phase4/import-job-service.js");
const { createRetentionService } = require("../greenfield-erp/phase4/retention-service.js");
const { parseRetentionPolicy } = require("../greenfield-erp/phase4/retention-policy.js");
const { createStoragePackageReader } = require("../greenfield-erp/phase4/storage-package-reader.js");
const valid = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

const policy = parseRetentionPolicy({ importJobRetentionHours: 24, abandonedDraftRetentionDays: 30, cleanupStartDate: "2026-08-01", batchSize: 20, maxDaysPerRun: 10, leaseSeconds: 60 });
const account = { active: true, allowedCommands: ["import.start", "import.status"], resourceScopes: { operatorIds: ["OPR-BUS01"] } };
const accessReader = { async getAccount() { return account; } };
function stagedSource(uid, buffer) { return { bucket: "demo.appspot.com", objectPath: "erp-import-quarantine/" + uid + "/package.json", contentType: "application/json", sizeBytes: buffer.length, checksumSha256: "sha256:" + crypto.createHash("sha256").update(buffer).digest("hex") }; }
function responseMock() { return { headers: {}, statusCode: 0, body: null, setHeader(name, value) { this.headers[name] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, end(value) { this.body = value ? JSON.parse(value) : null; return this; } }; }

test("retention policy requires Owner-configured values and bounds", () => {
  assert.equal(policy.importJobRetentionHours, 24);
  assert.throws(() => parseRetentionPolicy({}), /invalid_retention_policy/);
  assert.throws(() => parseRetentionPolicy({ ...policy, batchSize: 1000 }), /batchSize/);
});

test("authorization requires role, command permission and operator scope", async () => {
  const payload = { operatorScope: ["OPR-BUS01"] };
  const allowed = await authorizeCommand({ uid: "owner-001", role: "admin", command: "import.start", payload, accessReader });
  assert.equal(allowed.uid, "owner-001");
  await assert.rejects(authorizeCommand({ uid: "owner-001", role: "viewer", command: "import.start", payload, accessReader }), (error) => error.code === "coarse_role_denied");
  await assert.rejects(authorizeCommand({ uid: "owner-001", role: "admin", command: "import.start", payload: { operatorScope: ["OPR-OTHER"] }, accessReader }), (error) => error.code === "operator_scope_denied");
});

test("gateway enqueues metadata only and returns jobId without validating package", async () => {
  let startCommand;
  const gateway = createCommandGateway({
    accessReader,
    importJobService: {
      async start(value) { startCommand = value; return { ok: true, jobId: "JOB-1234567890ABCDEF12345678", status: "queued" }; },
      async status() { return null; }
    }
  });
  const output = await gateway.execute({ requestId: "REQ-20260811-0001", idempotencyKey: "IDM-REQ-20260811-0001", command: "import.start", payload: { operatorScope: ["OPR-BUS01"], source: { metadataOnly: true } } }, { uid: "owner-001", role: "admin" });
  assert.equal(output.accepted, true);
  assert.equal(output.result.status, "queued");
  assert.equal(startCommand.payload.package, undefined);
});

test("job service writes queue metadata first and worker creates Draft later", async () => {
  const bytes = Buffer.from(JSON.stringify(valid));
  const source = stagedSource("owner-001", bytes);
  const events = [];
  const jobStore = {
    async createQueuedJob(job) { events.push("queued"); this.job = { ...job, status: "queued", attempts: 0 }; return { ok: true, reused: false, jobId: job.jobId, status: "queued" }; },
    async claimJob() { events.push("claimed"); return { claimed: true, job: this.job }; },
    async finishJob(result) { events.push(result.status); },
    async markRetryableFailure() { events.push("retryable"); }
  };
  const service = createImportJobService({
    jobStore, packageReader: { async readPackage() { events.push("read"); return valid; } }, draftStore: {}, retentionPolicy: policy,
    createValidatedDraft: async (input) => { events.push("draft"); assert.ok(input.draftExpiresAt); return { ok: true, draftId: "DRF-001" }; },
    now: () => "2026-08-11T00:00:00.000Z"
  });
  const queued = await service.start({ requestId: "REQ-20260811-0002", actorUid: "owner-001", payload: { operatorScope: ["OPR-BUS01"], source } });
  assert.equal(queued.status, "queued");
  assert.deepEqual(events, ["queued"]);
  const completed = await service.process(jobIdFor("REQ-20260811-0002", "owner-001"), "WORKER-001");
  assert.equal(completed.status, "completed");
  assert.deepEqual(events, ["queued", "claimed", "read", "draft", "completed"]);
});

test("Storage reader streams, verifies byte count and checksum before JSON parse", async () => {
  const bytes = Buffer.from(JSON.stringify(valid));
  const storage = { bucket() { return { file() { return { createReadStream() { return Readable.from([bytes.subarray(0, 20), bytes.subarray(20)]); }, async delete() {} }; } }; } };
  const reader = createStoragePackageReader({ storage });
  const pkg = await reader.readPackage(stagedSource("owner-001", bytes));
  assert.equal(pkg.metadata.packageId, valid.metadata.packageId);
  await assert.rejects(reader.readPackage({ ...stagedSource("owner-001", bytes), checksumSha256: "sha256:" + "0".repeat(64) }), (error) => error.code === "source_checksum_mismatch");
});

test("retention cleanup uses a lease, bounded batch and cursor", async () => {
  const calls = [];
  const store = {
    async acquireLease() { calls.push("lease"); return true; }, async releaseLease() { calls.push("release"); },
    async getCursor() { return "2026-08-10"; }, async saveCursor(value) { calls.push("cursor:" + value); },
    async listCandidates(date, limit) { calls.push("list:" + date + ":" + limit); return date === "2026-08-10" ? [{ type: "importJobs", id: "JOB-1", expiryDateKey: date }] : []; },
    async cleanupImportJob() { return { action: "deleted" }; }, async cleanupDraft() { return { action: "deleted" }; }
  };
  const service = createRetentionService({ store, policy: { ...policy, maxDaysPerRun: 2 }, now: () => "2026-08-11T12:00:00.000Z" });
  const result = await service.run("RUN-001");
  assert.equal(result.deleted, 1);
  assert.ok(calls.includes("release"));
  assert.ok(calls.every((value) => !value.startsWith("list:") || value.endsWith(":" + policy.batchSize)));
});

test("HTTP handler returns 202 for asynchronous import", async () => {
  const handler = createFirebaseHttpHandler({ allowedOrigins: ["http://localhost:5000"], verifyIdToken: async () => ({ uid: "owner-001", role: "admin" }), gateway: { async execute() { return { accepted: true, result: { jobId: "JOB-1", status: "queued" } }; } } });
  const response = responseMock();
  await handler({ method: "POST", headers: { origin: "http://localhost:5000", authorization: "Bearer token" }, body: { requestId: "REQ-20260811-0003", idempotencyKey: "IDM-REQ-20260811-0003", command: "import.start", payload: {} } }, response);
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.result.status, "queued");
});

test("rate limiter remains bounded per instance window", () => {
  let timestamp = 1000; const limiter = createFixedWindowRateLimiter({ maxRequests: 2, windowMs: 100, now: () => timestamp });
  limiter.consume("uid"); limiter.consume("uid"); assert.throws(() => limiter.consume("uid"), /rate_limit_exceeded/); timestamp = 1100; assert.doesNotThrow(() => limiter.consume("uid"));
});

test("Function entry separates gateway, task worker and scheduled cleanup", () => {
  const root = path.resolve(__dirname, ".."); const entry = fs.readFileSync(path.join(root, "greenfield-erp/phase4/functions/index.js"), "utf8");
  assert.match(entry, /onTaskDispatched/); assert.match(entry, /onSchedule/); assert.match(entry, /maxInstances:\s*2, concurrency:\s*1/); assert.match(entry, /maxInstances:\s*1, concurrency:\s*1/);
  assert.match(entry, /GREENFIELD_RETENTION_POLICY_JSON/); assert.match(entry, /assertDemoDatabaseEmulator/);
  assert.doesNotMatch(entry, /publishedReadModels|publication\/current|firebase deploy/i);
});