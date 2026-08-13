const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const State = require('../admin-erp1-greenfield-state.js');
const Api = require('../admin-erp1-greenfield-api-client.js');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Admin allowlist ไม่มีคำสั่งเผยแพร่', async () => {
  assert.deepEqual(Api.ALLOWED_COMMANDS, ['upload.authorize', 'import.start', 'import.status', 'draft.read', 'draft.save', 'draft.validate', 'draft.validation.status', 'review.request', 'approval.decide']);
  const client = Api.createClient({ transport: async () => ({ ok: true, data: {} }) });
  await assert.rejects(client.send('publication.activate', {}), (error) => error.code === 'unsupported_command');
});

test('state machine ปฏิเสธ event เผยแพร่และไม่เปลี่ยน Phase', () => {
  const state = State.reduce(State.initialState(), { type: 'PUBLISH' });
  assert.equal(state.phase, State.PHASES.IDLE);
  assert.equal(state.error.code, 'unsupported_command');
});

test('browser modules ไม่มี direct database SDK, browser Draft หรือ pointer switch', () => {
  const sources = [
    read('admin-erp1-greenfield-state.js'),
    read('admin-erp1-greenfield-api-client.js'),
    read('admin-erp1-greenfield-controller.js'),
    read('admin-erp1-greenfield-system-mode.js'),
    read('admin-erp1-ui.js')
  ].join('\n');
  assert.doesNotMatch(sources, /firebase|databaseURL|\.ref\(|publishedReadModels|multi-location/i);
  assert.doesNotMatch(sources, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(read('admin-erp1-ui.js'), /\bfetch\s*\(|XMLHttpRequest|innerHTML/i);
});

test('classic entry แสดง Publish เป็น locked step โดยไม่มี action หรือ path', () => {
  const page = read('admin-erp1.html');
  assert.match(page, /Publish<\/strong><small>LOCKED/);
  assert.doesNotMatch(page, /<button[^>]+(?:id|data-command)="[^"]*(?:publish|publication)/i);
  assert.doesNotMatch(page, /publishedReadModels\/current|erpDataCenter\/publication/);
});

test('controller แสดงข้อความด้วย textContent และไม่ประกอบ HTML จากข้อมูลไฟล์', () => {
  const controller = read('admin-erp1-greenfield-controller.js');
  assert.match(controller, /textContent/);
  assert.doesNotMatch(controller, /innerHTML|insertAdjacentHTML|document\.write/);
});