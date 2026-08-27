(function (root) {
  "use strict";

  const State = root.SLTransitGreenfieldState;
  const Api = root.SLTransitGreenfieldApi;
  const Excel33x = root.SLTransitAdminErpExcel33x;
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
    let renderedPage = null;

    const byId = function (id) { return documentRef.getElementById(id); };
    const elements = {
      file: byId("import-file"),
      operatorScope: byId("operator-scope"),
      fileName: byId("file-name"),
      fileSize: byId("file-size"),
      excelVersion: byId("excel-version"),
      excelPrecheck: byId("excel-precheck"),
      validate: byId("validate-file"),
      reset: byId("reset-workflow"),
      review: byId("request-review"),
      approve: byId("approve-draft"),
      reject: byId("reject-draft"),
      approvalComment: byId("approval-comment"),
      phase: byId("workflow-phase"),
      status: byId("workflow-status"),
      notice: byId("action-notice"),
      errorCode: byId("error-code"),
      jobId: byId("job-id"),
      backendStatus: byId("backend-status"),
      draftType: byId("draft-entity-type"),
      loadDraft: byId("load-draft-page"),
      nextDraft: byId("next-draft-page"),
      entityList: byId("draft-entity-list"),
      entityId: byId("draft-entity-id"),
      entityJson: byId("draft-json"),
      changeSummary: byId("draft-change-summary"),
      saveEntity: byId("save-draft-entity"),
      deleteEntity: byId("delete-draft-entity"),
      validateDraft: byId("validate-draft"),
      validationJobId: byId("validation-job-id"),
      validationResult: byId("validation-result")
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
      if (state.phase === State.PHASES.REVALIDATING) return "Worker กำลังตรวจ Draft revision ปัจจุบัน";
      if (state.phase === State.PHASES.DRAFT && state.draft && state.draft.validationStatus === "required") return "Draft ถูกแก้แล้ว ต้องตรวจใหม่ก่อนส่ง Review";
      if (state.phase === State.PHASES.DRAFT) return "Draft ผ่าน Validation พร้อมส่ง Review";
      if (state.phase === State.PHASES.INVALID) return "Draft ยังมีข้อผิดพลาด ให้แก้ข้อมูลและสั่งตรวจใหม่";
      if (state.phase === State.PHASES.REVIEW_REQUESTED) return "ส่ง Review แล้ว ต้องใช้บัญชีผู้อนุมัติที่ไม่ใช่ผู้สร้างหรือผู้แก้ล่าสุด";
      if (state.phase === State.PHASES.APPROVED) return "อนุมัติ Draft แล้ว แต่ยังไม่มีการ Publish";
      if (state.phase === State.PHASES.REJECTED) return "Draft ถูกส่งกลับ แก้ไขและตรวจใหม่ก่อน Review";
      return runtime.commandEndpoint
        ? "พร้อมเชื่อม Backend ในสภาพแวดล้อมที่กำหนด"
        : "ยังไม่ได้กำหนด Backend/Authentication และไม่มีการเขียน Production";
    }

    function renderValidation() {
      if (elements.validationJobId) {
        elements.validationJobId.textContent = state.validationJob && state.validationJob.id || "—";
      }
      if (!elements.validationResult) return;
      const report = state.validation;
      if (!report) {
        elements.validationResult.textContent = state.draft && state.draft.validationStatus === "required"
          ? "รอตรวจใหม่หลังการแก้ไข"
          : "ยังไม่มีผลตรวจรอบใหม่";
        return;
      }
      const errors = Array.isArray(report.errors) ? report.errors : [];
      const errorCount = Number.isFinite(report.errorCount) ? report.errorCount : errors.length;
      const warningCount = Number.isFinite(report.warningCount) ? report.warningCount :
        (Array.isArray(report.warnings) ? report.warnings.length : 0);
      const lines = ["ข้อผิดพลาด " + errorCount + " · คำเตือน " + warningCount];
      errors.slice(0, 5).forEach(function (error) {
        lines.push(String(error.code || "validation_error") + " @ " + String(error.path || "$"));
      });
      if (report.truncated === true || errorCount > errors.length) lines.push("แสดงผลแบบจำกัด โปรดใช้รายงาน Backend ฉบับเต็ม");
      elements.validationResult.textContent = lines.join("\n");
    }

    function fillEditorFromSelection() {
      const page = state.draftPage;
      const id = elements.entityList && elements.entityList.value;
      const entry = page && page.entries && page.entries.find(function (item) { return item.entityId === id; });
      if (!entry) return;
      elements.entityId.value = entry.entityId;
      elements.entityJson.value = JSON.stringify(entry.value, null, 2);
    }

    function draftEntryLabel(entry) {
      const value = entry && entry.value || {};
      const label = value.nameTh || value.locationNameTh || value.destinationNameTh ||
        value.shortName || value.routeId || value.locationId || "";
      return label ? entry.entityId + " · " + label : entry.entityId;
    }

    function renderDraftPage() {
      if (!elements.entityList || state.draftPage === renderedPage) return;
      renderedPage = state.draftPage;
      elements.entityList.replaceChildren();
      elements.entityId.value = "";
      elements.entityJson.value = "";
      const entries = state.draftPage && state.draftPage.entries || [];
      entries.forEach(function (entry) {
        const option = documentRef.createElement("option");
        option.value = entry.entityId;
        option.textContent = draftEntryLabel(entry);
        elements.entityList.appendChild(option);
      });
      if (entries.length) {
        elements.entityList.value = entries[0].entityId;
        fillEditorFromSelection();
      }
    }

    function render() {
      const view = State.deriveView(state);
      elements.phase.textContent = state.phase;
      elements.fileName.textContent = state.file ? state.file.name : "ยังไม่ได้เลือกไฟล์";
      elements.fileSize.textContent = state.file ? formatBytes(state.file.size) : "—";
      elements.validate.disabled = !view.canValidate;
      elements.review.disabled = !view.canRequestReview;
      elements.approve.disabled = !view.canApprove;
      elements.reject.disabled = !view.canReject;
      elements.loadDraft.disabled = !view.canLoadDraft;
      elements.nextDraft.disabled = !view.canLoadDraft || !(state.draftPage && state.draftPage.hasMore);
      elements.saveEntity.disabled = !view.canSaveDraft;
      elements.deleteEntity.disabled = !view.canSaveDraft;
      elements.validateDraft.disabled = !view.canValidateDraft;
      elements.status.textContent = statusText();
      elements.errorCode.textContent = state.error ? state.error.code : "none";
      const activeJob = state.validationJob && state.validationJob.id || state.job && state.job.id;
      if (elements.jobId) elements.jobId.textContent = activeJob || "—";
      if (elements.backendStatus) {
        elements.backendStatus.textContent = runtime.commandEndpoint ? "Configured" : "Not configured";
        elements.backendStatus.className = runtime.commandEndpoint ? "online" : "offline";
      }
      elements.notice.dataset.kind = state.error ? "warning" : "neutral";
      documentRef.querySelectorAll("[data-phase]").forEach(function (item) {
        const validationActive = item.dataset.phase === State.PHASES.INVALID &&
          [State.PHASES.INVALID, State.PHASES.REVALIDATING].includes(state.phase);
        item.dataset.active = String(item.dataset.phase === state.phase || validationActive);
      });
      renderDraftPage();
      renderValidation();
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
        await sleep(Math.min(250 * Math.pow(2, Math.min(attempt, 5)), maxPollDelayMs));
      }
      const error = new Error("import_status_timeout");
      error.code = "import_status_timeout";
      throw error;
    }

    async function pollDraftValidation(jobId, generation) {
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (generation !== workflowGeneration) return null;
        const job = await client.send("draft.validation.status", { jobId });
        dispatch({ type: "DRAFT_VALIDATION_STATUS", job });
        if (["completed", "failed"].includes(job.status)) return job;
        await sleep(Math.min(250 * Math.pow(2, Math.min(attempt, 5)), maxPollDelayMs));
      }
      const error = new Error("draft_validation_status_timeout");
      error.code = "draft_validation_status_timeout";
      throw error;
    }

    function commandFailure(error, fallback) {
      if (error && ["greenfield_backend_not_connected", "upload_transport_not_connected"].includes(error.code)) {
        dispatch({ type: "BACKEND_UNAVAILABLE" });
        return;
      }
      dispatch({
        type: "COMMAND_FAILED",
        code: error && error.code || fallback || "command_failed",
        message: error && /^excel_/.test(error.code || "") && error.message
          ? error.message + (Array.isArray(error.details) && error.details.length ? " — " + error.details.slice(0, 3).map(function (item) { return item.message; }).join(" | ") : "")
          : "Backend ไม่สามารถดำเนินงานนี้ได้ กรุณาตรวจรหัสข้อผิดพลาด"
      });
    }

    async function validateSelectedFile() {
      const generation = ++workflowGeneration;
      const scope = operatorScope();
      const isExcel = Boolean(selectedFile && /\.xlsx$/i.test(selectedFile.name));
      const isJson = Boolean(selectedFile && /\.json$/i.test(selectedFile.name));
      if (!selectedFile || (!isJson && !isExcel) || scope.length === 0) {
        dispatch({
          type: "COMMAND_FAILED",
          code: !selectedFile || (!isJson && !isExcel) ? "excel_or_json_required" : "operator_scope_required",
          message: !selectedFile || (!isJson && !isExcel)
            ? "กรุณาเลือก Excel รุ่น 3.3.4–3.3.5 หรือ Canonical JSON"
            : "กรุณาระบุ Stable Operator ID อย่างน้อยหนึ่งรายการ"
        });
        return;
      }
      state = State.reduce(state, { type: "START_VALIDATION" });
      render();
      if (state.phase !== State.PHASES.VALIDATING) return;
      try {
        let uploadFile = selectedFile;
        if (isExcel) {
          if (!Excel33x || typeof Excel33x.convertFileToCanonical !== "function") {
            const unavailable = new Error("ตัวอ่าน Excel ยังไม่พร้อมใช้งาน");
            unavailable.code = "excel_converter_unavailable";
            throw unavailable;
          }
          if (elements.excelPrecheck) elements.excelPrecheck.textContent = "กำลังตรวจข้อมูลในไฟล์";
          const converted = await Excel33x.convertFileToCanonical(selectedFile, { operatorScope: scope });
          uploadFile = converted.file;
          if (elements.excelVersion) elements.excelVersion.textContent = converted.version;
          if (elements.excelPrecheck) {
            elements.excelPrecheck.textContent = converted.warnings.length
              ? "ผ่านสำหรับข้อมูลเครือข่าย · มีคำเตือน " + converted.warnings.length + " รายการ"
              : "ผ่าน พร้อมสร้าง Draft";
          }
        } else {
          if (elements.excelVersion) elements.excelVersion.textContent = "Canonical JSON";
          if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ส่งให้ Backend ตรวจ";
        }
        const checksum = await checksumSha256(uploadFile);
        const authorization = await client.send("upload.authorize", {
          fileName: uploadFile.name,
          contentType: "application/json",
          sizeBytes: uploadFile.size,
          checksumSha256: checksum,
          operatorScope: scope
        });
        await client.upload(uploadFile, authorization.target);
        const queued = await client.send("import.start", { operatorScope: scope, source: authorization.source });
        dispatch({ type: "IMPORT_QUEUED", jobId: queued.jobId, status: queued.status });
        const job = await pollImport(queued.jobId, generation);
        if (!job) return;
        if (job.status === "completed") {
          dispatch({
            type: "VALIDATION_SUCCEEDED",
            draftId: job.draftId,
            revision: 1,
            report: job.validation || { errors: [], warnings: [], errorCount: 0, warningCount: 0 }
          });
        } else {
          dispatch({ type: "VALIDATION_FAILED", report: job.validation });
        }
      } catch (error) {
        if (elements.excelPrecheck && isExcel) elements.excelPrecheck.textContent = "ไม่ผ่าน กรุณาตรวจรายละเอียด";
        commandFailure(error);
      }
    }

    async function loadDraftPage(cursor) {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "draft_required" });
      dispatch({ type: "COMMAND_STARTED" });
      try {
        const page = await client.send("draft.read", {
          draftId: state.draft.id,
          expectedRevision: state.draft.revision,
          operatorScope: operatorScope(),
          entityType: elements.draftType.value,
          cursor: cursor || null,
          limit: 25
        });
        dispatch({ type: "DRAFT_PAGE_LOADED", page });
      } catch (error) {
        commandFailure(error);
      }
    }

    async function saveDraftOperation(value) {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "draft_required" });
      const entityId = elements.entityId.value.trim();
      const changeSummary = elements.changeSummary.value.trim();
      if (!entityId || changeSummary.length < 3) {
        return dispatch({
          type: "COMMAND_FAILED",
          code: !entityId ? "draft_entity_target_invalid" : "change_summary_invalid",
          message: "กรุณาระบุ Stable ID และเหตุผลการแก้ไขอย่างน้อย 3 ตัวอักษร"
        });
      }
      dispatch({ type: "COMMAND_STARTED" });
      try {
        const result = await client.send("draft.save", {
          draftId: state.draft.id,
          expectedRevision: state.draft.revision,
          operatorScope: operatorScope(),
          changeSummary,
          operations: [{ entityType: elements.draftType.value, entityId, value }]
        });
        elements.changeSummary.value = "";
        dispatch({ type: "DRAFT_SAVED", revision: result.revision });
      } catch (error) {
        commandFailure(error);
      }
    }

    async function saveDraftEntity() {
      let value;
      try {
        value = JSON.parse(elements.entityJson.value);
      } catch (_error) {
        return dispatch({ type: "COMMAND_FAILED", code: "draft_json_invalid", message: "JSON ไม่ถูกต้อง กรุณาตรวจวงเล็บและเครื่องหมายคำพูด" });
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return dispatch({ type: "COMMAND_FAILED", code: "draft_entity_value_invalid", message: "ข้อมูลรายการต้องเป็น JSON object" });
      }
      return saveDraftOperation(value);
    }

    async function validateDraft() {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "draft_required" });
      const generation = ++workflowGeneration;
      dispatch({ type: "COMMAND_STARTED" });
      try {
        const queued = await client.send("draft.validate", {
          draftId: state.draft.id,
          expectedRevision: state.draft.revision,
          operatorScope: operatorScope()
        });
        dispatch({ type: "DRAFT_VALIDATION_QUEUED", jobId: queued.jobId, status: queued.status });
        await pollDraftValidation(queued.jobId, generation);
      } catch (error) {
        commandFailure(error);
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
        commandFailure(error);
      }
    }

    async function decideApproval(decision) {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "approval_blocked" });
      const comment = elements.approvalComment.value.trim();
      if (decision === "reject" && comment.length < 3) {
        return dispatch({ type: "COMMAND_FAILED", code: "rejection_comment_required", message: "กรุณาระบุเหตุผลที่ส่งกลับอย่างน้อย 3 ตัวอักษร" });
      }
      dispatch({ type: "COMMAND_STARTED" });
      try {
        const result = await client.send("approval.decide", {
          draftId: state.draft.id,
          expectedRevision: state.draft.revision,
          operatorScope: operatorScope(),
          decision,
          comment
        });
        dispatch({ type: "APPROVAL_DECIDED", decision, revision: result.revision });
      } catch (error) {
        commandFailure(error);
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
      if (elements.excelVersion) elements.excelVersion.textContent = /\.xlsx$/i.test(file.name) ? "รอตรวจจากชีต 91 ช่อง C5" : "Canonical JSON";
      if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ยังไม่ได้ตรวจ";
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
      renderedPage = null;
      elements.file.value = "";
      elements.changeSummary.value = "";
      elements.approvalComment.value = "";
      if (elements.excelVersion) elements.excelVersion.textContent = "รอตรวจ";
      if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ยังไม่ได้ตรวจ";
      dispatch({ type: "RESET" });
    });
    elements.loadDraft.addEventListener("click", function () { loadDraftPage(null); });
    elements.nextDraft.addEventListener("click", function () {
      loadDraftPage(state.draftPage && state.draftPage.nextCursor);
    });
    elements.draftType.addEventListener("change", function () {
      renderedPage = null;
      elements.entityList.replaceChildren();
      elements.entityId.value = "";
      elements.entityJson.value = "";
    });
    elements.entityList.addEventListener("change", fillEditorFromSelection);
    elements.saveEntity.addEventListener("click", saveDraftEntity);
    elements.deleteEntity.addEventListener("click", function () { saveDraftOperation(null); });
    elements.validateDraft.addEventListener("click", validateDraft);
    elements.review.addEventListener("click", requestReview);
    elements.approve.addEventListener("click", function () { decideApproval("approve"); });
    elements.reject.addEventListener("click", function () { decideApproval("reject"); });
    bindNavigation();
    render();

    return Object.freeze({
      decideApproval,
      dispatch,
      getState: function () { return state; },
      loadDraftPage,
      pollDraftValidation,
      pollImport,
      requestReview,
      saveDraftEntity,
      validateDraft,
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
