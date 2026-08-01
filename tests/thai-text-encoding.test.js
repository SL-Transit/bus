const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "admin-erp.html",
  "booking-bridge.js",
  "functions/index.js",
  "functions/admin-operational-center.js",
];

const MOJIBAKE_PATTERNS = [
  /\uFFFD/,
  /à¸/i,
  /à¹/i,
  /àº/i,
  /Ã[\x80-\xBF]/,
  /\?{4,}/,
];

for (const file of FILES) {
  const fullPath = path.join(ROOT, file);
  const text = fs.readFileSync(fullPath, "utf8");
  for (const pattern of MOJIBAKE_PATTERNS) {
    assert(
      !pattern.test(text),
      `${file} contains likely broken Thai encoding: ${pattern}`
    );
  }
}

console.log("thai-text-encoding.test.js OK");
