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
    REVALIDATING: "revalidating",
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
      draftPage: null,
      validationJob: null,
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
      return { ...current, error: issue("unsupported_command", "Phase 6A.1 does not expose publication.") };
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
      case "VALIDATION_SUCCEEDED": {
        if (![PHASES.VALIDATING, PHASES.QUEUED].includes(current.phase)) {
          return { ...current, busy: false, error: issue("invalid_transition", "สถานะไม่พร้อมรับผลตรวจสอบ") };
        }
        const revision = Number.isInteger(action.revision) ? action.revision : 1;
        return {
          ...current,
          phase: PHASES.DRAFT,
          busy: false,
          draft: {
            id: String(action.draftId || ""),
            status: "draft",
            revision,
            validationStatus: "valid",
            validatedRevision: revision
          },
          validation: action.report || { errors: [], warnings: [], errorCount: 0, warningCount: 0 },
          error: null
        };
      }
      case "DRAFT_PAGE_LOADED":
        return {
          ...current,
          draft: {
            ...(current.draft || {}),
            id: action.page.draftId,
            status: action.page.status,
            revision: action.page.revision,
            validationStatus: action.page.validationStatus,
            validatedRevision: action.page.validatedRevision
          },
          draftPage: action.page,
          busy: false,
          error: null
        };
      case "DRAFT_SAVED":
        return {
          ...current,
          phase: PHASES.DRAFT,
          busy: false,
          draft: {
            ...(current.draft || {}),
            status: "draft",
            revision: action.revision,
            validationStatus: "required",
            validatedRevision: null
          },
          draftPage: null,
          validationJob: null,
          validation: null,
          error: null
        };
      case "DRAFT_VALIDATION_QUEUED":
        return {
          ...current,
          phase: PHASES.REVALIDATING,
          busy: true,
          validationJob: { id: action.jobId, status: action.status || "queued" },
          draft: { ...(current.draft || {}), validationStatus: "queued", validatedRevision: null },
          validation: null,
          error: null
        };
      case "DRAFT_VALIDATION_STATUS": {
        const job = action.job || {};
        if (["queued", "processing", "retryable"].includes(job.status)) {
          return {
            ...current,
            phase: PHASES.REVALIDATING,
            busy: true,
            validationJob: { id: job.jobId, status: job.status },
            error: null
          };
        }
        if (job.status === "failed") {
          return {
            ...current,
            phase: PHASES.DRAFT,
            busy: false,
            validationJob: { id: job.jobId, status: job.status },
            draft: { ...(current.draft || {}), validationStatus: "required", validatedRevision: null },
            error: issue(job.resultCode || "draft_validation_failed", "การตรวจ Draft ไม่สำเร็จ กรุณาตรวจรหัสข้อผิดพลาด")
          };
        }
        const report = job.validation || { errors: [], warnings: [], errorCount: 0, warningCount: 0 };
        const valid = job.resultCode === "draft_valid" &&
          Number(report.errorCount || 0) === 0 &&
          current.draft &&
          job.expectedRevision === current.draft.revision;
        return {
          ...current,
          phase: valid ? PHASES.DRAFT : PHASES.INVALID,
          busy: false,
          validationJob: { id: job.jobId, status: job.status },
          validation: report,
          draft: {
            ...(current.draft || {}),
            validationStatus: valid ? "valid" : "invalid",
            validatedRevision: job.expectedRevision || null
          },
          error: null
        };
      }
      case "COMMAND_STARTED":
        return { ...current, busy: true, error: null };
      case "REQUEST_REVIEW": {
        const validationReady = current.draft &&
          current.draft.validationStatus === "valid" &&
          current.draft.validatedRevision === current.draft.revision;
        if (current.phase !== PHASES.DRAFT || !validationReady) {
          return { ...current, busy: false, error: issue("review_blocked", "ต้องมี Draft ที่ผ่าน Validation ใน revision ปัจจุบันก่อนส่ง Review") };
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
    const editable = [PHASES.DRAFT, PHASES.INVALID, PHASES.REJECTED].includes(current.phase);
    const validationReady = current.draft &&
      current.draft.validationStatus === "valid" &&
      current.draft.validatedRevision === current.draft.revision;
    return {
      canValidate: current.phase === PHASES.FILE_SELECTED && !current.busy,
      canLoadDraft: Boolean(current.draft) && !current.busy,
      canSaveDraft: Boolean(current.draft) && editable && !current.busy,
      canValidateDraft: Boolean(current.draft) && editable && !current.busy,
      canRequestReview: current.phase === PHASES.DRAFT && validationReady && !current.busy,
      canApprove: current.phase === PHASES.REVIEW_REQUESTED && !current.busy,
      canReject: current.phase === PHASES.REVIEW_REQUESTED && !current.busy,
      isBusy: current.busy,
      backendBlocked: Boolean(current.error && current.error.code === "greenfield_backend_not_connected")
    };
  }

  return Object.freeze({ MAX_IMPORT_BYTES, PHASES, initialState, reduce, deriveView });
});