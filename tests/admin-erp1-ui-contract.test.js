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

function openingTags(source, name) {
  return Array.from(source.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi")), (match) => match[0]);
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

test("classic information architecture stays familiar but concise", () => {
  assert.equal((html.match(/class="nav-group"/g) || []).length, 4);
  ["ภาพรวม", "งานบริการ", "ข้อมูลกลาง", "ดูแลระบบ"].forEach((label) => assert.match(html, new RegExp(label)));
  ["คิวรถและตาราง", "การจอง", "การเงิน", "ข่าวสาร", "ศูนย์ข้อมูล ERP", "ผู้ใช้งาน", "ศูนย์ทดสอบ", "บัญชีของฉัน"].forEach((label) => assert.match(html, new RegExp(label)));
  assert.match(html, /id="profile-menu-button"[^>]+aria-label="เปิดเมนูบัญชี"[^>]+aria-haspopup="menu"/);
  assert.match(html, /data-ui-action="logout"/);
});

test("custom embedded SVG sprite provides a coherent icon system", () => {
  assert.match(html, /<svg id="admin-icon-sprite"[^>]+aria-hidden="true"/);
  const symbols = Array.from(html.matchAll(/<symbol id="(icon-[^"]+)"[\s\S]*?<\/symbol>/g));
  assert.ok(symbols.length >= 22, "expected complete embedded icon set");
  ["menu", "search", "chevron", "close", "upload", "dashboard", "tasks", "operations", "booking", "finance", "news", "database", "draft", "validation", "published", "users", "test", "audit", "account", "lock", "info", "help"].forEach((name) => assert.match(html, new RegExp(`id="icon-${name}"`)));
  symbols.forEach((match) => {
    assert.match(match[0], /viewBox="0 0 24 24"/);
    assert.match(match[0], /stroke="currentColor"/);
    assert.match(match[0], /stroke-width="1\.8"/);
    assert.match(match[0], /stroke-linecap="round"/);
    assert.match(match[0], /stroke-linejoin="round"/);
  });
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /font-awesome|material-icons|bootstrap-icons|unpkg\.com|fonts\.googleapis/i);
});

test("every primary navigation item uses SVG and legacy icon text is gone", () => {
  const navigation = html.match(/<nav id="primary-navigation"[\s\S]*?<\/nav>/);
  assert.ok(navigation, "primary navigation must exist");
  const buttons = Array.from(navigation[0].matchAll(/<button\b[\s\S]*?<\/button>/g), (match) => match[0]);
  assert.ok(buttons.length >= 10);
  buttons.forEach((button) => {
    assert.match(button, /<svg\b[^>]+aria-hidden="true"[^>]*>[\s\S]*?<use href="#icon-/);
    assert.match(button, /<span>[^<]+<\/span>/);
  });
  assert.doesNotMatch(html, /[☰⌕⌄×↑]/u);
  assert.doesNotMatch(html, /<span[^>]+class="(?:nav-icon|brand-mark|profile-avatar)"[^>]*>[^<]*<\/span>/i);
  assert.doesNotMatch(html, /<(?:span|i)[^>]*>\s*(?:OV|TD|OP|BK|FN|NW|DC|IM|DR|RV|PV|US|TS|ST)\s*<\/(?:span|i)>/i);
});

test("all real controller DOM hooks are composed without duplicate IDs", () => {
  assert.equal(controllerHooks.length, 30);
  controllerHooks.forEach((id) => assert.match(html, new RegExp(`\\bid="${id}"`), `missing controller hook #${id}`));
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
  assert.match(controllerSource, /elements\.review\.disabled = !view\.canRequestReview/);
  assert.match(controllerSource, /elements\.approve\.disabled = !view\.canApprove/);
});

test("unsupported work areas remain visible, concise and locked", () => {
  ["today", "operations", "bookings", "finance", "content", "published", "users", "test-center", "system-status", "account"].forEach((view) => {
    assert.match(html, new RegExp(`data-ui-view="${view}"`), `missing locked workspace ${view}`);
  });
  assert.equal((html.match(/class="workspace locked-workspace"/g) || []).length, 10);
  assert.equal((html.match(/class="button secondary detail-button"/g) || []).length, 10);
  assert.match(html, /ไม่แสดงรายการหรือตัวเลขจำลอง/);
  assert.match(html, /ไม่จำลองว่าออกจากระบบสำเร็จ/);
  assert.doesNotMatch(html, /<tbody\b/i);
  assert.doesNotMatch(html, /value="OPR-BUS01"/);
});

test("Data Center uses accessible focused tabs while preserving safe workflow", () => {
  assert.match(html, /class="workflow-tabs" role="tablist"/);
  ["import", "draft", "validation", "review", "approval"].forEach((target) => {
    assert.match(html, new RegExp(`data-data-tab="${target}" role="tab" aria-controls="${target}"`));
    assert.match(html, new RegExp(`(?:id="${target}"[^>]*data-data-panel="${target}"|data-data-panel="${target}"[^>]*id="${target}")`));
  });
  assert.match(uiSource, /function updateDataPanels\(state\)/);
  assert.match(uiSource, /aria-selected/);
  assert.match(uiSource, /panel\.hidden/);
  assert.match(html, /id="publication-lock"/);
  assert.match(html, /<use href="#icon-lock"><\/use>[\s\S]*<span>เผยแพร่<\/span>/);
  assert.doesNotMatch(html, /<button[^>]+(?:id|data-command)="[^"]*(?:publish|publication)/i);
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
  assert.doesNotMatch(html, /publishedReadModels\/current|erpDataCenter\/publication/);
  assert.match(html, /id="publication-lock"[^>]*>[\s\S]*?icon-lock[\s\S]*?ยังไม่เปิดใช้งาน/);
});

test("dashboard has only three real status cards, one safe state and three actions", () => {
  ["dashboard-backend", "dashboard-phase", "dashboard-validation"].forEach((id) => assert.match(html, new RegExp(`\\bid="${id}"`)));
  assert.equal((html.match(/class="status-tile"/g) || []).length, 3);
  assert.equal((html.match(/class="safe-mode-indicator(?:\s[^"]*)?"/g) || []).length, 2, "dashboard and Data Center each show one concise safe-state indicator");
  const quick = html.match(/<div class="quick-work-list">[\s\S]*?<\/div>/);
  assert.ok(quick);
  assert.equal((quick[0].match(/<button\b/g) || []).length, 3);
  assert.match(uiSource, /\["backend-status", "dashboard-backend"\]/);
  assert.match(uiSource, /\["workflow-phase", "dashboard-phase"\]/);
  assert.match(uiSource, /\["validation-result", "dashboard-validation"\]/);
  assert.doesNotMatch(html, /(?:ยอดขาย|จำนวนผู้โดยสาร|จำนวนการจอง)[^<]*\d+/);
});

test("responsive and accessibility contracts are present", () => {
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /id="sidebar-toggle"[^>]+aria-label="เปิดเมนูระบบ"[^>]+aria-controls="admin-sidebar"[^>]+aria-expanded="false"/);
  assert.match(html, /id="ui-live-region"[^>]+aria-live="polite"/);
  assert.match(html, /id="context-drawer"[^>]+aria-modal="true"[^>]+role="dialog"/);
  openingTags(html, "svg").forEach((tag) => assert.match(tag, /aria-hidden="true"/, `decorative icon must be hidden: ${tag}`));
  openingTags(html, "button").filter((tag) => /class="[^"]*icon-button/.test(tag)).forEach((tag) => assert.match(tag, /aria-label="[^"]+"/, `icon-only button needs Thai aria-label: ${tag}`));
  assert.match(uiSource, /aria-current/);
  assert.match(uiSource, /event\.key !== "Escape"/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-width: 320px/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/);
});