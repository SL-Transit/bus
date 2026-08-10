const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('ทางเข้า Admin เดิมยังพาไปยังชื่อหลัก admin-erp1.html', () => {
  assert.match(read('admin.html'), /admin-erp1\.html/);
  assert.match(read('admin-console.html'), /admin-erp1\.html/);
});

test('หน้า Admin ERP1 ประกาศสถานะ Greenfield contract preview', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /GREENFIELD · PREVIEW/);
  assert.match(page, /Backend not connected/);
  assert.match(page, /No production writes/);
  assert.doesNotMatch(page, /system-test-mode\.js/);
});