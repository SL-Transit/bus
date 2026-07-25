const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

const requiredPages = [
  'dashboard',
  'workbook',
  'upload',
  'validation',
  'preview',
  'diff',
  'publish',
  'stops',
  'routes',
  'fares',
  'timetable',
  'queue',
  'vehicle',
  'driver',
  'policy',
  'announcements',
  'published',
  'centers',
  'roles',
  'audit',
];

for (const page of requiredPages) {
  assert.ok(html.includes(`data-page="${page}"`), `missing nav page ${page}`);
}

const downloadIds = Array.from(html.matchAll(/id="(download[A-Za-z0-9]+)"/g)).map((m) => m[1]);
assert.ok(downloadIds.length >= 20, 'expected backoffice export buttons');

for (const id of new Set(downloadIds)) {
  assert.ok(html.includes(`function ${id}(`), `missing function for ${id}`);
  assert.ok(html.includes(`${id};`), `missing bind handler for ${id}`);
}

const forbiddenControls = [
  'saveToFirebase',
  'applyPublish',
  'seedData',
  'deployRules',
  'productionApply',
  'assignDriver',
  'assignVehicle',
  'sendLine',
  'fakeGps',
  'fakeEta',
];

for (const control of forbiddenControls) {
  assert.ok(!html.includes(`id="${control}"`), `forbidden control ${control}`);
}

assert.ok(html.includes('Operations Control Panel'));
assert.ok(html.includes('Backoffice / Admin Console'));
assert.ok(html.includes('Excel -> Draft -> Review -> Publish'));

console.log('admin-erp ui contract ok');
