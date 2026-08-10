"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../greenfield-erp/phase2");
const contractRoot = path.join(__dirname, "../contracts/greenfield-erp/v1");
const guard = require(path.join(root, "environment-guard.js"));
const mapper = require(path.join(root, "excel-row-mapper.js"));
const draftService = require(path.join(root, "draft-service.js"));
const rtdbStore = require(path.join(root, "rtdb-emulator-draft-store.js"));
const validator = require(path.join(contractRoot, "runtime/validate-network-package.js"));
const valid = JSON.parse(fs.readFileSync(path.join(contractRoot, "fixtures/valid-network-package.json"), "utf8"));
const invalid = JSON.parse(fs.readFileSync(path.join(contractRoot, "fixtures/invalid-network-package.json"), "utf8"));
const mapping = JSON.parse(fs.readFileSync(path.join(contractRoot, "excel-mapping-3.1.5.json"), "utf8"));
const rules = JSON.parse(fs.readFileSync(path.join(root, "rules/database.rules.proposal.json"), "utf8"));
const emulatorContract = JSON.parse(fs.readFileSync(path.join(root, "emulator-contract.json"), "utf8"));

test("environment guard accepts only demo project with RTDB emulator", function () {
  assert.deepEqual(
    guard.assertDemoDatabaseEmulator({ projectId: "demo-sl-transit-erp", databaseEmulatorHost: "127.0.0.1:9000" }),
    { projectId: "demo-sl-transit-erp", databaseEmulatorHost: "127.0.0.1:9000" }
  );
  assert.throws(function () {
    guard.assertDemoDatabaseEmulator({ projectId: "sl-transit-production", databaseEmulatorHost: "127.0.0.1:9000" });
  }, /greenfield_demo_project_required/);
  assert.throws(function () {
    guard.assertDemoDatabaseEmulator({ projectId: "demo-sl-transit-erp", databaseEmulatorHost: "https:\/\/real.example" });
  }, /greenfield_rtdb_emulator_host_invalid/);
  assert.throws(function () {
    guard.assertDemoDatabaseEmulator({ projectId: "demo-sl-transit-erp" });
  }, /greenfield_rtdb_emulator_required/);
});

test("Excel row mapper ignores formula-only blank rows and reports required cells", function () {
  const sheetName = Object.keys(mapping.sheets).find(function (name) {
    return name.startsWith("03_");
  });
  const sheet = mapping.sheets[sheetName];
  const complete = {};
  sheet.fields.forEach(function (field) {
    if (!field.required) return;
    if (field.targetType === "integer") complete[field.sourceColumn] = 1;
    else if (field.targetType === "number" || field.targetType === "money-major") complete[field.sourceColumn] = 1.5;
    else if (field.targetType === "date") complete[field.sourceColumn] = "2026-01-01";
    else if (field.targetType === "service-time") complete[field.sourceColumn] = "09:00:00";
    else if (field.targetType === "date-time") complete[field.sourceColumn] = "2026-01-01T00:00:00Z";
    else complete[field.sourceColumn] = "TEST";
  });
  const result = mapper.mapSheetRows({ mapping, sheetName, rows: [complete, {}] });
  assert.equal(result.records.length, 1);
  assert.equal(result.errors.length, 0);

  const requiredField = sheet.fields.find(function (field) { return field.required; });
  const incomplete = Object.assign({}, complete);
  delete incomplete[requiredField.sourceColumn];
  const failed = mapper.mapSheetRows({ mapping, sheetName, rows: [incomplete] });
  assert.ok(failed.errors.some(function (error) {
    return error.code === "excel.required" && error.sourceColumn === requiredField.sourceColumn;
  }));
});

