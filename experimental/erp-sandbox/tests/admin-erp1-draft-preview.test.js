"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const preview = require(path.join(root, "admin-erp1-greenfield-draft-preview.js"));
const valid = JSON.parse(fs.readFileSync(path.join(root, "contracts/greenfield-erp/v1/fixtures/valid-network-package.json"), "utf8"));
const invalid = JSON.parse(fs.readFileSync(path.join(root, "contracts/greenfield-erp/v1/fixtures/invalid-network-package.json"), "utf8"));

test("validated canonical package creates a deterministic memory-only Draft review", function () {
  const pkg = JSON.parse(JSON.stringify(valid));
  pkg.operationalRecords = {
    accounts: [{ userId: "USR-PRIVATE", loginEmail: "private@example.test" }],
    drivers: [{ driverId: "DRV-PRIVATE", displayNameTh: "ข้อมูลส่วนตัว" }]
  };
  const result = preview.createDraftReview({
    package: pkg,
    mappingVersion: "excel-3.3.5-to-greenfield-erp-v1-hybrid-transfer-1"
  });
  assert.equal(result.ok, true);
  assert.match(result.draft.draftId, /^DRF-[A-F0-9]{24}$/);
  assert.equal(result.draft.validationStatus, "valid");
  const review = preview.publicReview(result.draft);
  assert.equal(review.storageMode, "memory_only");
  assert.equal(review.operationalRecordsExcluded, true);
  assert.equal(review.summary.transferRules, 1);
  assert.equal(JSON.stringify(review).includes("private@example.test"), false);
  assert.equal(JSON.stringify(review).includes("ข้อมูลส่วนตัว"), false);
});

test("invalid canonical package never creates a Draft", function () {
  const result = preview.createDraftReview({ package: invalid, mappingVersion: "canonical-json" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "validation_failed");
  assert.ok(result.errors.length > 0);
  assert.equal("draft" in result, false);
});

test("preview pages expose network data only and redact operational records", function () {
  const result = preview.createDraftReview({ package: valid, mappingVersion: "canonical-json" });
  const routes = preview.readPage(result.draft, { entityType: "routes", limit: 25 });
  assert.equal(routes.redacted, false);
  assert.equal(routes.entries.length, 2);
  const accounts = preview.readPage(result.draft, { entityType: "accounts", limit: 25 });
  assert.equal(accounts.redacted, true);
  assert.deepEqual(accounts.entries, []);
});

test("only a currently valid preview Draft can enter Review", function () {
  const result = preview.createDraftReview({ package: valid, mappingVersion: "canonical-json" });
  const review = preview.requestReview(result.draft);
  assert.equal(review.status, "review_requested");
  assert.equal(preview.publicReview(result.draft).status, "review_requested");
  result.draft.validationStatus = "required";
  assert.throws(function () { preview.requestReview(result.draft); }, /review_blocked/);
});