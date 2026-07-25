const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

for (const label of [
  'ERP Workbook Editor',
  'Upload Excel',
  'Preview / Diff',
  'Publish Center',
  'Announcements / News',
  'Policy / Notification Settings',
  'Audit / Rollback',
]) {
  assert.ok(html.includes(label), `missing blueprint menu label: ${label}`);
}

for (const statusField of [
  'origins',
  'destinations',
  'visiblePairs',
  'scheduleOfferTimes',
  'readyForReview',
  'readyForApply',
  'blockers',
  'warnings',
]) {
  assert.ok(html.includes(statusField), `missing publishedSchedule status field: ${statusField}`);
}

assert.ok(html.includes('publishedSchedule status panel'));
assert.ok(html.includes('id="publishApplyDisabled"'));
assert.ok(html.includes('disabled>Publish disabled - waiting for owner approval</button>'));
assert.ok(html.includes('DRY-RUN'));
assert.ok(html.includes('NO FIREBASE WRITE'));
assert.ok(html.includes('NOT PRODUCTION APPLY'));

assert.ok(!html.includes('?????'));
assert.ok(html.includes('เลือกไฟล์ Excel'));
assert.ok(html.includes('ข้อมูลป้ายต้นทาง'));

console.log('admin-erp blueprint ui ok');