test("invalid package never reaches draft store", async function () {
  let writes = 0;
  const store = {
    async findExistingDraft() { return null; },
    async saveValidatedDraft() { writes += 1; }
  };
  const result = await draftService.createValidatedDraft({
    package: invalid,
    actorUid: "owner-test",
    store,
    now: function () { return "2026-08-10T00:00:00.000Z"; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "validation_failed");
  assert.equal(writes, 0);
});

test("valid draft is deterministic and idempotent", async function () {
  let saved = null;
  const store = {
    async findExistingDraft() {
      return saved ? { draftId: saved.draftId, packageId: saved.package.metadata.packageId } : null;
    },
    async saveValidatedDraft(input) { saved = input; }
  };
  const first = await draftService.createValidatedDraft({
    package: valid,
    actorUid: "owner-test",
    store,
    now: function () { return "2026-08-10T00:00:00.000Z"; }
  });
  const second = await draftService.createValidatedDraft({
    package: valid,
    actorUid: "owner-test",
    store,
    now: function () { return "2026-08-10T00:01:00.000Z"; }
  });
  assert.equal(first.ok, true);
  assert.equal(first.reused, false);
  assert.match(first.draftId, /^DRF-[A-F0-9]{24}$/);
  assert.equal(second.reused, true);
  assert.equal(second.draftId, first.draftId);
});

test("RTDB adapter writes only locked emulator namespace and finalizes after chunks", async function () {
  const calls = [];
  const values = new Map();
  const database = {
    ref(refPath) {
      return {
        async get() {
          const value = values.get(refPath);
          return { exists: function () { return value !== undefined; }, val: function () { return value; } };
        },
        async set(value) {
          calls.push({ method: "set", path: refPath, value });
          values.set(refPath, value);
        },
        async update(updates) {
          calls.push({ method: "update", path: refPath, updates });
        }
      };
    }
  };
  const store = rtdbStore.createRtdbEmulatorDraftStore({
    database,
    projectId: "demo-sl-transit-erp",
    databaseEmulatorHost: "127.0.0.1:9000"
  });
  await store.saveValidatedDraft({
    draftId: "DRF-ABCDEF0123456789ABCDEF01",
    package: valid,
    actorUid: "owner-test",
    createdAt: "2026-08-10T00:00:00.000Z",
    idempotencyHash: "a".repeat(64),
    packageBytes: draftService.packageSizeBytes(valid),
    entityCount: draftService.entityCount(valid)
  });
  assert.ok(calls.length >= 3);
  assert.ok(calls.every(function (call) { return call.path.startsWith("data/erpDataCenter"); }));
  assert.equal(calls[0].method, "set");
  assert.equal(calls[0].value.status, "writing");
  const final = calls[calls.length - 1];
  assert.equal(final.method, "update");
  assert.equal(
    final.updates["authoring/drafts/DRF-ABCDEF0123456789ABCDEF01/metadata/status"],
    "draft"
  );
  const serialized = JSON.stringify(calls);
  assert.equal(serialized.includes("publishedReadModels"), false);
});

test("proposal rules and limits are deny-by-default and aligned", function () {
  assert.equal(rules.rules[".read"], false);
  assert.equal(rules.rules[".write"], false);
  assert.equal(rules.rules.data.erpDataCenter[".write"], false);
  assert.equal(emulatorContract.lockedBasePath, "data/erpDataCenter");
  assert.equal(emulatorContract.limits.maxImportPackageBytes, draftService.MAX_IMPORT_PACKAGE_BYTES);
  assert.equal(emulatorContract.limits.maxEntityRecords, draftService.MAX_ENTITY_RECORDS);
  assert.equal(emulatorContract.limits.maxChunkBytes, validator.INTERNAL_CHUNK_BYTES);
  assert.equal(emulatorContract.limits.maxChunkLeafPaths, validator.INTERNAL_CHUNK_PATHS);
});

test("Phase 2 JavaScript has no Firebase initialization or deployment command", function () {
  const files = [
    "environment-guard.js",
    "excel-row-mapper.js",
    "draft-service.js",
    "rtdb-emulator-draft-store.js"
  ];
  files.forEach(function (file) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(source.includes("initializeApp"), false);
    assert.equal(source.includes("firebase deploy"), false);
    assert.equal(source.includes("credential.cert"), false);
  });
});