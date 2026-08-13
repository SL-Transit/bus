const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function scriptIndex(page, source) {
  return page.indexOf(`src="${source}"`);
}

test('Admin ERP1 ใช้ classic IA บน Greenfield runtime เท่านั้น', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /SL-Transit · Admin ERP1/);
  assert.match(page, /CLASSIC UI · GREENFIELD RUNTIME/);
  assert.equal((page.match(/class="nav-group"/g) || []).length, 4);
  ['คิวรถและตารางเวลา', 'ความจุและการเปิดขาย', 'ศูนย์ข้อมูล ERP', 'ข่าวสารและประกาศ', 'ผู้ใช้งานและสิทธิ์'].forEach((label) => assert.match(page, new RegExp(label)));

  const runtime = [
    'admin-erp1-greenfield-state.js',
    'admin-erp1-greenfield-api-client.js',
    'admin-erp1-greenfield-system-mode.js',
    'assets/vendor/xlsx.full.min.js',
    'greenfield-erp/phase2/excel-row-mapper.js',
    'admin-erp1-excel-3-3-x.js',
    'admin-erp1-greenfield-controller.js',
    'admin-erp1-ui.js'
  ];
  runtime.forEach((source) => assert.notEqual(scriptIndex(page, source), -1));
  runtime.slice(1).forEach((source, index) => assert.ok(scriptIndex(page, runtime[index]) < scriptIndex(page, source)));
  assert.match(page, /assets\/admin-erp1-greenfield\.css/);
  assert.match(page, /admin-erp-ui\.css/);
  assert.doesNotMatch(page, /admin-erp1-integration\.js|admin-erp1-network-integration\.js/);
  assert.doesNotMatch(page, /firebase-(?:app|auth|database)|gstatic\.com|cdn\.jsdelivr\.net/i);
});

test('หน้า classic มี CSP, Preview boundary และ workflow hooks ปัจจุบัน', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /default-src 'self'/);
  assert.match(page, /Phase 6A\.1 · No production writes/);
  assert.match(page, /Runtime config required/);
  assert.match(page, /id="data-center"/);
  assert.match(page, /id="import"/);
  assert.match(page, /id="draft"/);
  assert.match(page, /id="validation"/);
  assert.match(page, /id="review"/);
  assert.match(page, /id="approval"/);
});

test('Publish เป็น locked step และไม่มี browser command เผยแพร่', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /Publish<\/strong><small>LOCKED/);
  assert.doesNotMatch(page, /<button[^>]+(?:id|data-command)="[^"]*(?:publish|publication)/i);
  assert.doesNotMatch(page, /publishedReadModels\/current|erpDataCenter\/publication/);
});