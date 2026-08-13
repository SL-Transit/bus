const assert = require('node:assert/strict');
const test = require('node:test');
const State = require('../admin-erp1-greenfield-state.js');
const Api = require('../admin-erp1-greenfield-api-client.js');

test('state machine ??? metadata ????????????????????? 25 MB', () => {
  const selected = State.reduce(State.initialState(), { type: 'SELECT_FILE', file: { name: 'network.xlsx', size: 2048, type: 'application/xlsx' } });
  assert.equal(selected.phase, State.PHASES.FILE_SELECTED);
  assert.equal(selected.file.name, 'network.xlsx');
  assert.equal(State.deriveView(selected).canValidate, true);

  const tooLarge = State.reduce(State.initialState(), { type: 'SELECT_FILE', file: { name: 'large.zip', size: State.MAX_IMPORT_BYTES + 1 } });
  assert.equal(tooLarge.phase, State.PHASES.IDLE);
  assert.equal(tooLarge.error.code, 'file_too_large');
});

test('Draft ??????? Validation ?????????????? Review ??? Approve ???', () => {
  let state = State.reduce(State.initialState(), { type: 'SELECT_FILE', file: { name: 'network.csv', size: 100 } });
  state = State.reduce(state, { type: 'START_VALIDATION' });
  state = State.reduce(state, { type: 'VALIDATION_SUCCEEDED', draftId: 'draft-001', report: { errors: [], warnings: [] } });
  assert.equal(state.phase, State.PHASES.DRAFT);
  state = State.reduce(state, { type: 'REQUEST_REVIEW' });
  assert.equal(state.phase, State.PHASES.REVIEW_REQUESTED);
  state = State.reduce(state, { type: 'APPROVAL_DECIDED', decision: 'approve' });
  assert.equal(state.phase, State.PHASES.APPROVED);
});

test('?? Validation ??????????????? Review', () => {
  let state = State.reduce(State.initialState(), { type: 'SELECT_FILE', file: { name: 'broken.csv', size: 100 } });
  state = State.reduce(state, { type: 'START_VALIDATION' });
  state = State.reduce(state, { type: 'VALIDATION_FAILED', report: { errors: [{ code: 'missing_stop' }], warnings: [] } });
  state = State.reduce(state, { type: 'REQUEST_REVIEW' });
  assert.equal(state.phase, State.PHASES.INVALID);
  assert.equal(state.error.code, 'review_blocked');
});

test('?????? Excel ???????????? Phase invalid ?????????????????????', () => {
  let state = State.reduce(State.initialState(), { type: 'SELECT_FILE', file: { name: 'broken.xlsx', size: 100 } });
  state = State.reduce(state, { type: 'START_VALIDATION' });
  state = State.reduce(state, {
    type: 'VALIDATION_FAILED',
    report: { errors: [{ code: 'excel.frequency_data_required' }], warnings: [] },
    code: 'excel_validation_failed',
    message: '?????? Excel ??????? Validation'
  });

  assert.equal(state.phase, State.PHASES.INVALID);
  assert.equal(state.busy, false);
  assert.equal(state.validation.errors[0].code, 'excel.frequency_data_required');
  assert.equal(state.error.code, 'excel_validation_failed');
  assert.equal(State.deriveView(state).canRequestReview, false);
});
test('API client fail closed ????????????? transport', async () => {
  const client = Api.createClient();
  await assert.rejects(client.send('import.start', { file: {} }), (error) => error.code === 'greenfield_backend_not_connected');
});

test('API client ??? command envelope ???? transport ??? inject ????????', async () => {
  let request;
  const client = Api.createClient({
    getToken: async () => 'preview-token',
    transport: async (input) => { request = input; return { ok: true, data: { valid: true } }; }
  });
  const result = await client.send('import.start', { file: { name: 'network.csv' } });
  assert.equal(result.valid, true);
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/api/greenfield-erp/commands');
  assert.equal(request.headers.Authorization, 'Bearer preview-token');
  assert.equal(request.body.command, 'import.start');
});