(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SLTransitGreenfieldState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
  const PHASES = Object.freeze({
    IDLE: 'idle',
    FILE_SELECTED: 'fileSelected',
    VALIDATING: 'validating',
    DRAFT: 'draft',
    INVALID: 'invalid',
    REVIEW_REQUESTED: 'reviewRequested',
    APPROVED: 'approved'
  });

  function initialState() {
    return { phase: PHASES.IDLE, file: null, draft: null, validation: null, review: null, approval: null, error: null };
  }

  function issue(code, message) { return { code, message }; }

  function reduce(state, event) {
    const current = state || initialState();
    const action = event || {};
    if (action.type === 'PUBLISH') {
      return { ...current, error: issue('unsupported_command', 'Phase 3 does not expose publication.') };
    }
    switch (action.type) {
      case 'RESET': return initialState();
      case 'SELECT_FILE': {
        const file = action.file || {};
        if (!file.name || !Number.isFinite(file.size) || file.size < 0) {
          return { ...current, error: issue('invalid_file_metadata', 'ข้อมูลไฟล์ไม่สมบูรณ์') };
        }
        if (file.size > MAX_IMPORT_BYTES) {
          return { ...initialState(), error: issue('file_too_large', 'ไฟล์ต้องมีขนาดไม่เกิน 25 MB') };
        }
        return { ...initialState(), phase: PHASES.FILE_SELECTED, file: { name: String(file.name), size: file.size, type: String(file.type || '') } };
      }
      case 'START_VALIDATION':
        if (current.phase !== PHASES.FILE_SELECTED) return { ...current, error: issue('invalid_transition', 'กรุณาเลือกไฟล์ก่อนตรวจสอบ') };
        return { ...current, phase: PHASES.VALIDATING, error: null };
      case 'BACKEND_UNAVAILABLE':
        return { ...current, phase: current.file ? PHASES.FILE_SELECTED : PHASES.IDLE, error: issue('greenfield_backend_not_connected', 'Backend Greenfield ยังไม่เชื่อมต่อ จึงยังไม่มีการส่งหรือบันทึกข้อมูล') };
      case 'VALIDATION_FAILED':
        if (current.phase !== PHASES.VALIDATING) return { ...current, error: issue('invalid_transition', 'สถานะไม่พร้อมรับผลตรวจสอบ') };
        return { ...current, phase: PHASES.INVALID, validation: action.report || { errors: [], warnings: [] }, error: null };
      case 'VALIDATION_SUCCEEDED':
        if (current.phase !== PHASES.VALIDATING) return { ...current, error: issue('invalid_transition', 'สถานะไม่พร้อมรับผลตรวจสอบ') };
        return { ...current, phase: PHASES.DRAFT, draft: { id: String(action.draftId || ''), status: 'draft' }, validation: action.report || { errors: [], warnings: [] }, error: null };
      case 'REQUEST_REVIEW': {
        const errors = current.validation && Array.isArray(current.validation.errors) ? current.validation.errors.length : 0;
        if (current.phase !== PHASES.DRAFT || errors > 0) return { ...current, error: issue('review_blocked', 'ต้องมี Draft ที่ผ่าน Validation ก่อนส่ง Review') };
        return { ...current, phase: PHASES.REVIEW_REQUESTED, review: { status: 'requested' }, error: null };
      }
      case 'APPROVAL_DECIDED':
        if (current.phase !== PHASES.REVIEW_REQUESTED || action.decision !== 'approve') return { ...current, error: issue('approval_blocked', 'อนุมัติได้หลังส่ง Review และต้องมีคำตัดสินที่รองรับ') };
        return { ...current, phase: PHASES.APPROVED, approval: { status: 'approved' }, error: null };
      default: return current;
    }
  }

  function deriveView(state) {
    const current = state || initialState();
    return {
      canValidate: current.phase === PHASES.FILE_SELECTED,
      canRequestReview: current.phase === PHASES.DRAFT && !(current.validation && current.validation.errors && current.validation.errors.length),
      canApprove: current.phase === PHASES.REVIEW_REQUESTED,
      isBusy: current.phase === PHASES.VALIDATING,
      backendBlocked: Boolean(current.error && current.error.code === 'greenfield_backend_not_connected')
    };
  }

  return Object.freeze({ MAX_IMPORT_BYTES, PHASES, initialState, reduce, deriveView });
});