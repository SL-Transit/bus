(function (root) {
  'use strict';

  const State = root.SLTransitGreenfieldState;
  const Api = root.SLTransitGreenfieldApi;
  if (!State || !Api) return;

  function createController(options) {
    const settings = options || {};
    const documentRef = settings.document || root.document;
    const client = Api.createClient({ transport: settings.transport, getToken: settings.getToken });
    let state = State.initialState();

    const byId = (id) => documentRef.getElementById(id);
    const elements = {
      file: byId('import-file'),
      fileName: byId('file-name'),
      fileSize: byId('file-size'),
      validate: byId('validate-file'),
      reset: byId('reset-workflow'),
      review: byId('request-review'),
      approve: byId('approve-draft'),
      phase: byId('workflow-phase'),
      status: byId('workflow-status'),
      notice: byId('action-notice'),
      errorCode: byId('error-code')
    };

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes)) return '—';
      if (bytes < 1024) return `${bytes} B`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    function dispatch(event) {
      state = State.reduce(state, event);
      render();
      return state;
    }

    function render() {
      const view = State.deriveView(state);
      elements.phase.textContent = state.phase;
      elements.fileName.textContent = state.file ? state.file.name : 'ยังไม่ได้เลือกไฟล์';
      elements.fileSize.textContent = state.file ? formatBytes(state.file.size) : '—';
      elements.validate.disabled = !view.canValidate;
      elements.review.disabled = !view.canRequestReview;
      elements.approve.disabled = !view.canApprove;
      elements.status.textContent = state.error ? state.error.message : 'พร้อมรับข้อมูลในหน้า Preview — ยังไม่มีการบันทึก';
      elements.errorCode.textContent = state.error ? state.error.code : 'none';
      elements.notice.dataset.kind = state.error ? 'warning' : 'neutral';
      documentRef.querySelectorAll('[data-phase]').forEach((item) => {
        item.dataset.active = String(item.dataset.phase === state.phase);
      });
    }

    async function validateSelectedFile() {
      state = State.reduce(state, { type: 'START_VALIDATION' });
      render();
      if (state.phase !== State.PHASES.VALIDATING) return;
      try {
        const result = await client.send('import.start', { file: state.file });
        if (result && result.valid === true) {
          dispatch({ type: 'VALIDATION_SUCCEEDED', draftId: result.draftId, report: result.report });
        } else {
          dispatch({ type: 'VALIDATION_FAILED', report: result && result.report });
        }
      } catch (error) {
        if (error && error.code === 'greenfield_backend_not_connected') dispatch({ type: 'BACKEND_UNAVAILABLE' });
        else dispatch({ type: 'VALIDATION_FAILED', report: { errors: [{ code: 'command_failed' }], warnings: [] } });
      }
    }

    function bindNavigation() {
      documentRef.querySelectorAll('[data-section-target]').forEach((button) => {
        button.addEventListener('click', () => {
          const target = byId(button.dataset.sectionTarget);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    elements.file.addEventListener('change', () => {
      const file = elements.file.files && elements.file.files[0];
      if (!file) return dispatch({ type: 'RESET' });
      dispatch({ type: 'SELECT_FILE', file: { name: file.name, size: file.size, type: file.type } });
    });
    elements.validate.addEventListener('click', validateSelectedFile);
    elements.reset.addEventListener('click', () => { elements.file.value = ''; dispatch({ type: 'RESET' }); });
    elements.review.addEventListener('click', () => dispatch({ type: 'REQUEST_REVIEW' }));
    elements.approve.addEventListener('click', () => dispatch({ type: 'APPROVAL_DECIDED', decision: 'approve' }));
    bindNavigation();
    render();

    return Object.freeze({ getState: () => state, dispatch, validateSelectedFile });
  }

  root.SLTransitGreenfieldAdmin = Object.freeze({ createController });
  if (root.document) root.document.addEventListener('DOMContentLoaded', () => createController({ document: root.document }));
})(typeof globalThis !== 'undefined' ? globalThis : this);