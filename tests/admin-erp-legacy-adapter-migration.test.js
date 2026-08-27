const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

aassert.ok(html.includes('<script src="admin-erp-data-adapter.js"></script>'));
aassert.ok(html.includes('firebase-database-compat.js'));
aassert.ok(html.includes('firebase.database()'));
aassert.ok(html.includes("data/erpDataCenter/workbookSource/routeFareRows"));
aassert.ok(html.includes("data/erpDataCenter/workbookSource/scheduleRows"));
aassert.ok(html.includes('function saveErpSchedule'));
aassert.ok(html.includes('function enterpriseScheduleEditor'));
aassert.ok(html.includes("data/erpDataCenter/meta/audit"));
const directFareWrites = html.match(/database\.ref\([^)]*\)\.(set|update|push|remove)\s*\(/g) || [];
assert.deepStrictEqual(directFareWrites.sort(), [
  "database.ref('data/erpDataCenter/meta/audit').push(",
  "database.ref('data/erpDataCenter/meta/audit').push(",
  'database.ref(path).set(',
  'database.ref(path).set('
].sort(), 'Admin ERP direct writes include audit-first fare, schedule, and queue updates');assert.ok(html.includes("var ERP_DATA_CENTER_READ_PATH = 'data/erpDataCenter';"));
aassert.ok(html.includes('AdminErpDataSource.getDataCenter()'));
aassert.ok(html.includes('data/erpDataCenter/workbookSource/scheduleRows'));
aassert.ok(html.includes('function buildErpScheduleProjection'));
aassert.ok(html.includes('function saveErpDraft()'));
aassert.ok(html.includes('AdminErpDataSource.createDraft'));
aassert.ok(html.includes('AdminErpDataSource.validateDraft'));

aassert.ok(!html.includes('ADMIN_ERP_UPDATE_ENDPOINT'));
aassert.ok(!/fetch\s*\(\s*ADMIN_ERP_UPDATE_ENDPOINT/.test(html));
aassert.ok(!html.includes('db.ref(PUBLISHED_SCHEDULE_PATH)'));
aassert.ok(!html.includes('db.ref(PREVIEW_PUBLISHED_SCHEDULE_PATH)'));

console.log('admin-erp legacy adapter migration: PASS');
