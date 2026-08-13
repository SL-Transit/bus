"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin-erp1.html"), "utf8");
const css = fs.readFileSync(path.join(root, "admin-erp-ui.css"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "admin-erp1-ui.js"), "utf8");
const controllerSource = fs.readFileSync(path.join(root, "admin-erp1-greenfield-controller.js"), "utf8");
const ui = require(path.join(root, "admin-erp1-ui.js"));

const requiredLegacyHooks = [
  "main-content",
  "overview",
  "import",
  "draft",
  "validation",
  "review",
  "approval",
  "import-file",
  "operator-scope",
  "file-name",
  "file-size",
  "excel-version",
  "excel-precheck",
  "validate-file",
  "reset-workflow",
  "request-review",
  "approve-draft",
  "reject-draft",
  "approval-comment",
  "workflow-phase",
  "workflow-status",
  "action-notice",
  "error-code",
  "job-id",
  "backend-status",
  "draft-entity-type",
  "load-draft-page",
  "next-draft-page",
  "draft-entity-list",
  "draft-entity-id",
  "draft-json",
  "draft-change-summary",
  "save-draft-entity",
  "delete-draft-entity",
  "validate-draft",
  "validation-job-id",
  "validation-result"
];

function scriptIndex(src) {
  return html.indexOf(`src="${src}"`);
}

test("admin-erp1 remains the single modernized entry and preserves script order", () => {
  assert.match(html, /<title>SL-Transit · Greenfield Admin ERP1<\/title>/);
  assert.match(html, /href="admin-erp-ui\.css"/);
  assert.match(html, /src="admin-erp1-ui\.js"/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /<style\b/i);

  const orderedScripts = [
    "admin-erp1-greenfield-state.js",
    "admin-erp1-greenfield-api-client.js",
    "admin-erp1-greenfield-system-mode.js",
    "assets/vendor/xlsx.full.min.js",
    "greenfield-erp/phase2/excel-row-mapper.js",
    "admin-erp1-excel-3-3-x.js",
    "admin-erp1-greenfield-controller.js",
    "admin-erp1-ui.js"
  ];
  orderedScripts.forEach((src) => assert.notEqual(scriptIndex(src), -1, `${src} must remain loaded`));
  orderedScripts.slice(1).forEach((src, index) => {
    assert.ok(scriptIndex(orderedScripts[index]) < scriptIndex(src), `${orderedScripts[index]} must load before ${src}`);
  });
});

test("existing Auth, import, Draft, Validation, Review and Approval DOM hooks remain intact", () => {
  requiredLegacyHooks.forEach((id) => {
    assert.match(html, new RegExp(`\\bid="${id}"`), `missing existing hook #${id}`);
  });
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicateIds, []);
  assert.match(controllerSource, /elements\.review\.disabled = !view\.canRequestReview/);
});

test("information architecture has four human-readable groups and one profile menu", () => {
  assert.equal((html.match(/class="nav-group"/g) || []).length, 4);
  ["ภาพรวม", "งานบริการ", "ข้อมูลกลาง", "ดูแลระบบ"].forEach((label) => assert.match(html, new RegExp(label)));
  assert.match(html, /data-ui-route="publications"/);
  assert.match(html, /data-ui-route="test-center"/);
  assert.match(html, /id="profile-menu-button"[^>]+aria-haspopup="menu"/);
  assert.match(html, /data-ui-action="logout"/);
  assert.match(html, /GREENFIELD · EMULATOR REVIEW/);
  assert.match(html, /No production writes/);
});

test("test center and published version are distinct workspaces", () => {
  assert.notEqual(ui.ROUTES.publications.title, ui.ROUTES["test-center"].title);
  assert.match(ui.ROUTES.publications.description, /อ่านอย่างเดียว/);
  assert.match(ui.ROUTES.publications.description, /ไม่มีปุ่ม Publish/);
  assert.match(ui.ROUTES["test-center"].description, /ไม่สลับ Published pointer/);
  assert.equal(ui.parseHash("#publications").route, "publications");
  assert.equal(ui.parseHash("#test-center").route, "test-center");
});

test("hash routing is allowlisted and supports browser back-forward state", () => {
  assert.deepEqual(ui.parseHash("#dashboard/overview"), { route: "dashboard", target: "overview" });
  assert.deepEqual(ui.parseHash("#/data-center/import"), { route: "data-center", target: "import" });
  assert.deepEqual(ui.parseHash("#data-center/not-a-hook"), { route: "data-center", target: null });
  assert.deepEqual(ui.parseHash("#unknown/approval"), { route: "dashboard", target: null });
  assert.equal(ui.routeHash("data-center", "validation"), "#data-center/validation");
  assert.equal(ui.routeHash("not-allowed", "import"), "#dashboard");
  assert.match(uiSource, /addEventListener\("hashchange"/);
  assert.match(uiSource, /win\.location\.hash = next/);
});

test("UI module cannot bypass bounded backend or add a publish command", () => {
  assert.doesNotMatch(uiSource, /\bfetch\s*\(/);
  assert.doesNotMatch(uiSource, /XMLHttpRequest/);
  assert.doesNotMatch(uiSource, /firebase\.database|\bgetDatabase\s*\(|\bdb\.ref\s*\(|\bsetDoc\s*\(|\bupdateDoc\s*\(/i);
  assert.doesNotMatch(uiSource, /localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(html, /data-(?:ui-route|ui-action)="publish"/i);
  assert.doesNotMatch(html, /publishedReadModels\/current|data\/erpDataCenter\/publication/i);
});

test("dashboard mirrors contract status and never carries fake business totals", () => {
  ["dashboard-backend", "dashboard-phase", "dashboard-validation"].forEach((id) => {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  });
  assert.match(uiSource, /MutationObserver/);
  assert.doesNotMatch(html, /(?:ยอดขาย|จำนวนผู้โดยสาร|จำนวนการจอง)[^<]*\d+/);
  assert.match(html, /ไม่สร้างตัวเลขธุรกิจจำลอง/);
});

test("responsive and accessibility contracts are present", () => {
  assert.match(html, /class="skip-link"[^>]+href="#main-content"/);
  assert.match(html, /id="sidebar-toggle"[^>]+aria-controls="admin-sidebar"[^>]+aria-expanded="false"/);
  assert.match(html, /id="ui-live-region"[^>]+aria-live="polite"/);
  assert.match(html, /id="global-search-status"[^>]+aria-live="polite"/);
  assert.match(uiSource, /aria-current/);
  assert.match(uiSource, /event\.key !== "Escape"/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-width: 320px/);
});