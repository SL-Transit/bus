"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Api = require("../admin-erp1-greenfield-api-client.js");
const {
  createUploadAuthorizationService,
  uploadIdFor,
  validateUploadRequest
} = require("../greenfield-erp/phase6a/upload-authorization-service.js");
const {
  MAX_DRAFT_CHANGE_BYTES,
  MAX_DRAFT_OPERATIONS,
  createDraftWorkflowService,
  validateOperations
} = require("../greenfield-erp/phase6a/draft-workflow-service.js");
const { assertEnvelope, createCommandGateway } = require("../greenfield-erp/phase4/command-gateway.js");

const account = {
  active: true,
  allowedCommands: ["upload.authorize", "import.start", "import.status", "draft.save", "review.request", "approval.decide"],
  resourceScopes: { operatorIds: ["OPR-BUS01"] }
};

test("Admin client sends requestId and idempotencyKey without exposing Publish", async () => {
  let request;
  const client = Api.createClient({
    getToken: async () => "token",
    transport: async function (input) {
      request = input;
      return { ok: true, status: 200, data: { ok: true, result: { accepted: true } } };
    }
  });
  const result = await client.send("review.request", { draftId: "DRF-" + "A".repeat(24) });
  assert.equal(result.accepted, true);
  assert.match(request.body.requestId, /^REQ-/);
  assert.match(request.body.idempotencyKey, /^IDM-/);
  assert.equal(request.headers["x-idempotency-key"], request.body.idempotencyKey);
  assert.equal(Api.ALLOWED_COMMANDS.includes("publication.activate"), false);
});

test("Admin client builds the Firebase multipart upload used by the browser", async () => {
  let request;
  const client = Api.createClient({
    getToken: async () => "demo-token",
    uploadTransport: async function (input) {
      request = input;
      return { ok: true, status: 200 };
    }
  });
  await client.upload(new Blob(["{}"], { type: "application/json" }), {
    url: "http://127.0.0.1:9299/v0/b/demo.appspot.com/o?name=staged.json",
    method: "POST",
    uploadProtocol: "storage-multipart-v1",
    objectPath: "erp-import-quarantine/owner-001/UPL-AAAAAAAAAAAAAAAAAAAAAAAA.json",
    objectContentType: "application/json",
    headers: { "x-goog-upload-protocol": "multipart" }
  });
  assert.equal(request.headers.Authorization, "Bearer demo-token");
  assert.equal(request.headers["x-goog-upload-protocol"], "multipart");
  assert.match(request.headers["content-type"], /^multipart\/related; boundary=sltransit/);
  const body = await request.body.text();
  assert.match(body, /Content-Type: application\/json; charset=utf-8/);
  assert.match(body, /"name":"erp-import-quarantine\/owner-001\/UPL-AAAAAAAAAAAAAAAAAAAAAAAA.json"/);
  assert.match(body, /\r\n\{\}\r\n--sltransit/);
});
test("command envelope rejects missing idempotency and oversized payload", () => {
  assert.throws(
    () => assertEnvelope({ requestId: "REQ-20260811-6001", command: "import.status", payload: {} }),
    /invalid_idempotency_key/
  );
  assert.doesNotThrow(() => assertEnvelope({
    requestId: "REQ-20260811-6002",
    idempotencyKey: "IDM-20260811-6002",
    command: "import.status",
    payload: {}
  }));
});

test("upload authorization is canonical-JSON only, bounded and idempotent", async () => {
  const saved = [];
  const service = createUploadAuthorizationService({
    bucketName: "demo.appspot.com",
    now: () => "2026-08-11T00:00:00.000Z",
    store: {
      async createAuthorization(record) {
        saved.push(record);
        return { reused: saved.length > 1, expiresAt: record.expiresAt };
      }
    },
    buildUploadTarget(input) {
      return {
        url: "http://127.0.0.1:9299/v0/b/" + input.bucket + "/o?name=" + encodeURIComponent(input.objectPath),
        method: "POST",
        uploadProtocol: "storage-multipart-v1",
        objectPath: input.objectPath,
        objectContentType: input.contentType,
        headers: { "x-goog-upload-protocol": "multipart" }
      };
    }
  });
  const payload = {
    fileName: "network.json",
    contentType: "application/json",
    sizeBytes: 100,
    checksumSha256: "sha256:" + "a".repeat(64)
  };
  const command = {
    actorUid: "owner-001",
    idempotencyKey: "IDM-20260811-UPLOAD1",
    operatorScope: ["OPR-BUS01"],
    payload
  };
  const first = await service.authorize(command);
  const second = await service.authorize(command);
  assert.equal(first.uploadId, uploadIdFor(command.actorUid, command.idempotencyKey));
  assert.equal(first.source.objectPath, second.source.objectPath);
  assert.equal(second.reused, true);
  assert.equal(first.source.contentType, "application/json");
  assert.equal(first.target.uploadProtocol, "storage-multipart-v1");
  assert.equal(first.target.objectPath, first.source.objectPath);
  assert.equal(first.target.headers["x-goog-upload-protocol"], "multipart");
  assert.throws(() => validateUploadRequest({ ...payload, contentType: "application/xlsx" }), /upload_content_type_not_supported/);
  assert.throws(() => validateUploadRequest({ ...payload, sizeBytes: 25 * 1024 * 1024 + 1 }), /upload_size_invalid/);
});

