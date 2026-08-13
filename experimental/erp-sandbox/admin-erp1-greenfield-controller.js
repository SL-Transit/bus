(function (root) {
  "use strict";

  const State = root.SLTransitGreenfieldState;
  const Api = root.SLTransitGreenfieldApi;
  const Excel33x = root.SLTransitAdminErpExcel33x;
  const DraftPreview = root.SLTransitGreenfieldDraftPreview;
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
    const sandboxPreviewEnabled = !transport && DraftPreview && typeof DraftPreview.createDraftReview === "function";
    const sleep = settings.sleep || function (milliseconds) {
      return new Promise(function (resolve) { root.setTimeout(resolve, milliseconds); });
    };
    const maxPollAttempts = settings.maxPollAttempts || 40;
    const maxPollDelayMs = settings.maxPollDelayMs || 5000;
    let state = State.initialState();
    let selectedFile = null;
    let workflowGeneration = 0;
    let renderedPage = null;
    let previewDraft = null;

    const byId = function (id) { return documentRef.getElementById(id); };
    const elements = {
      file: byId("import-file"),
      operatorScope: byId("operator-scope"),
      fileName: byId("file-name"),
      fileSize: byId("file-size"),
      excelVersion: byId("excel-version"),
      excelPrecheck: byId("excel-precheck"),
      excelReadiness: byId("excel-readiness"),
      excelReadinessStatus: byId("excel-readiness-status"),
      excelBlockingCount: byId("excel-blocking-count"),
      excelWarningCount: byId("excel-warning-count"),
      excelBlockingList: byId("excel-blocking-list"),
      excelWarningList: byId("excel-warning-list"),
      excelFrequencyGate: byId("excel-frequency-gate"),
      excelFrequencyGateStatus: byId("excel-frequency-gate-status"),
      excelTransferGate: byId("excel-transfer-gate"),
      excelTransferGateStatus: byId("excel-transfer-gate-status"),
      excelSummary: {
        operators: byId("excel-summary-operators"),
        locations: byId("excel-summary-locations"),
        routes: byId("excel-summary-routes"),
        journeyPatterns: byId("excel-summary-patterns"),
        fixedTrips: byId("excel-summary-fixed-trips"),
        stopTimes: byId("excel-summary-stop-times"),
        frequencyServices: byId("excel-summary-frequency"),
        fareRules: byId("excel-summary-fares"),
        transferRules: byId("excel-summary-transfers")
      },
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
      validationResult: byId("validation-result"),
      reviewMode: byId("draft-review-mode"),
      reviewDraftId: byId("draft-review-id"),
      reviewStatus: byId("draft-review-status"),
      reviewSchema: byId("draft-review-schema"),
      reviewMapping: byId("draft-review-mapping"),
      reviewChecksum: byId("draft-review-checksum"),
      reviewEntityCount: byId("draft-review-entity-count"),
      reviewCounts: byId("draft-review-counts"),
      reviewPrivacy: byId("draft-review-privacy")
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

    function renderIssueList(container, issues, emptyText) {
      if (!container) return;
      container.replaceChildren();
      const values = Array.isArray(issues) ? issues : [];
      if (!values.length) {
        const empty = documentRef.createElement("p");
        empty.className = "issue-empty";
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
      }
      const visible = values.slice(0, 200);
      const groups = new Map();
      visible.forEach(function (issue) {
        const sheetName = issue.sheetName || "ข้อมูลกลาง";
        if (!groups.has(sheetName)) groups.set(sheetName, []);
        groups.get(sheetName).push(issue);
      });
      groups.forEach(function (sheetIssues, sheetName) {
        const group = documentRef.createElement("section");
        group.className = "issue-sheet";
        const heading = documentRef.createElement("h5");
        heading.textContent = sheetName + " · " + sheetIssues.length + " รายการ";
        const list = documentRef.createElement("ol");
        sheetIssues.forEach(function (issue) {
          const item = documentRef.createElement("li");
          const code = documentRef.createElement("strong");
          const message = documentRef.createElement("p");
          const location = documentRef.createElement("small");
          code.textContent = issue.code || "excel.validation_error";
          message.textContent = issue.message || "ข้อมูลไม่ผ่านการตรวจ";
          const parts = [];
          if (Number.isFinite(issue.rowNumber)) parts.push("แถว " + issue.rowNumber);
          if (issue.sourceColumn) parts.push("คอลัมน์ " + issue.sourceColumn);
          if (!parts.length && issue.path) parts.push("ตำแหน่ง " + issue.path);
          location.textContent = parts.length ? parts.join(" · ") : "ไม่ระบุตำแหน่ง";
          item.appendChild(code);
          item.appendChild(message);
          item.appendChild(location);
          list.appendChild(item);
        });
        group.appendChild(heading);
        group.appendChild(list);
        container.appendChild(group);
      });
      if (values.length > visible.length) {
        const limited = documentRef.createElement("p");
        limited.className = "issue-limit";
        limited.textContent = "แสดง 200 รายการแรกจากทั้งหมด " + values.length + " รายการ";
        container.appendChild(limited);
      }
    }

    function renderReadinessGate(container, statusElement, gate, readyText, blockedText) {
      if (!container || !statusElement) return;
      const value = gate || { status: "ready", issueCount: 0 };
      container.dataset.kind = value.status;
      statusElement.textContent = value.status === "blocked"
        ? blockedText + " " + value.issueCount + " รายการ"
        : readyText;
    }

    function renderExcelReadiness(report) {
      if (!elements.excelReadiness || !report) return;
      elements.excelReadiness.dataset.kind = report.status || "idle";
      if (elements.excelReadinessStatus) {
        elements.excelReadinessStatus.textContent = report.status === "blocked"
          ? "ยังไม่พร้อมสร้าง Draft"
          : (report.status === "ready_with_warnings" ? "พร้อมสร้าง Draft โดยมีคำเตือน" : "พร้อมสร้าง Draft");
      }
      if (elements.excelBlockingCount) elements.excelBlockingCount.textContent = String(report.blockingCount || 0);
      if (elements.excelWarningCount) elements.excelWarningCount.textContent = String(report.warningCount || 0);
      const summary = report.summary || {};
      Object.keys(elements.excelSummary).forEach(function (key) {
        const target = elements.excelSummary[key];
        if (target) target.textContent = String(summary[key] || 0);
      });
      renderReadinessGate(elements.excelFrequencyGate, elements.excelFrequencyGateStatus, report.gates && report.gates.frequency, "ผ่าน: รูปแบบความถี่/คิวสอดคล้องกับข้อมูลที่มี", "ต้องแก้กติกา GRP-001");
      renderReadinessGate(elements.excelTransferGate, elements.excelTransferGateStatus, report.gates && report.gates.transfers, "ผ่าน: กฎการต่อรถเพียงพอตามข้อมูลที่มี", "ต้องแก้กฎการต่อรถ");
      renderIssueList(elements.excelBlockingList, report.errors, "ไม่พบรายการที่ขวางการสร้าง Draft");
      renderIssueList(elements.excelWarningList, report.warnings, "ไม่มีคำเตือน");
    }

    function clearExcelReadiness(message) {
      if (!elements.excelReadiness) return;
      elements.excelReadiness.dataset.kind = "idle";
      if (elements.excelReadinessStatus) elements.excelReadinessStatus.textContent = message || "รอตรวจไฟล์ Excel";
      if (elements.excelBlockingCount) elements.excelBlockingCount.textContent = "0";
      if (elements.excelWarningCount) elements.excelWarningCount.textContent = "0";
      Object.keys(elements.excelSummary).forEach(function (key) { if (elements.excelSummary[key]) elements.excelSummary[key].textContent = "0"; });
      if (elements.excelFrequencyGate) elements.excelFrequencyGate.dataset.kind = "idle";
      if (elements.excelTransferGate) elements.excelTransferGate.dataset.kind = "idle";
      if (elements.excelFrequencyGateStatus) elements.excelFrequencyGateStatus.textContent = "รอตรวจข้อมูล Frequency/Queue";
      if (elements.excelTransferGateStatus) elements.excelTransferGateStatus.textContent = "รอตรวจกฎการต่อรถ";
      renderIssueList(elements.excelBlockingList, [], "ยังไม่มีผลตรวจ");
      renderIssueList(elements.excelWarningList, [], "ยังไม่มีผลตรวจ");
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
      if (sandboxPreviewEnabled && state.phase === State.PHASES.DRAFT) return "สร้าง Draft ทดลองในหน่วยความจำแล้ว พร้อมตรวจรายละเอียดและส่งสถานะ Review";
      if (state.phase === State.PHASES.DRAFT) return "Draft ผ่าน Validation พร้อมส่ง Review";
      if (state.phase === State.PHASES.INVALID) return "Draft ยังมีข้อผิดพลาด ให้แก้ข้อมูลและสั่งตรวจใหม่";
      if (sandboxPreviewEnabled && state.phase === State.PHASES.REVIEW_REQUESTED) return "บันทึกสถานะ Review ใน Sandbox แล้ว ข้อมูลจะหายเมื่อรีเฟรชและยังไม่ใช่ Owner Approval";
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
      if (state.draftPage && state.draftPage.redacted) {
        elements.entityJson.value = "ข้อมูลปฏิบัติการและข้อมูลส่วนตัวถูกซ่อนจาก Memory-only Review";
        return;
      }
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
    function renderDraftReview() {
      const review = previewDraft && DraftPreview && DraftPreview.publicReview(previewDraft);
      const counts = review && review.summary || {};
      const labels = [
        ["operators", "บริษัท"], ["locations", "ป้าย"], ["routes", "เส้นทาง"],
        ["journeyPatterns", "รูปแบบ"], ["fixedTrips", "Fixed"],
        ["frequencyServices", "Frequency"], ["fareRules", "ค่าโดยสาร"],
        ["transferRules", "จุดต่อรถ"]
      ];
      if (elements.reviewMode) elements.reviewMode.textContent = review ? "Memory-only Sandbox" : "รอสร้าง Draft";
      if (elements.reviewDraftId) elements.reviewDraftId.textContent = review && review.draftId || "—";
      if (elements.reviewStatus) elements.reviewStatus.textContent = review && review.status || "—";
      if (elements.reviewSchema) elements.reviewSchema.textContent = review ? review.schemaVersion + " · Excel " + review.templateVersion : "—";
      if (elements.reviewMapping) elements.reviewMapping.textContent = review && review.mappingVersion || "—";
      if (elements.reviewChecksum) elements.reviewChecksum.textContent = review && review.sourceChecksumSha256 || "—";
      if (elements.reviewEntityCount) elements.reviewEntityCount.textContent = review ? String(review.entityCount) : "0";
      if (elements.reviewCounts) {
        elements.reviewCounts.textContent = review
          ? labels.map(function (item) { return item[1] + " " + String(counts[item[0]] || 0); }).join(" · ")
          : "ยังไม่มีข้อมูล";
      }
      if (elements.reviewPrivacy) {
        elements.reviewPrivacy.textContent = review && review.operationalRecordsExcluded
          ? "ซ่อนข้อมูลปฏิบัติการ บัญชีผู้ใช้ สิทธิ์ คนขับ และข้อมูลส่วนตัว"
          : "รอสร้าง Draft";
      }
    }

    function render() {
      const view = State.deriveView(state);
      elements.phase.textContent = state.phase;
      elements.fileName.textContent = state.file ? state.file.name : "ยังไม่ได้เลือกไฟล์";
      elements.fileSize.textContent = state.file ? formatBytes(state.file.size) : "—";
      elements.validate.disabled = !view.canValidate;
      elements.review.disabled = !view.canRequestReview;
      elements.review.textContent = sandboxPreviewEnabled ? "บันทึกสถานะ Review ใน Sandbox" : "ส่ง Review";
      elements.approve.disabled = Boolean(previewDraft) || !view.canApprove;
      elements.reject.disabled = Boolean(previewDraft) || !view.canReject;
      elements.loadDraft.disabled = !view.canLoadDraft;
      elements.nextDraft.disabled = !view.canLoadDraft || !(state.draftPage && state.draftPage.hasMore);
      elements.saveEntity.disabled = Boolean(previewDraft) || !view.canSaveDraft;
      elements.deleteEntity.disabled = Boolean(previewDraft) || !view.canSaveDraft;
      elements.validateDraft.disabled = Boolean(previewDraft) || !view.canValidateDraft;
      elements.status.textContent = statusText();
      elements.errorCode.textContent = state.error ? state.error.code : "none";
      const activeJob = state.validationJob && state.validationJob.id || state.job && state.job.id;
      if (elements.jobId) elements.jobId.textContent = activeJob || "—";
      if (elements.backendStatus) {
        elements.backendStatus.textContent = runtime.commandEndpoint ? "Configured" : (sandboxPreviewEnabled ? "Memory-only Sandbox" : "Not configured");
        elements.backendStatus.className = runtime.commandEndpoint || sandboxPreviewEnabled ? "online" : "offline";
      }
      elements.notice.dataset.kind = state.error ? "warning" : "neutral";
      documentRef.querySelectorAll("[data-phase]").forEach(function (item) {
        const validationActive = item.dataset.phase === State.PHASES.INVALID &&
          [State.PHASES.INVALID, State.PHASES.REVALIDATING].includes(state.phase);
        item.dataset.active = String(item.dataset.phase === state.phase || validationActive);
      });
      renderDraftPage();
      renderValidation();
      renderDraftReview();
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
        let canonicalPackage = null;
        let mappingVersion = "canonical-json";
        if (isExcel) {
          if (!Excel33x || typeof Excel33x.convertFileToCanonical !== "function") {
            const unavailable = new Error("ตัวอ่าน Excel ยังไม่พร้อมใช้งาน");
            unavailable.code = "excel_converter_unavailable";
            throw unavailable;
          }
          if (elements.excelPrecheck) elements.excelPrecheck.textContent = "กำลังตรวจข้อมูลในไฟล์";
          const converted = await Excel33x.convertFileToCanonical(selectedFile, { operatorScope: scope });
          renderExcelReadiness(converted.report);
          uploadFile = converted.file;
          canonicalPackage = converted.package;
          mappingVersion = converted.mappingVersion;
          if (elements.excelVersion) elements.excelVersion.textContent = converted.version;
          if (elements.excelPrecheck) {
            elements.excelPrecheck.textContent = converted.warnings.length
              ? "ผ่านสำหรับข้อมูลเครือข่าย · มีคำเตือน " + converted.warnings.length + " รายการ"
              : "ผ่าน พร้อมสร้าง Draft";
          }
        } else {
          if (elements.excelVersion) elements.excelVersion.textContent = "Canonical JSON";
          if (sandboxPreviewEnabled) {
            try {
              canonicalPackage = JSON.parse(await selectedFile.text());
            } catch (_error) {
              const invalidJson = new Error("Canonical JSON อ่านไม่ได้");
              invalidJson.code = "excel_canonical_json_invalid";
              throw invalidJson;
            }
          }
          if (elements.excelPrecheck) elements.excelPrecheck.textContent = sandboxPreviewEnabled ? "กำลังตรวจ Canonical JSON" : "ส่งให้ Backend ตรวจ";
        }
        if (sandboxPreviewEnabled) {
          const preview = DraftPreview.createDraftReview({ package: canonicalPackage, mappingVersion });
          if (!preview.ok) {
            if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ไม่ผ่าน Validation จึงไม่สร้าง Draft";
            dispatch({ type: "VALIDATION_FAILED", report: preview.report || { errors: preview.errors || [], warnings: [] } });
            return;
          }
          previewDraft = preview.draft;
          if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ผ่าน · สร้าง Draft ทดลองในหน่วยความจำแล้ว";
          dispatch({
            type: "VALIDATION_SUCCEEDED",
            draftId: previewDraft.draftId,
            revision: previewDraft.revision,
            report: preview.report
          });
          return;
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
        if (error && error.report) renderExcelReadiness(error.report);
        if (elements.excelPrecheck && isExcel) elements.excelPrecheck.textContent = "ไม่ผ่าน กรุณาตรวจรายละเอียด";
        commandFailure(error);
      }
    }

    async function loadDraftPage(cursor) {
      if (!state.draft) return dispatch({ type: "COMMAND_FAILED", code: "draft_required" });
      dispatch({ type: "COMMAND_STARTED" });
      try {
        if (previewDraft) {
          const previewPage = DraftPreview.readPage(previewDraft, {
            entityType: elements.draftType.value,
            cursor: cursor || null,
            limit: 25
          });
          dispatch({ type: "DRAFT_PAGE_LOADED", page: previewPage });
          return;
        }
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
      if (previewDraft) return dispatch({ type: "COMMAND_FAILED", code: "sandbox_preview_read_only", message: "Memory-only Review เปิดให้อ่านเท่านั้น" });
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
      if (previewDraft) return dispatch({ type: "COMMAND_FAILED", code: "sandbox_preview_already_validated", message: "Draft ทดลองผ่าน Canonical Validation แล้ว" });
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
        if (previewDraft) {
          const previewResult = DraftPreview.requestReview(previewDraft);
          dispatch({ type: "REQUEST_REVIEW", revision: previewResult.revision });
          return;
        }
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
      if (previewDraft) return dispatch({ type: "COMMAND_FAILED", code: "sandbox_owner_approval_disabled", message: "Sandbox ไม่อนุญาต Owner Approval หรือ Publish" });
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
      previewDraft = null;
      if (!file) return dispatch({ type: "RESET" });
      if (elements.excelVersion) elements.excelVersion.textContent = /\.xlsx$/i.test(file.name) ? "รอตรวจจากชีต 91 ช่อง C5" : "Canonical JSON";
      if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ยังไม่ได้ตรวจ";
      clearExcelReadiness(/\.xlsx$/i.test(file.name) ? "รอตรวจไฟล์ Excel" : "Canonical JSON จะให้ Backend ตรวจ");
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
      previewDraft = null;
      elements.file.value = "";
      elements.changeSummary.value = "";
      elements.approvalComment.value = "";
      if (elements.excelVersion) elements.excelVersion.textContent = "รอตรวจ";
      if (elements.excelPrecheck) elements.excelPrecheck.textContent = "ยังไม่ได้ตรวจ";
      clearExcelReadiness();
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
      getDraftReview: function () { return previewDraft && DraftPreview.publicReview(previewDraft); },
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
