(function (root) {
  "use strict";

  const State = root.SLTransitGreenfieldState;
  const Api = root.SLTransitGreenfieldApi;
  if (!State || !Api) return;

  function createController(options) {
    const settings = options || {};
    const documentRef = settings.document || root.document;
    const runtime = settings.runtime || root.SLTransitGreenfieldRuntimeConfig || {};
    const getToken = settings.getToken || runtime.getToken;
    const transport = settings.transport ||
      (runtime.commandEndpoint ? Api.createFetchTransport({ endpoint: runtime.commandEndpoint }) : null);
    const uploadTransport = settings.uploadTransport ||
      (runtime.commandEndpoint ? Api.createFetchUploadTransport({}) : null);
    const client = Api.createClient({ transport, uploadTransport, getToken });
    const sleep = settings.sleep || function (milliseconds) {
      return new Promise(function (resolve) { root.setTimeout(resolve, milliseconds); });
    };
    const maxPollAttempts = settings.maxPollAttempts || 40;
    const maxPollDelayMs = settings.maxPollDelayMs || 5000;
    let state = State.initialState();
    let selectedFile = null;
    let workflowGeneration = 0;

    const byId = function (id) { return documentRef.getElementById(id); };
    const elements = {
      file: byId("import-file"),
      operatorScope: byId("operator-scope"),
      fileName: byId("file-name"),
      fileSize: byId("file-size"),
      validate: byId("validate-file"),
      reset: byId("reset-workflow"),
      review: byId("request-review"),
      approve: byId("approve-draft"),
      phase: byId("workflow-phase"),
      status: byId("workflow-status"),
      notice: byId("action-notice"),
      errorCode: byId("error-code"),
      jobId: byId("job-id"),
      backendStatus: byId("backend-status")
    };

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes)) return "—";
      if (bytes < 1024) return bytes + " B";
      return (bytes / 1024 / 1024).toFixed(2) + " MB";
    }

    function operatorScope() {
      const raw = elements.operatorScope && elements.operatorScope.value || "";
      return Array.from(new Set(raw.split(",").map(function (item) { return item.trim(); }).filter(Boolean)));
    }

    function dispatch(event) {
      state = State.reduce(state, event);
      render();
      return state;
    }

    function statusText() {
      if (state.error) return state.error.message;
      if (state.phase === State.PHASES.VALIDATING) return "กำลังขอสิทธิ์ Upload และส่งไฟล์เข้าพื้นที่พักข้อมูล";
      if (state.phase === State.PHASES.QUEUED) return "Backend รับงานแล้ว กำลังตรวจสอบและสร้าง Draft";
      if (state.phase === State.PHASES.DRAFT) return "Draft ผ่าน Validation พร้อมส่ง Review";
      if (state.phase === State.PHASES.REVIEW_REQUESTED) return "ส่ง Review แล้ว ต้องใช้บัญชีผู้อนุมัติที่ไม่ใช่ผู้สร้างหรือผู้แก้ล่าสุด";
      if (state.phase === State.PHASES.APPROVED) return "อนุมัติ Draft แล้ว แต่ยังไม่มีการ Publish";
      if (state.phase === State.PHASES.REJECTED) return "Draft ถูกส่งกลับเพื่อแก้ไข";
      return runtime.commandEndpoint
        ? "พร้อมเชื่อม Backend ในสภาพแวดล้อมที่กำหนด"
        : "ยังไม่ได้กำหนด Backend/Authentication และไม่มีการเขียน Production";
    }

    function render() {
      const view = State.deriveView(state);
      elements.phase.textContent = state.phase;
      elements.fileName.textContent = state.file ? state.file.name : "ยังไม่ได้เลือกไฟล์";
      elements.fileSize.textContent = state.file ? formatBytes(state.file.size) : "—";
      elements.validate.disabled = !view.canValidate;
      elements.review.disabled = !view.canRequestReview;
      elements.approve.disabled = !view.canApprove;
      elements.status.textContent = statusText();
      elements.errorCode.textContent = state.error ? state.error.code : "none";
      if (elements.jobId) elements.jobId.textContent = state.job && state.job.id || "—";
      if (elements.backendStatus) {
        elements.backendStatus.textContent = runtime.commandEndpoint ? "Configured" : "Not configured";
        elements.backendStatus.className = runtime.commandEndpoint ? "online" : "offline";
      }
      elements.notice.dataset.kind = state.error ? "warning" : "neutral";
      documentRef.querySelectorAll("[data-phase]").forEach(function (item) {
        item.dataset.active = String(item.dataset.phase === state.phase);
      });
    }

    async function checksumSha256(file) {
      const cryptoRef = settings.crypto || root.crypto;
      if (!file || typeof file.arrayBuffer !== "function" || !cryptoRef || !cryptoRef.subtle) {
        const error = new Error("checksum_unavailable");
        error.code = "checksum_unavailable";
        throw error;
      }
      const buffer = await file.arrayBuffer();
      const digest = await cryptoRef.subtle.digest("SHA-256", buffer);
      return "sha256:" + Array.from(new Uint8Array(digest)).map(function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }

    async function pollImport(jobId, generation) {
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (generation !== workflowGeneration) return null;
        const job = await client.send("import.status", { jobId });
        dispatch({ type: "JOB_STATUS", status: job.status });
        if (job.status === "completed") return job;
        if (job.status === "failed") {
          return {
            ...job,
            validation: job.validation || { errors: [{ code: job.resultCode || "validation_failed" }], warnings: [] }
          };
        }
        const delay = Math.min(250 * Math.pow(2, Math.min(attempt, 5)), maxPollDelayMs);
        await sleep(delay);
      }
      const error = new Error("import_status_timeout");
      error.code = "import_status_timeout";
      throw error;
    }

    async function validateSelectedFile() {
      const generation = ++workflowGeneration;
      const scope = operatorScope();
      if (!selectedFile || !/.json$/i.test(selectedFile.name) || scope.length === 0) {
        dispatch({
          type: "COMMAND_FAILED",
          code: !selectedFile || !/.json$/i.test(selectedFile.name) ? "canonical_json_required" : "operator_scope_required",
          message: !selectedFile || !/.json$/i.test(selectedFile.name)
            ? "Phase 6A รับเฉพาะ Canonical JSON ที่ผ่านการ Mapping แล้ว"
            : "กรุณาระบุ Stable Operator ID อย่างน้อยหนึ่งรายการ"
        });
        return;
      }
      state = State.reduce(state, { type: "START_VALIDATION" });
      render();
      if (state.phase !== State.PHASES.VALIDATING) return;
      try {
        const checksum = await checksumSha256(selectedFile);
        const authorization = await client.send("upload.authorize", {
          fileName: selectedFile.name,
          contentType: "application/json",
          sizeBytes: selectedFile.size,
          checksumSha256: checksum,
          operatorScope: scope
        });
        await client.upload(selectedFile, authorization.target);
        const queued = await client.send("import.start", {
          operatorScope: scope,
          source: authorization.source
        });
        dispatch({ type: "IMPORT_QUEUED", jobId: queued.jobId, status: queued.status });
        const job = await pollImport(queued.jobId, generation);
        if (!job) return;
        if (job.status === "completed") {
          dispatch({
            type: "VALIDATION_SUCCEEDED",
            draftId: job.draftId,
            revision: 1,
            report: job.validation || { errors: [], warnings: [] }
          });
        } else {
          dispatch({ type: "VALIDATION_FAILED", report: job.validation });
        }
      } catch (error) {
        if (error && ["greenfield_backend_not_connected", "upload_transport_not_connected"].includes(error.code)) {
          dispatch({ type: "BACKEND_UNAVAILABLE" });
        } else {
          dispatch({
            type: "COMMAND_FAILED",
            code: error && error.code || "command_failed",
            message: "Backend ไม่สามารถดำเนินงานนี้ได้ กรุณาตรวจรหัสข้อผิดพลาด"
          });
        }
      }
    }

    async function requestReview() {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "review_blocked" });
      dispatch({ type: "COMMAND_STARTED" });
      try {
        const result = await client.send("review.request", {
          draftId: state.draft.id,
          expectedRevision: state.draft.revision,
          operatorScope: operatorScope()
        });
        dispatch({ type: "REQUEST_REVIEW", revision: result.revision });
      } catch (error) {
        dispatch({ type: "COMMAND_FAILED", code: error && error.code || "command_failed" });
      }
    }

    async function approveDraft() {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "approval_blocked" });
      dispatch({ type: "COMMAND_STARTED" });
      try {
        const result = await client.send("approval.decide", {
          draftId: state.draft.id,
          expectedRevision: state.draft.revision,
          operatorScope: operatorScope(),
          decision: "approve",
          comment: ""
        });
        dispatch({ type: "APPROVAL_DECIDED", decision: "approve", revision: result.revision });
      } catch (error) {
        dispatch({ type: "COMMAND_FAILED", code: error && error.code || "command_failed" });
      }
    }

    function bindNavigation() {
      documentRef.querySelectorAll("[data-section-target]").forEach(function (button) {
        button.addEventListener("click", function () {
          const target = byId(button.dataset.sectionTarget);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

    elements.file.addEventListener("change", function () {
      const file = elements.file.files && elements.file.files[0];
      selectedFile = file || null;
      if (!file) return dispatch({ type: "RESET" });
      dispatch({
        type: "SELECT_FILE",
        file: { name: file.name, size: file.size, type: file.type },
        operatorScope: operatorScope()
      });
    });
    elements.validate.addEventListener("click", validateSelectedFile);
    elements.reset.addEventListener("click", function () {
      workflowGeneration += 1;
      selectedFile = null;
      elements.file.value = "";
      dispatch({ type: "RESET" });
    });
    elements.review.addEventListener("click", requestReview);
    elements.approve.addEventListener("click", approveDraft);
    bindNavigation();
    render();

    return Object.freeze({
      approveDraft,
      dispatch,
      getState: function () { return state; },
      pollImport,
      requestReview,
      validateSelectedFile
    });
  }

  root.SLTransitGreenfieldAdmin = Object.freeze({ createController });
  if (root.document) {
    root.document.addEventListener("DOMContentLoaded", function () {
      createController({ document: root.document });
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);