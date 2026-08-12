"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function runtimeFiles() {
  const roots = [
    "greenfield-erp",
    "admin-erp1.html",
    "admin-erp1-greenfield-api-client.js",
    "admin-erp1-greenfield-controller.js",
    "admin-erp1-greenfield-state.js",
    "admin-erp1-greenfield-system-mode.js"
  ];
  const files = [];
  function visit(target) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) {
        if (name === "node_modules" || name === ".firebase") continue;
        visit(path.join(target, name));
      }
      return;
    }
    files.push(target);
  }
  for (const relativePath of roots) visit(path.join(root, relativePath));
  return files;
}

test("sandbox uses demo Firebase project only", () => {
  const projects = JSON.parse(read(".firebaserc")).projects;
  assert.equal(projects.default, "demo-sl-transit-erp-sandbox");
  assert.equal(projects.default.startsWith("demo-"), true);
});

test("sandbox has no deploy surface", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(
    Object.keys(packageJson.scripts).some((name) => name.toLowerCase().includes("deploy")),
    false
  );
  assert.equal(fs.existsSync(path.join(root, ".github", "workflows")), false);
  const firebase = JSON.parse(read("firebase.json"));
  assert.equal(Object.prototype.hasOwnProperty.call(firebase, "hosting"), false);
});

test("Admin stays disconnected and localhost-only by default", () => {
  const html = read("admin-erp1.html");
  assert.equal(
    html.includes("connect-src 'self' http://127.0.0.1:* http://localhost:*"),
    true
  );
  assert.equal(html.includes("admin-erp1-integration.js"), false);
  assert.equal(html.includes("admin-erp1-network-integration.js"), false);
  assert.equal(html.includes("SLTransitGreenfieldRuntimeConfig ="), false);
});

test("runtime copy contains no known Production endpoint", () => {
  const forbidden = ["sl-transit-9464e", "cloudfunctions.net", "publishedSchedule"];
  const scannedExtensions = new Set([".js", ".json", ".html", ".rules"]);
  for (const file of runtimeFiles()) {
    if (
      !scannedExtensions.has(path.extname(file)) &&
      !file.endsWith(".env.demo-sl-transit-greenfield")
    ) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, path.relative(root, file) + " contains " + token);
    }
  }
});

test("Excel source and credential files are excluded", () => {
  const paths = [];
  function visit(target) {
    for (const name of fs.readdirSync(target)) {
      const fullPath = path.join(target, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) visit(fullPath);
      else paths.push(path.relative(root, fullPath));
    }
  }
  visit(root);
  assert.equal(
    paths.some((name) => [".xlsx", ".xls"].includes(path.extname(name).toLowerCase())),
    false
  );
  assert.equal(
    paths.some((name) => {
      const normalized = name.toLowerCase();
      return normalized.includes("service-account") || normalized.includes("firebase-adminsdk");
    }),
    false
  );
});