const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const legacyAdmin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const compatibilityAdmin = fs.readFileSync(path.join(__dirname, '..', 'admin-console.html'), 'utf8');

assert.ok(html.includes("projectId: 'sl-transit-9464e'"));
assert.ok(html.includes("databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app'"));
assert.ok(html.includes("var PUBLISHED_SCHEDULE_PATH = 'preview/publishedSchedule';"));
assert.ok(html.includes('bus-booking-1d68c not used'));
assert.ok(!/projectId:\s*['"]bus-booking-1d68c['"]/.test(html));
assert.ok(!/\.ref\([^)]*\)\.(set|update|push|remove)\s*\(/.test(html));
assert.ok(!/\.ref\([^)]*routeData[^)]*\)\.(set|update|push|remove)\s*\(/.test(html));
assert.ok(!/\.ref\([^)]*settings\/routes[^)]*\)\.(set|update|push|remove)\s*\(/.test(html));
assert.ok(!/\.ref\([^)]*routes[^)]*\)\.(set|update|push|remove)\s*\(/.test(html));
assert.ok(html.includes('ERP_SOURCE_REGISTRY'));
assert.ok(html.includes('erp-data-adapter.js'));
assert.ok(html.includes('erp-engine.js'));
assert.ok(html.includes('erp-calculator-center.js'));
assert.ok(html.includes('erp-alert-center.js'));
assert.ok(html.includes('map-display-center.js'));
assert.ok(html.includes('erp-admin-master-data.js'));
assert.ok(html.includes('localEdits'));
assert.ok(html.includes("primaryFile: 'admin-erp.html'"));
assert.ok(html.includes("legacyFile: 'admin.html'"));
assert.ok(html.includes('FLOW_STEPS'));
assert.ok(html.includes('Excel'));
assert.ok(html.includes('Draft'));
assert.ok(html.includes('Review'));
assert.ok(html.includes('Publish'));
assert.ok(legacyAdmin.includes('url=admin-erp.html'));
assert.ok(compatibilityAdmin.includes('url=admin-erp.html'));

console.log('admin-erp safety ok');
