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

const controllerHooks = [
  "import-file", "file-name", "file-size", "excel-version", "excel-precheck", "operator-scope",
  "validate-file", "reset-workflow", "workflow-phase", "backend-status", "job-id", "error-code",
  "action-notice", "workflow-status", "draft-entity-type", "load-draft-page", "next-draft-page",
  "draft-entity-list", "draft-entity-id", "draft-json", "draft-change-summary", "save-draft-entity",
  "delete-draft-entity", "validate-draft", "validation-job-id", "validation-result", "request-review",
  "approval-comment", "approve-draft", "reject-draft"
];

function indexOfScript(src) {
  return html.indexOf(`src="${src}"`);
}

test("Admin ERP1 remains one classic entry on the current runtime", () => {
  assert.match(html, /<title>SL-Transit · Admin ERP1<\/title>/);
  assert.match(html, /CLASSIC UI · GREENFIELD RUNTIME/);
  assert.match(html, /href="assets\/admin-erp1-greenfield\.css"/);
  assert.match(html, /href="admin-erp-ui\.css"/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle="/i);

  const ordered = [
    "admin-erp1-greenfield-state.js",
    "admin-erp1-greenfield-api-client.js",
    "admin-erp1-greenfield-system-mode.js",
    "assets/vendor/xlsx.full.min.js",
    "greenfield-erp/phase2/excel-row-mapper.js",
    "admin-erp1-excel-3-3-x.js",
    "admin-erp1-greenfield-controller.js",
    "admin-erp1-ui.js"
  ];
  ordered.forEach((src) => assert.notEqual(indexOfScript(src), -1, `${src} must be loaded`));
  ordered.slice(1).forEach((src, index) => assert.ok(indexOfScript(ordered[index]) < indexOfScript(src), `${ordered[index]} must load before ${src}`));
});

test("classic information architecture has four groups and familiar work areas", () => {
  assert.equal((html.match(/class="nav-group"/g) || []).length, 4);
  ["ภาพรวม", "งานบริการ", "ข้อมูลกลาง", "ดูแลระบบ"].forEach((label) => assert.match(html, new RegExp(label)));
  [
    "คิวรถและตารางเวลา", "ความจุและการเปิดขาย", "รายได้ การจอง และการยกเลิก",
    "ข่าวสารและประกาศ", "ศูนย์ข้อมูล ERP", "ผู้ใช้งานและสิทธิ์", "ศูนย์ทดสอบ",
    "สถานะระบบและ Audit", "บัญชีของฉัน"
  ].forEach((label) => assert.match(html, new RegExp(label)));
  assert.match(html, /id="profile-menu-button"[^>]+aria-haspopup="menu"/);
  assert.match(html, /data-ui-action="logout"/);
});

test("all real controller DOM hooks are composed without duplicate IDs", () => {
  controllerHooks.forEach((id) => assert.match(html, new RegExp(`\\bid="${id}"`), `missing controller hook #${id}`));
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
  assert.match(controllerSource, /elements\.review\.disabled = !view\.canRequestReview/);
  assert.match(controllerSource, /elements\.approve\.disabled = !view\.canApprove/);
});

test("unsupported work areas are visible, explicit and locked", () => {
  ["today", "operations", "bookings", "finance", "content", "published", "users", "test-center", "system-status", "account"].forEach((view) => {
    assert.match(html, new RegExp(`data-ui-view="${view}"`), `missing locked workspace ${view}`);
  });
  assert.ok((html.match(/class="locked-badge"/g) || []).length >= 10);
  assert.match(html, /ไม่แสดงรายการหรือตัวเลขจำลอง/);
  assert.match(html, /ไม่จำลองว่าออกจากระบบสำเร็จ/);
  assert.doesNotMatch(html, /<tbody\b/i);
  assert.doesNotMatch(html, /value="OPR-BUS01"/);
});

test("Test Center and Published Versions are separate locked routes", () => {
  assert.notEqual(ui.ROUTES.published.view, ui.ROUTES["test-center"].view);
  assert.equal(ui.parseHash("#published").route, "published");
  assert.equal(ui.parseHash("#test-center").route, "test-center");
  assert.match(html, /data-ui-route="published"/);
  assert.match(html, /data-ui-route="test-center"/);
  assert.match(html, /id="published-workspace"/);
  assert.match(html, /id="test-center-workspace"/);
});

test("hash routing is allowlisted and supports browser back-forward", () => {
  assert.deepEqual(ui.parseHash("#dashboard"), { route: "dashboard", target: null });
  assert.deepEqual(ui.parseHash("#/data-center/import"), { route: "data-center", target: "import" });
  assert.deepEqual(ui.parseHash("#data-center/not-a-hook"), { route: "data-center", target: null });
  assert.deepEqual(ui.parseHash("#unknown/approval"), { route: "dashboard", target: null });
  assert.equal(ui.routeHash("data-center", "validation"), "#data-center/validation");
  assert.equal(ui.routeHash("not-allowed", "import"), "#dashboard");
  assert.match(uiSource, /addEventListener\("hashchange"/);
  assert.match(uiSource, /win\.location\.hash = next/);
});

test("UI module is presentation-only and cannot bypass command boundaries", () => {
  assert.doesNotMatch(uiSource, /\bfetch\s*\(/);
  assert.doesNotMatch(uiSource, /XMLHttpRequest/);
  assert.doesNotMatch(uiSource, /firebase|databaseURL|\.ref\s*\(|\bgetDatabase\s*\(/i);
  assert.doesNotMatch(uiSource, /localStorage|sessionStorage|indexedDB|innerHTML/i);
  assert.doesNotMatch(uiSource, /\/api\//);
  assert.match(uiSource, /textContent/);
  assert.match(uiSource, /MutationObserver/);
});

test("browser entry excludes old runtime, direct data access and publish commands", () => {
  assert.doesNotMatch(html, /gstatic\.com|firebase-(?:app|auth|database)|cdn\.jsdelivr\.net/i);
  assert.doesNotMatch(html, /admin-erp-(?:data-adapter|read-model|draft-adapter|excel-import-controller)/);
  assert.doesNotMatch(html, /admin-erp1-(?:integration|network-integration)\.js/);
  assert.doesNotMatch(html, /system-test-mode\.js/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(html, /<button[^>]+(?:id|data-command)="[^"]*(?:publish|publication)/i);
  assert.doesNotMatch(html, /publishedReadModels\/current|erpDataCenter\/publication/);
  assert.match(html, /Publish<\/strong><small>LOCKED/);
});

test("dashboard mirrors only real contract status", () => {
  ["dashboard-backend", "dashboard-phase", "dashboard-validation"].forEach((id) => assert.match(html, new RegExp(`\\bid="${id}"`)));
  assert.match(uiSource, /\["backend-status", "dashboard-backend"\]/);
  assert.match(uiSource, /\["workflow-phase", "dashboard-phase"\]/);
  assert.match(uiSource, /\["validation-result", "dashboard-validation"\]/);
  assert.doesNotMatch(html, /(?:ยอดขาย|จำนวนผู้โดยสาร|จำนวนการจอง)[^<]*\d+/);
});

test("responsive and accessibility contracts are present", () => {
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /id="sidebar-toggle"[^>]+aria-controls="admin-sidebar"[^>]+aria-expanded="false"/);
  assert.match(html, /id="ui-live-region"[^>]+aria-live="polite"/);
  assert.match(html, /id="context-drawer"[^>]+aria-modal="true"[^>]+role="dialog"/);
  assert.match(uiSource, /aria-current/);
  assert.match(uiSource, /event\.key !== "Escape"/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-width: 320px/);
});