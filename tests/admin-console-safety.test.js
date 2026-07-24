const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-console.html'), 'utf8');

assert.ok(html.includes("projectId: 'sl-transit-9464e'"));
assert.ok(html.includes("databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app'"));
assert.ok(html.includes("var PUBLISHED_SCHEDULE_PATH = 'preview/publishedSchedule';"));
assert.ok(html.includes('bus-booking-1d68c not used'));
assert.ok(!/projectId:\s*['"]bus-booking-1d68c['"]/.test(html));
assert.ok(!/\.ref\([^)]*\)\.(set|update|push|remove)\s*\(/.test(html));
assert.ok(html.includes('ERP_SOURCE_REGISTRY'));
assert.ok(html.includes('erp-data-adapter.js'));
assert.ok(html.includes('erp-engine.js'));
assert.ok(html.includes('erp-calculator-center.js'));
assert.ok(html.includes('erp-alert-center.js'));
assert.ok(html.includes('map-display-center.js'));
assert.ok(html.includes('erp-admin-master-data.js'));
assert.ok(html.includes('localEdits'));

console.log('admin-console safety ok');
