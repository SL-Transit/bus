const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'admin-erp1.html'), 'utf8');
const adminRedirect = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const consoleRedirect = fs.readFileSync(path.join(root, 'admin-console.html'), 'utf8');

assert.ok(page.includes('admin-erp-data-adapter.js'));
assert.ok(page.includes('admin-erp-read-model.js'));
assert.ok(page.includes('admin-erp1-integration.js'));
assert.ok(page.includes('data/erpDataCenter'));
assert.ok(!/firebase\.database|\.ref\s*\(/.test(page));
assert.ok(!page.includes('routeData'));
assert.ok(!page.includes('settings/routes'));
assert.ok(adminRedirect.includes('url=admin-erp1.html'));
assert.ok(adminRedirect.includes('href="admin-erp1.html"'));
assert.ok(consoleRedirect.includes('url=admin-erp1.html'));
assert.ok(consoleRedirect.includes('href="admin-erp1.html"'));

console.log('admin-erp1 live entry: PASS');
