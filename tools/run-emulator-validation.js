const { spawnSync } = require('node:child_process');

const run = (command, args, env) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: false });
  return result.status == null ? 1 : result.status;
};

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('ต้องรันผ่านระบบจำลอง Firebase เท่านั้น');
const env = { ...process.env, GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'sl-transit-9464e', K6_RUN_ID: `ci-${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || 1}` };
const k6 = process.platform === 'win32' ? 'k6.exe' : 'k6';
let status = 0;
try {
  status = run(process.execPath, ['tools/seed-emulator-k6.js'], env);
  if (status === 0) {
    status = run(process.execPath, ['--test', '--test-timeout=30000', 'tests/emulator-security.behavioral.test.js'], env);
    if (status === 0) status = run(process.execPath, ['tools/seed-emulator-k6.js'], env);
    if (status === 0) status = run(k6, ['run', 'tests/k6/booking-concurrency-emulator.js'], env);
  }
} finally {
  const cleanup = run(process.execPath, ['tools/cleanup-emulator-k6.js'], env);
  if (status === 0) status = cleanup;
}
process.exit(status);
