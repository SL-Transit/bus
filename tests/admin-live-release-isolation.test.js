const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const protectedFiles = [
  'booking1.html', 'booking.html', 'booking-pos.js', 'booking-bridge.js',
  'booking1-preview-adapter.js', 'passenger.html', 'check_ticket.html',
  'cancel_ticket.html', 'functions/index.js', 'database.rules.json'
];
const run = (args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const changed = run(['diff', '--name-only', 'origin/main...HEAD']).trim().split(/\r?\n/).filter(Boolean);
const allowed = new Set(['admin-erp.html', 'tests/admin-live-release-isolation.test.js', 'tests/admin-enterprise-ux.test.js', 'tests/admin-console-ui-contract.test.js', '.github/workflows/admin-live-release.yml', 'docs/admin-erp-enterprise-ux-blueprint.md']);
const unexpected = changed.filter((file) => !allowed.has(file));
if (unexpected.length) throw new Error(`unexpected release files: ${unexpected.join(', ')}`);
for (const file of protectedFiles) {
  const base = run(['rev-parse', `origin/main:${file}`]).trim();
  const current = run(['rev-parse', `HEAD:${file}`]).trim();
  if (base !== current) throw new Error(`protected file changed: ${file}`);
}
const html = fs.readFileSync(path.join(root, 'admin-erp.html'), 'utf8');
if (!html.includes('ADMIN_LIVE_REVIEW_READ_ONLY')) throw new Error('live review gate missing');
if (html.includes('โหมดทดลองดูหน้าระบบ')) throw new Error('preview banner leaked into real Admin page');
if (!html.includes('กำลังเชื่อมต่อระบบหลังบ้าน ยังไม่สามารถใช้คำสั่งนี้ได้')) throw new Error('disabled action message missing');
console.log('admin live release isolation ok');
