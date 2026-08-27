const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

assert.ok(html.includes('<script src="admin-erp-data-adapter.js"></script>'));
assert.ok(html.includes('firebase-database-compat.js'));
assert.ok(html.includes('firebase.database()'));
assert.ok(html.includes("data/erpDataCenter/workbookSource/routeFareRows"));
assert.ok(html.includes("data/erpDataCenter/workbookSource/scheduleRows"));
assert.ok(html.includes('function saveErpSchedule'));
assert.ok(html.includes('function enterpriseScheduleEditor'));
assert.ok(html.includes("data/erpDataCenter/meta/audit"));
const directFareWrites = html.match(/database\.ref\([^)]*\)\.(set|update|push|remove)\s*\(/g) || [];
assert.deepStrictEqual(directFareWrites.sort(), [
  "database.ref('data/erpDataCenter/meta/audit').push(",
  "database.ref('data/erpDataCenter/meta/audit').push(",
  'database.ref(path).set(',
  'database.ref(path).set('
].sort(), 'Admin ERP direct writes include audit-first fare, schedule, and queue updates');ssert.ok(html.includes("var ERP_DATA_CENTER_READ_PATH = 'data/erpDataCenter';"));
assert.ok(html.includes('AdminErpDataSource.getDataCenter()'));
assert.ok(html.includes('data/erpDataCenter/workbookSource/scheduleRows'));
assert.ok(html.includes('function buildErpScheduleProjection'));
assert.ok(html.includes('function saveErpDraft()'));
assert.ok(html.includes('AdminErpDataSource.createDraft'));
assert.ok(html.includes('AdminErpDataSource.validateDraft'));

assert.ok(!html.includes('ADMIN_ERP_UPDATE_ENDPOINT'));
assert.ok(!/fetch\s*\(\s*ADMIN_ERP_UPDATE_ENDPOINT/.test(html));
assert.ok(!html.includes('db.ref(PUBLISHED_SCHEDULE_PATH)'));
assert.ok(!html.includes('db.ref(PREVIEW_PUBLISHED_SCHEDULE_PATH)'));

console.log('admin-erp legacy adapter migration: PASS');
