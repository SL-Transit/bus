(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SLTransitGreenfieldState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
  const PHASES = Object.freeze({
    IDLE: "idle",
    FILE_SELECTED: "fileSelected",
    VALIDATING: "validating",
    QUEUED: "queued",
    DRAFT: "draft",
    INVALID: "invalid",
    REVIEW_REQUESTED: "reviewRequested",
    APPROVED: "approved",
    REJECTED: "rejected"
  });

  function initialState() {
    return {
      phase: PHASES.IDLE,
      file: null,
      operatorScope: [],
      job: null,
      draft: null,
      validation: null,
      review: null,
      approval: null,
      busy: false,
      error: null
    };
  }

  function issue(code, message) {
    return { code, message };
  }

  function reduce(state, event) {
    const current = state || initialState();
    const action = event || {};
    if (action.type === "PUBLISH") {
      return { ...current, error: issue("unsupported_command", "Phase 6A does not expose publication.") };
    }
    switch (action.type) {
      case "RESET":
        return initialState();
      case "SELECT_FILE": {
        const file = action.file || {};
        if (!file.name || !Number.isFinite(file.size) || file.size < 0) {
          return { ...current, error: issue("invalid_file_metadata", "ข้อมูลไฟล์ไม่สมบูรณ์") };
        }
        if (file.size > MAX_IMPORT_BYTES) {
          return { ...initialState(), error: issue("file_too_large", "ไฟล์ต้องมีขนาดไม่เกิน 25 MB") };
        }
        return {
          ...initialState(),
          phase: PHASES.FILE_SELECTED,
          file: { name: String(file.name), size: file.size, type: String(file.type || "") },
          operatorScope: Array.isArray(action.operatorScope) ? action.operatorScope : []
        };
      }
      case "START_VALIDATION":
        if (current.phase !== PHASES.FILE_SELECTED) {
          return { ...current, error: issue("invalid_transition", "กรุณาเลือกไฟล์ก่อนตรวจสอบ") };
        }
        return { ...current, phase: PHASES.VALIDATING, busy: true, error: null };
      case "IMPORT_QUEUED":
        return {
          ...current,
          phase: PHASES.QUEUED,
          busy: true,
          job: { id: String(action.jobId || ""), status: action.status || "queued" },
          error: null
        };
      case "JOB_STATUS":
        return {
          ...current,
          job: { ...(current.job || {}), status: action.status || "unknown" },
          busy: ["queued", "processing", "retryable"].includes(action.status)
        };
      case "BACKEND_UNAVAILABLE":
        return {
          ...current,
          phase: current.file ? PHASES.FILE_SELECTED : PHASES.IDLE,
          busy: false,
          error: issue("greenfield_backend_not_connected", "ยังไม่ได้กำหนด Backend/Authentication สำหรับสภาพแวดล้อมนี้")
        };
      case "VALIDATION_FAILED":
        return {
          ...current,
          phase: PHASES.INVALID,
          busy: false,
          validation: action.report || { errors: [], warnings: [] },
          error: null
        };
      case "VALIDATION_SUCCEEDED":
        if (![PHASES.VALIDATING, PHASES.QUEUED].includes(current.phase)) {
          return { ...current, busy: false, error: issue("invalid_transition", "สถานะไม่พร้อมรับผลตรวจสอบ") };
        }
        return {
          ...current,
          phase: PHASES.DRAFT,
          busy: false,
          draft: {
            id: String(action.draftId || ""),
            status: "draft",
            revision: Number.isInteger(action.revision) ? action.revision : 1
          },
          validation: action.report || { errors: [], warnings: [] },
          error: null
        };
      case "COMMAND_STARTED":
        return { ...current, busy: true, error: null };
      case "REQUEST_REVIEW": {
        const errors = current.validation && Array.isArray(current.validation.errors) ? current.validation.errors.length : 0;
        if (current.phase !== PHASES.DRAFT || errors > 0) {
          return { ...current, busy: false, error: issue("review_blocked", "ต้องมี Draft ที่ผ่าน Validation ก่อนส่ง Review") };
        }
        return {
          ...current,
          phase: PHASES.REVIEW_REQUESTED,
          busy: false,
          draft: { ...current.draft, status: "review_requested", revision: action.revision || current.draft.revision },
          review: { status: "requested" },
          error: null
        };
      }
      case "APPROVAL_DECIDED":
        if (current.phase !== PHASES.REVIEW_REQUESTED || !["approve", "reject"].includes(action.decision)) {
          return { ...current, busy: false, error: issue("approval_blocked", "อนุมัติหรือส่งกลับได้หลังส่ง Review เท่านั้น") };
        }
        return {
          ...current,
          phase: action.decision === "approve" ? PHASES.APPROVED : PHASES.REJECTED,
          busy: false,
          draft: {
            ...current.draft,
            status: action.decision === "approve" ? "approved" : "rejected",
            revision: action.revision || current.draft.revision
          },
          approval: { status: action.decision === "approve" ? "approved" : "rejected" },
          error: null
        };
      case "COMMAND_FAILED":
        return {
          ...current,
          busy: false,
          error: issue(action.code || "command_failed", action.message || "Backend ปฏิเสธคำสั่ง")
        };
      default:
        return current;
    }
  }

  function deriveView(state) {
    const current = state || initialState();
    return {
      canValidate: current.phase === PHASES.FILE_SELECTED && !current.busy,
      canRequestReview: current.phase === PHASES.DRAFT &&
        !(current.validation && current.validation.errors && current.validation.errors.length) &&
        !current.busy,
      canApprove: current.phase === PHASES.REVIEW_REQUESTED && !current.busy,
      isBusy: current.busy,
      backendBlocked: Boolean(current.error && current.error.code === "greenfield_backend_not_connected")
    };
  }

  return Object.freeze({ MAX_IMPORT_BYTES, PHASES, initialState, reduce, deriveView });
});