const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');

const artifactMatches = Array.from(
  html.matchAll(/\['(sl-transit-admin-[^']+\.json)','([^']+)','([^']+)'\]/g)
);

assert.ok(artifactMatches.length >= 25, 'expected complete owner review artifact list');

const artifactFiles = artifactMatches.map((match) => match[1]);
assert.strictEqual(new Set(artifactFiles).size, artifactFiles.length, 'review artifacts must be unique');

const requiredArtifacts = [
  'sl-transit-admin-file-audit.json',
  'sl-transit-admin-cutover-plan.json',
  'sl-transit-admin-safety-certification.json',
  'sl-transit-admin-config-readiness.json',
  'sl-transit-admin-go-live-readiness.json',
  'sl-transit-admin-owner-handoff-checklist.json',
  'sl-transit-admin-owner-publish-gate.json',
  'sl-transit-admin-backup-rollback-drill.json',
  'sl-transit-admin-review-bundle.json',
];

for (const file of requiredArtifacts) {
  assert.ok(artifactFiles.includes(file), `missing required artifact ${file}`);
}

const releaseSections = [
  'adminAudit',
  'adminCutoverPlan',
  'goLiveReadiness',
  'configReadiness',
  'safetyCertification',
  'ownerHandoffChecklist',
  'ownerPublishGate',
  'backupRollbackDrill',
  'rulesRequirements',
  'blockedPublishPlan',
];

for (const section of releaseSections) {
  assert.ok(html.includes(`${section}:`), `review bundle missing ${section}`);
}

assert.ok(html.includes("targetPath:'/publishedSchedule'"));
assert.ok(html.includes("targetPath:'/publishedSchedule after owner approval only'"));
assert.ok(html.includes('requiredOwnerActions'));
assert.ok(html.includes('merge PR after review'));
assert.ok(html.includes('confirm backup and rollback'));
assert.ok(html.includes('approve Firebase rules separately'));

assert.ok(!html.includes('writeAllowed:true'));
assert.ok(!html.includes('applyEnabled:true'));
assert.ok(!html.includes('readyForProduction:true'));

console.log('admin-erp release readiness ok');
