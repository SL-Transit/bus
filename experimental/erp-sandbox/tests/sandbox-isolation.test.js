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
  assert.match(projects.default, /^demo-/);
});

test("sandbox has no deploy surface", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(Object.keys(packageJson.scripts).some((name) => /deploy/i.test(name)), false);
  assert.equal(fs.existsSync(path.join(root, ".github", "workflows")), false);
  const firebase = JSON.parse(read("firebase.json"));
  assert.equal(Object.prototype.hasOwnProperty.call(firebase, "hosting"), false);
});

test("Admin stays disconnected and localhost-only by default", () => {
  const html = read("admin-erp1.html");
  assert.match(html, /connect-src 'self' http://127.0.0.1:* http://localhost:*/);
  assert.doesNotMatch(html, /admin-erp1-(?:integration|network-integration).js/);
  assert.doesNotMatch(html, /SLTransitGreenfieldRuntimeConfigs*=/);
});

test("runtime copy contains no known Production endpoint", () => {
  const forbidden = ["sl-transit-9464e", "cloudfunctions.net", "publishedSchedule"];
  for (const file of runtimeFiles()) {
    if (!/.(?:js|json|html|rules)$/.test(file) && !file.endsWith(".env.demo-sl-transit-greenfield")) continue;
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
  assert.equal(paths.some((name) => /.(?:xlsx|xls)$/i.test(name)), false);
  assert.equal(paths.some((name) => /service-account|firebase-adminsdk/i.test(name)), false);
});