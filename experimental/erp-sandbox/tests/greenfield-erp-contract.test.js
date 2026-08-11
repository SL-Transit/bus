"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../contracts/greenfield-erp/v1");
const validator = require(path.join(root, "runtime/validate-network-package.js"));
const valid = JSON.parse(fs.readFileSync(path.join(root, "fixtures/valid-network-package.json"), "utf8"));
const invalid = JSON.parse(fs.readFileSync(path.join(root, "fixtures/invalid-network-package.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/network-package.schema.json"), "utf8"));
const mapping = JSON.parse(fs.readFileSync(path.join(root, "excel-mapping-3.1.5.json"), "utf8"));

test("greenfield valid package passes semantic contract", function () {
  assert.deepEqual(validator.validateNetworkPackage(valid), []);
});

test("greenfield invalid package fails closed", function () {
  const codes = new Set(validator.validateNetworkPackage(invalid).map(function (item) { return item.code; }));
  [
    "metadata.schemaVersion", "metadata.mode", "metadata.checksum", "id.duplicate",
    "foreignKey.route.operator", "pattern.sequence", "fixedTrip.mode",
    "stopTime.rowOrder", "frequency.window", "frequency.headway",
    "foreignKey.fare.product", "foreignKey.transfer.location", "transfer.window"
  ].forEach(function (code) {
    assert.equal(codes.has(code), true, "missing validation error " + code);
  });
});

test("frequency expected wait is half headway", function () {
  assert.equal(validator.expectedWaitSeconds(valid.frequencyServices[0]), 300);
});

test("publish estimator respects byte and path boundaries", function () {
  const records = [
    { id: "A", leafPaths: 3, payload: "1234" },
    { id: "B", leafPaths: 3, payload: "5678" }
  ];
  const chunks = validator.estimateChunks(records, { maxBytes: 1000, maxPaths: 5 });
  assert.equal(chunks.length, 2);
  assert.throws(function () {
    validator.estimateChunks([{ id: "X", leafPaths: 6 }], { maxBytes: 1000, maxPaths: 5 });
  }, /record_exceeds_internal_chunk_limit/);
});

test("schema and Excel mapping versions are locked", function () {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.metadata.$ref, "#/$defs/metadata");
  assert.equal(mapping.mappingVersion, "excel-3.1.5-to-greenfield-erp-v1");
  assert.equal(mapping.templateVersion, "3.1.5");
  assert.equal(mapping.containsUserRows, false);
  assert.ok(Object.keys(mapping.sheets).length >= 26);
});

test("Excel gaps are explicit and formula-only rows are excluded", function () {
  const missing = new Set(mapping.missingSourceSheets.map(function (item) { return item.targetEntity; }));
  assert.equal(missing.has("frequencyService"), true);
  assert.equal(missing.has("fareProduct"), true);
  assert.ok(mapping.transformNotes.some(function (note) { return note.includes("Formula-only"); }));
});