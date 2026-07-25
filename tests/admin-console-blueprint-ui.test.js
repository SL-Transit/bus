const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'admin-erp-ui.css'), 'utf8');

for (const page of [
  'dashboard',
  'workbook',
  'upload',
  'validation',
  'preview',
  'diff',
  'publish',
  'announcements',
  'policy',
  'audit',
]) {
  assert.ok(html.includes(`data-page="${page}"`), `missing blueprint page: ${page}`);
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

for (const token of [
  'dashboard-grid',
  'kpi-grid',
  'kpi-card',
  'donut-box',
  'line-chart',
  'map-card',
  'quick-grid',
  'top-left',
  'searchbox',
  'top-meta',
  'adminSearch',
  'refreshDashboard',
  'function goPage',
  'closest(\'[data-page]\')',
  'recordAudit(\'admin-search\'',
  'recordAudit(\'dashboard-refresh\'',
]) {
  assert.ok(html.includes(token), `missing dashboard layout token: ${token}`);
}

assert.ok(html.includes('<button class="kpi-card" data-page="'));
assert.ok(html.includes('<button class="event-row" data-page="'));
assert.ok(html.includes('id="focusSearch"'));

assert.ok(/[\u0E00-\u0E7F]/.test(html), 'admin console must contain real Thai Unicode text');
assert.ok(html.includes('id="publishApplyDisabled"'));
assert.ok(html.includes('disabled>Publish disabled - waiting for owner approval</button>'));
assert.ok(html.includes('navgroup'));
assert.ok(html.includes('class="workflow"'));
assert.ok(html.includes('class="step"'));
assert.ok(html.includes('document.addEventListener'));
assert.ok(html.includes('@media(max-width:980px)'));
assert.ok(html.includes('@media(max-width:760px)'));
assert.ok(css.includes('@media(max-width:980px)'));
assert.ok(css.includes('.side{position:static;height:auto;display:block}'));
assert.ok(css.includes('.nav{display:flex;gap:6px;overflow-x:auto'));
assert.ok(css.includes('.sheet{min-width:980px}'));
assert.ok(css.includes('@media(max-width:760px)'));
assert.ok(html.includes('DRY-RUN'));
assert.ok(html.includes('NO FIREBASE WRITE'));
assert.ok(html.includes('NOT PRODUCTION APPLY'));

assert.ok(!html.includes('?????'));
assert.equal((html.match(/\u0E40\u0E18/g) || []).length, 0, 'mojibake Thai marker found');
assert.equal((html.match(/\u0E40\u0E19\u20AC/g) || []).length, 0, 'mojibake Thai marker found');

console.log('admin-erp blueprint ui ok');
