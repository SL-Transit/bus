const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

const navSource = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>', html.indexOf('<nav class="nav"')));
const navPages = Array.from(navSource.matchAll(/<button[^>]+data-page="([^"]+)"/g)).map((match) => match[1]);
assert.deepStrictEqual(navPages, [
  'dashboard',
  'today',
  'bookings',
  'tickets-refunds',
  'alerts',
  'workbook',
  'announcements',
  'roles',
  'settings',
], 'Admin ERP keeps exactly nine approved primary modules');

for (const requiredShell of [
  'class="side"',
  'id="adminSidebar"',
  'class="drawer-overlay"',
  'id="toggleSidebar"',
  'class="brand-lockup"',
  'class="nav-ico"',
  'body.nav-collapsed',
  'body.nav-open',
  'setMobileDrawer',
  'toggleNavigation',
]) {
  assert.ok(html.includes(requiredShell), `missing navigation shell behavior: ${requiredShell}`);
}

assert.ok(html.includes('data-page="dashboard"'), 'dashboard nav page must exist');
for (const forbiddenId of ['saveToFirebase', 'deployRules', 'productionApply', 'assignDriver', 'assignVehicle', 'sendLine', 'fakeGps', 'fakeEta']) {
  assert.ok(!html.includes(`id="${forbiddenId}"`), `Admin ERP must not expose forbidden control ${forbiddenId}`);
}

assert.ok(html.includes('แดชบอร์ดศูนย์ควบคุม'));
assert.ok(html.includes('ADMIN CONSOLE'));
assert.ok(html.includes('Excel -> Draft -> Review -> Publish'));

console.log('admin-erp ui contract ok');
