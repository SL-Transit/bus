"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sandboxRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(sandboxRoot, "..", "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "erp-sandbox-hosting-preview.yml");
const configPath = path.join(repoRoot, ".github", "firebase", "erp-sandbox-preview.json");
const manifestPath = path.join(sandboxRoot, "hosting-preview-files.txt");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const expectedFiles = [
  "experimental/erp-sandbox/admin-erp1.html",
  "experimental/erp-sandbox/admin-erp1-greenfield-state.js",
  "experimental/erp-sandbox/admin-erp1-greenfield-api-client.js",
  "experimental/erp-sandbox/admin-erp1-greenfield-system-mode.js",
  "experimental/erp-sandbox/admin-erp1-excel-3-3-x.js",
  "experimental/erp-sandbox/admin-erp1-greenfield-draft-preview.js",
  "experimental/erp-sandbox/admin-erp1-greenfield-controller.js",
  "experimental/erp-sandbox/assets/admin-erp1-greenfield.css",
  "experimental/erp-sandbox/assets/vendor/xlsx.full.min.js",
  "experimental/erp-sandbox/assets/vendor/XLSX-LICENSE.txt",
  "experimental/erp-sandbox/greenfield-erp/phase2/excel-row-mapper.js",
  "experimental/erp-sandbox/contracts/greenfield-erp/v1/runtime/validate-network-package.js",
  "experimental/erp-sandbox/contracts/greenfield-erp/v1/excel-mapping-3.1.5.json",
  "experimental/erp-sandbox/contracts/greenfield-erp/v1/excel-mapping-3.3.4.json",
  "experimental/erp-sandbox/contracts/greenfield-erp/v1/excel-mapping-3.3.5.json"
];

test("Hosting Preview is label-gated to PR 155 and cannot deploy Live", () => {
  const workflow = read(workflowPath);
  assert.match(workflow, /pull_request:\s*\n\s+types: \[labeled\]/);
  assert.match(workflow, /github\.event\.pull_request\.number == 155/);
  assert.match(workflow, /erp-sandbox-preview-approved/);
  assert.match(workflow, /codex\/erp-experimental-sandbox/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == 'SL-Transit\/bus'/);
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /hosting:channel:deploy pr-155/);
  assert.match(workflow, /--expires 7d/);
  assert.doesNotMatch(workflow, /workflow_dispatch|\bpush:\s*\n|firebase\s+deploy\b|hosting:sites:update/);
  assert.doesNotMatch(workflow, /firebaseServiceAccount|service-account.*\.json|secrets\./i);
});

test("Hosting Preview config is static-only and non-cacheable", () => {
  const config = JSON.parse(read(configPath));
  assert.equal(config.hosting.site, "sl-transit-erp-sandbox");
  assert.equal(config.hosting.public, "site");
  assert.equal(path.resolve(path.dirname(configPath), config.hosting.public), path.join(repoRoot, ".github", "firebase", "site"));
  assert.equal(Object.prototype.hasOwnProperty.call(config, "database"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, "functions"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, "storage"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config.hosting, "rewrites"), false);
  const headers = config.hosting.headers[0].headers;
  assert.ok(headers.some((item) => item.key === "Cache-Control" && item.value.includes("no-store")));
  assert.ok(headers.some((item) => item.key === "X-Robots-Tag" && item.value.includes("noindex")));
});

test("Hosting Preview deploys only the reviewed Admin ERP1 allowlist", () => {
  const entries = read(manifestPath).split(/\r?\n/).filter(Boolean);
  assert.deepEqual(entries, expectedFiles);
  assert.equal(new Set(entries).size, entries.length);
  for (const entry of entries) {
    assert.equal(entry.startsWith("experimental/erp-sandbox/"), true, entry);
    assert.equal(fs.existsSync(path.join(repoRoot, entry)), true, entry);
    assert.doesNotMatch(entry, /\.xlsx?$|firebase\.json$|\.rules$|\/functions\/|\/fixtures\/|service-account/i);
  }
});