test("Draft save validates stable target, revision scope and bounded changes", async () => {
  let saved;
  const service = createDraftWorkflowService({
    now: () => "2026-08-11T00:00:00.000Z",
    store: {
      async getDraftSummary() {
        return { draftId: "DRF-" + "A".repeat(24), revision: 1, status: "draft", operatorScope: ["OPR-BUS01"] };
      },
      async saveDraft(input) {
        saved = input;
        return { draftId: input.draftId, status: "draft", revision: 2, validationStatus: "required" };
      },
      async requestReview(input) {
        return { draftId: input.draftId, status: "review_requested", revision: 2 };
      },
      async decideApproval(input) {
        return { draftId: input.draftId, status: "approved", revision: 3 };
      }
    }
  });
  const draftId = "DRF-" + "A".repeat(24);
  const result = await service.saveDraft({
    actorUid: "operator-001",
    account,
    requestId: "REQ-20260811-6101",
    idempotencyKey: "IDM-20260811-6101",
    payload: {
      draftId,
      expectedRevision: 1,
      operatorScope: ["OPR-BUS01"],
      changeSummary: "แก้ชื่อสายรถเพื่อส่งตรวจใหม่",
      operations: [{
        entityType: "routes",
        entityId: "RTE-BUS01-0001",
        value: { routeId: "RTE-BUS01-0001", operatorId: "OPR-BUS01", shortName: "F2", serviceMode: "fixed" }
      }]
    }
  });
  assert.equal(result.validationStatus, "required");
  assert.equal(saved.expectedRevision, 1);
  assert.equal(saved.operations.length, 1);
  assert.equal(MAX_DRAFT_OPERATIONS, 100);
  assert.equal(MAX_DRAFT_CHANGE_BYTES, 512 * 1024);
  assert.throws(() => validateOperations([{ entityType: "routes", entityId: "RTE-BUS01-0001", value: { routeId: "RTE-OTHER" } }]), /draft_entity_id_mismatch/);
});

test("workflow service denies Draft belonging to another operator", async () => {
  const service = createDraftWorkflowService({
    store: {
      async getDraftSummary() {
        return { revision: 1, status: "draft", operatorScope: ["OPR-OTHER"] };
      },
      async requestReview() {
        throw new Error("must_not_run");
      }
    }
  });
  await assert.rejects(service.requestReview({
    actorUid: "operator-001",
    account,
    requestId: "REQ-20260811-6102",
    idempotencyKey: "IDM-20260811-6102",
    payload: {
      draftId: "DRF-" + "B".repeat(24),
      expectedRevision: 1,
      operatorScope: ["OPR-BUS01"]
    }
  }), function (error) { return error.code === "operator_scope_denied"; });
});

test("gateway routes upload and workflow commands only after hybrid authorization", async () => {
  const calls = [];
  const gateway = createCommandGateway({
    accessReader: { async getAccount() { return account; } },
    importJobService: { async start() {}, async status() {} },
    uploadAuthorizationService: {
      async authorize(command) {
        calls.push(command.actorUid);
        return { uploadId: "UPL-" + "A".repeat(24) };
      }
    },
    workflowService: {
      async requestReview(command) {
        calls.push(command.idempotencyKey);
        return { draftId: command.payload.draftId, status: "review_requested", revision: 2 };
      }
    }
  });
  const result = await gateway.execute({
    requestId: "REQ-20260811-6201",
    idempotencyKey: "IDM-20260811-6201",
    command: "review.request",
    payload: {
      draftId: "DRF-" + "A".repeat(24),
      expectedRevision: 1,
      operatorScope: ["OPR-BUS01"]
    }
  }, { uid: "operator-001", role: "operations" });
  assert.equal(result.result.status, "review_requested");
  assert.deepEqual(calls, ["IDM-20260811-6201"]);
});

test("Phase 6A runtime is emulator-guarded and contains no publication path", () => {
  const root = path.resolve(__dirname, "..");
  const entry = fs.readFileSync(path.join(root, "greenfield-erp/phase4/functions/index.js"), "utf8");
  const store = fs.readFileSync(path.join(root, "greenfield-erp/phase6a/rtdb-draft-workflow-store.js"), "utf8");
  const controller = fs.readFileSync(path.join(root, "admin-erp1-greenfield-controller.js"), "utf8");
  assert.match(entry, /assertDemoDatabaseEmulator/);
  assert.match(entry, /greenfield_storage_emulator_required/);
  assert.ok(entry.includes("maxInstances: 3, concurrency: 10"));
  assert.match(store, /commandReceipts/);
  assert.match(store, /workflowLock/);
  assert.doesNotMatch([entry, store, controller].join(String.fromCharCode(10)), /publishedReadModels|publication.activate|firebase deploy/i);
});