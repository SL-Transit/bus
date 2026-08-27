const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Admin ERP1 เป็นหน้า Greenfield ที่โหลดเฉพาะโมดูลชุดใหม่', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /SL-Transit · Greenfield Admin ERP1/);
  assert.match(page, /admin-erp1-greenfield-state\.js/);
  assert.match(page, /admin-erp1-greenfield-api-client\.js/);
  assert.match(page, /admin-erp1-greenfield-system-mode\.js/);
  assert.match(page, /admin-erp1-greenfield-controller\.js/);
  assert.match(page, /assets\/admin-erp1-greenfield\.css/);
  assert.doesNotMatch(page, /admin-erp1-integration\.js|admin-erp1-network-integration\.js/);
  assert.doesNotMatch(page, /firebase-(?:app|auth|database)|gstatic\.com/i);
});

test('หน้า Greenfield มี CSP และขอบเขต Preview ชัดเจน', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /default-src 'self'/);
  assert.match(page, /Phase 6A\.1 · Draft editor \+ async revalidation · No production writes/);
  assert.match(page, /id="overview"/);
  assert.match(page, /id="import"/);
  assert.match(page, /id="draft"/);
  assert.match(page, /id="validation"/);
  assert.match(page, /id="review"/);
  assert.match(page, /id="approval"/);
});

test('หน้า Phase 3 ไม่มีปุ่มหรือคำสั่งเผยแพร่', () => {
  const page = read('admin-erp1.html');
  assert.doesNotMatch(page, /<button[^>]+(?:id|data-command)="[^"]*publish/i);
  assert.doesNotMatch(page, /publishedReadModels\/current|erpDataCenter\/publication/);
});