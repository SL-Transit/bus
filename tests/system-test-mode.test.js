const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('ทุกหน้าหลักโหลดตัวประกาศโหมดที่ตรงกับขอบเขตระบบ', () => {
  const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const expected = page === 'admin-erp1.html' ? /admin-erp1-greenfield-system-mode\.js/ : /system-test-mode\.js/;
    assert.match(read(page), expected, `${page} ต้องโหลดตัวประกาศโหมดที่ตรงกับขอบเขต`);
  }
});

test('Admin ERP1 Greenfield ใช้โหมด Preview แบบไม่เปิดสิทธิ์เขียน', () => {
  const source = read('admin-erp1-greenfield-system-mode.js');
  assert.match(source, /phase6a-integration-review/);
  assert.match(source, /writesEnabled: false/);
  assert.match(source, /textContent/);
});

test('โหมดทดสอบระบบเดิมมีการแจ้งเตือนและไม่แทรกข้อความเป็นโค้ดหน้าเว็บ', () => {
  const source = read('system-test-mode.js');
  assert.match(source, /slTransitSystemTestOverlay/);
  assert.match(source, /textContent/);
  assert.match(source, /readSystemTestModeStatus/);
});

test('ฐานข้อมูลเปิดให้อ่านเฉพาะธงโหมดทดสอบและยังล็อกการเขียนไว้', () => {
  const rules = JSON.parse(read('database.rules.json'));
  assert.equal(rules.rules.settings['.write'], "auth != null && root.child('data/erpDataCenter/adminAccounts/' + auth.uid).val() === true");
  assert.equal(rules.rules.settings.systemTestMode['.read'], true);
});

test('เซิร์ฟเวอร์หยุดการจองและการส่งแจ้งเตือนเมื่อเปิดโหมดทดสอบ', () => {
  const source = read('functions/index.js');
  assert.match(source, /exports\.readSystemTestModeStatus/);
  assert.match(source, /exports\.updateSystemTestMode/);
  assert.match(source, /system_test_mode_enabled/);
  assert.match(source, /mock_skipped/);
  assert.match(source, /noPaidConnections/);
});

test('หน้าแอดมินระบบเดิมมีปุ่มเปิดปิดโหมดทดสอบ', () => {
  const source = read('admin-erp.html');
  assert.match(source, /SYSTEM_TEST_MODE_ENDPOINT/);
  assert.match(source, /systemTestPanel/);
  assert.match(source, /enableSystemTest/);
  assert.match(source, /disableSystemTest/);
});

test('เส้นทางจองและแผนที่หยุดก่อนเรียกบริการภายนอกในโหมดทดสอบ', () => {
  assert.match(read('booking-bridge.js'), /SYSTEM_TEST_MODE/);
  assert.match(read('booking1-preview-adapter.js'), /SLTransitSystemTestMode/);
  assert.match(read('booking-pos.js'), /SLTransitSystemTestMode/);
  assert.match(read('check_ticket.html'), /requestMapboxRouteGeometry[\s\S]*SYSTEM_TEST_MODE/);
});
