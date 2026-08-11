"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const files = [
  "ai-handoffs/WORK-BOARD.md",
  "docs/greenfield-erp/PHASE6-INTEGRATION-SCOPE.md",
  "greenfield-erp/phase6a/README.md",
  "tests/greenfield-erp-phase6a-emulator.integration.js",
  "tests/greenfield-erp-phase6a.test.js"
];

test("Greenfield coordination and Phase 6A evidence preserve Thai UTF-8", () => {
  for (const relativePath of files) {
    const content = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    assert.match(content, /[ก-๙]/, relativePath + " must contain Thai UTF-8 text");
    assert.doesNotMatch(content, /\?{3,}/, relativePath + " must not contain replacement question-mark runs");
  }
});