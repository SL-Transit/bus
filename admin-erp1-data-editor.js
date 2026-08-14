(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SLTransitAdminErpDataEditor = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_SHIFT_MINUTES = 720;
  const MAX_BULK_OPERATIONS = 100;
  const SERVICE_TIME_PATTERN = /^(?:[0-3]?\d|4[0-7]):[0-5]\d:[0-5]\d$/;

  const ENTITIES = Object.freeze({
    operators: { label: "บริษัท", idField: "operatorId" },
    locations: { label: "สถานที่และป้ายกลาง", idField: "locationId" },
    routes: { label: "เส้นทาง", idField: "routeId" },
    journeyPatterns: { label: "รูปแบบเส้นทาง", idField: "journeyPatternId" },
    serviceCalendars: { label: "วันให้บริการ", idField: "serviceCalendarId" },
    fixedTrips: { label: "เที่ยวเวลาคงที่", idField: "fixedTripId", schedule: "fixed" },
    stopTimes: { label: "เวลารายป้าย", idField: "stopTimeId", schedule: "fixed" },
    frequencyServices: { label: "บริการตามความถี่", idField: "frequencyServiceId", schedule: "frequency" },
    fareProducts: { label: "ผลิตภัณฑ์ค่าโดยสาร", idField: "fareProductId" },
    fareRules: { label: "กฎค่าโดยสาร", idField: "fareRuleId" },
    transferRules: { label: "กฎการต่อรถ", idField: "transferRuleId" },
    serviceGroups: { label: "กลุ่มบริการและท่ารถ", idField: "serviceGroupId" },
    queues: { label: "คิวและจุดจอด", idField: "queueId" },
    vehicles: { label: "รถ", idField: "vehicleId" },
    drivers: { label: "คนขับ", idField: "driverId" },
    vehicleBlocks: { label: "กะรถ", idField: "vehicleBlockId" },
    driverDuties: { label: "กะคนขับ", idField: "driverDutyId" },
    assignments: { label: "การจัดสรร", idField: "assignmentId" },
    bookingPolicies: { label: "กฎการจอง", idField: "bookingPolicyId" },
    platformAssignments: { label: "การใช้ชานชาลา", idField: "platformAssignmentId" },
    calendarExceptions: { label: "วันพิเศษ", idField: "calendarExceptionId" },
    routeDrafts: { label: "ร่างเส้นทาง", idField: "draftRouteId" },
    routeDraftStops: { label: "ลำดับป้ายร่าง", idField: "routeStopRowId" },
    locationSurveys: { label: "แบบสำรวจจุดบริการ", idField: "surveyId" },
    locationAccesses: { label: "สิทธิ์ใช้จุด", idField: "locationAccessId" },
    accounts: { label: "บัญชีผู้ใช้", idField: "userId" },
    accountAccesses: { label: "สิทธิ์ผู้ใช้", idField: "userAccessId" },
    incidents: { label: "เหตุขัดข้อง", idField: "incidentId" }
  });

  const FIELD_LABELS = Object.freeze({
    operatorId: "รหัสบริษัท", nameTh: "ชื่อภาษาไทย", operatorNameTh: "ชื่อบริษัทภาษาไทย",
    operatorNameEn: "ชื่อบริษัทภาษาอังกฤษ", timezone: "เขตเวลา", locationId: "รหัสป้าย/สถานที่",
    locationType: "ประเภทจุด", parentLocationId: "ป้ายกลาง/สถานที่แม่", latitude: "ละติจูด",
    longitude: "ลองจิจูด", routeId: "รหัสเส้นทาง", shortName: "ชื่อย่อเส้นทาง",
    nameEn: "ชื่อภาษาอังกฤษ", serviceMode: "รูปแบบบริการ", journeyPatternId: "รหัสรูปแบบเส้นทาง",
    direction: "ทิศทาง", stops: "ลำดับป้าย", serviceCalendarId: "รหัสวันให้บริการ",
    startDate: "วันที่เริ่มใช้", endDate: "วันที่สิ้นสุด", weekdays: "วันให้บริการ",
    fixedTripId: "รหัสเที่ยว", departureTime: "เวลาออก", stopTimeId: "รหัสเวลารายป้าย",
    stopSequence: "ลำดับป้าย", arrivalTime: "เวลาถึง", frequencyServiceId: "รหัสบริการความถี่",
    startTime: "เวลาเริ่มบริการ", endTime: "เวลาสิ้นสุดบริการ", headwaySeconds: "ระยะห่างระหว่างรถ (วินาที)",
    boardingModel: "รูปแบบขึ้นรถ", exactTimes: "ออกตรงเวลาที่ระบุ", fareProductId: "รหัสค่าโดยสาร",
    currency: "สกุลเงิน", fareRuleId: "รหัสกฎค่าโดยสาร", originLocationId: "จุดต้นทาง",
    destinationLocationId: "จุดปลายทาง", amountMinor: "ราคา (หน่วยย่อย)", transferRuleId: "รหัสกฎต่อรถ",
    fromLocationId: "จุดต่อรถต้นทาง", toLocationId: "จุดต่อรถปลายทาง",
    minimumTransferSeconds: "เวลาต่อรถขั้นต่ำ (วินาที)", maximumTransferSeconds: "เวลาต่อรถสูงสุด (วินาที)",
    throughBooking: "จองต่อเนื่องได้", baggageTransfer: "ส่งต่อสัมภาระได้", operatorScope: "ขอบเขตบริษัท",
    recordStatus: "สถานะข้อมูล", effectiveFrom: "เริ่มมีผล", effectiveTo: "สิ้นสุดผล",
    sourceRowId: "แถวต้นทาง", changeReason: "เหตุผลที่เปลี่ยน", validationStatus: "ผลตรวจ",
    capacity: "ความจุ", bookingEnabled: "เปิดรับจอง", locationNameTh: "ชื่อป้าย",
    originNameTh: "ชื่อต้นทาง", destinationNameTh: "ชื่อปลายทาง"
  });

  const ENUMS = Object.freeze({
    serviceMode: ["fixed", "frequency", "hybrid"],
    locationType: ["station", "stop", "hub", "depot", "queuePoint"],
    direction: ["outbound", "inbound", "circular", "other"],
    boardingModel: ["queue", "frequency"]
  });

  const WEEKDAYS = Object.freeze([
    ["monday", "จันทร์"], ["tuesday", "อังคาร"], ["wednesday", "พุธ"],
    ["thursday", "พฤหัสบดี"], ["friday", "ศุกร์"], ["saturday", "เสาร์"], ["sunday", "อาทิตย์"]
  ]);

  function entityConfig(entityType) {
    return ENTITIES[entityType] || { label: entityType, idField: null };
  }

  function newRecord(entityType) {
    const config = entityConfig(entityType);
    if (!config.idField) {
      const error = new Error("draft_entity_type_invalid");
      error.code = "draft_entity_type_invalid";
      throw error;
    }
    const value = {};
    value[config.idField] = "";
    if (entityType === "operators") Object.assign(value, { nameTh: "", timezone: "Asia/Bangkok" });
    if (entityType === "locations") Object.assign(value, { locationType: "stop", nameTh: "" });
    if (entityType === "routes") Object.assign(value, { operatorId: "", shortName: "", serviceMode: "fixed" });
    if (entityType === "journeyPatterns") Object.assign(value, { routeId: "", direction: "outbound", stops: [] });
    if (entityType === "serviceCalendars") Object.assign(value, { startDate: "", endDate: "", weekdays: { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false } });
    if (entityType === "fixedTrips") Object.assign(value, { routeId: "", journeyPatternId: "", serviceCalendarId: "", departureTime: "06:00:00" });
    if (entityType === "stopTimes") Object.assign(value, { fixedTripId: "", stopSequence: 1, locationId: "", arrivalTime: "06:00:00", departureTime: "06:00:00" });
    if (entityType === "frequencyServices") Object.assign(value, { routeId: "", journeyPatternId: "", serviceCalendarId: "", startTime: "06:00:00", endTime: "18:00:00", headwaySeconds: 600, boardingModel: "queue", exactTimes: false });
    if (entityType === "fareProducts") Object.assign(value, { nameTh: "", currency: "THB" });
    if (entityType === "fareRules") Object.assign(value, { fareProductId: "", routeId: "", originLocationId: "", destinationLocationId: "", amountMinor: 0 });
    if (entityType === "transferRules") Object.assign(value, { fromLocationId: "", toLocationId: "", minimumTransferSeconds: 300, maximumTransferSeconds: 1800, throughBooking: false, baggageTransfer: false });
    return { entityId: "", value, isNew: true };
  }

  function fieldLabel(fieldName) {
    if (FIELD_LABELS[fieldName]) return FIELD_LABELS[fieldName];
    return String(fieldName || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, function (letter) {
      return letter.toUpperCase();
    });
  }

  function serviceTimeToSeconds(value) {
    const text = String(value || "");
    if (!SERVICE_TIME_PATTERN.test(text)) {
      const error = new Error("service_time_invalid");
      error.code = "service_time_invalid";
      throw error;
    }
    const parts = text.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  function secondsToServiceTime(totalSeconds) {
    if (!Number.isInteger(totalSeconds) || totalSeconds < 0 || totalSeconds >= 48 * 3600) {
      const error = new Error("service_time_out_of_range");
      error.code = "service_time_out_of_range";
      throw error;
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(function (part) { return String(part).padStart(2, "0"); }).join(":");
  }

  function shiftServiceTime(value, minutes) {
    if (!Number.isInteger(minutes) || Math.abs(minutes) > MAX_SHIFT_MINUTES) {
      const error = new Error("shift_minutes_invalid");
      error.code = "shift_minutes_invalid";
      throw error;
    }
    return secondsToServiceTime(serviceTimeToSeconds(value) + minutes * 60);
  }

  function shiftedRecord(entityType, value, minutes) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      const error = new Error("draft_entity_value_invalid");
      error.code = "draft_entity_value_invalid";
      throw error;
    }
    const result = Object.assign({}, value);
    if (entityType === "fixedTrips") {
      result.departureTime = shiftServiceTime(value.departureTime, minutes);
      return result;
    }
    if (entityType === "stopTimes") {
      result.arrivalTime = shiftServiceTime(value.arrivalTime, minutes);
      result.departureTime = shiftServiceTime(value.departureTime, minutes);
      return result;
    }
    const error = new Error("time_shift_entity_unsupported");
    error.code = "time_shift_entity_unsupported";
    throw error;
  }

  function validateRecord(entityType, value) {
    const item = value || {};
    const config = entityConfig(entityType);
    if (!config.idField || typeof item[config.idField] !== "string" || !item[config.idField].trim()) {
      const idError = new Error("draft_entity_target_invalid");
      idError.code = "draft_entity_target_invalid";
      throw idError;
    }
    if (entityType === "fixedTrips") serviceTimeToSeconds(item.departureTime);
    if (entityType === "stopTimes") {
      const arrival = serviceTimeToSeconds(item.arrivalTime);
      const departure = serviceTimeToSeconds(item.departureTime);
      if (arrival > departure) {
        const orderError = new Error("stop_time_order_invalid");
        orderError.code = "stop_time_order_invalid";
        throw orderError;
      }
    }
    if (entityType === "frequencyServices") {
      const start = serviceTimeToSeconds(item.startTime);
      const end = serviceTimeToSeconds(item.endTime);
      if (start >= end) {
        const windowError = new Error("frequency_window_invalid");
        windowError.code = "frequency_window_invalid";
        throw windowError;
      }
      if (!Number.isInteger(item.headwaySeconds) || item.headwaySeconds < 60 || item.headwaySeconds > 86400) {
        const headwayError = new Error("frequency_headway_invalid");
        headwayError.code = "frequency_headway_invalid";
        throw headwayError;
      }
    }
    return value;
  }

  function buildTimeShiftOperations(entityType, entries, minutes) {
    const list = Array.isArray(entries) ? entries : [];
    if (list.length < 1 || list.length > MAX_BULK_OPERATIONS) {
      const error = new Error("bulk_operation_count_invalid");
      error.code = "bulk_operation_count_invalid";
      throw error;
    }
    return list.map(function (entry) {
      return {
        entityType,
        entityId: entry.entityId,
        value: shiftedRecord(entityType, entry.value, minutes)
      };
    });
  }

  function recordName(entry) {
    const value = entry && entry.value || {};
    return value.nameTh || value.operatorNameTh || value.locationNameTh || value.routeLongNameTh ||
      value.destinationNameTh || value.displayName || value.shortName || entry.entityId || "—";
  }

  function recordDetail(entityType, value) {
    const item = value || {};
    if (entityType === "fixedTrips") return item.departureTime || "—";
    if (entityType === "stopTimes") return [item.arrivalTime, item.departureTime].filter(Boolean).join(" → ") || "—";
    if (entityType === "frequencyServices") {
      const minutes = Number.isFinite(item.headwaySeconds) ? Math.round(item.headwaySeconds / 60) : null;
      return [item.startTime && item.endTime ? item.startTime + "–" + item.endTime : "", minutes ? "ทุก " + minutes + " นาที" : ""].filter(Boolean).join(" · ") || "—";
    }
    if (entityType === "routes") return item.serviceMode || "—";
    if (entityType === "fareRules") return Number.isFinite(item.amountMinor) ? (item.amountMinor / 100).toFixed(2) + " " + (item.currency || "THB") : "—";
    return item.recordStatus || item.validationStatus || item.operatorId || item.routeId || "—";
  }

  function filterEntries(entries, query) {
    const needle = String(query || "").trim().toLocaleLowerCase("th");
    if (!needle) return Array.isArray(entries) ? entries.slice() : [];
    return (entries || []).filter(function (entry) {
      return (entry.entityId + " " + recordName(entry) + " " + recordDetail("", entry.value)).toLocaleLowerCase("th").includes(needle);
    });
  }

  function makeElement(documentRef, tag, className, text) {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderRecordTable(options) {
    const input = options || {};
    const documentRef = input.document;
    const body = input.body;
    if (!documentRef || !body) return [];
    const entries = filterEntries(input.entries, input.query);
    body.replaceChildren();
    entries.forEach(function (entry) {
      const row = makeElement(documentRef, "tr", entry.entityId === input.selectedId ? "is-selected" : "");
      const selectCell = makeElement(documentRef, "td", "record-select-cell");
      const button = makeElement(documentRef, "button", "record-select", entry.entityId);
      button.type = "button";
      button.dataset.entityId = entry.entityId;
      button.setAttribute("aria-label", "เปิด " + entry.entityId);
      button.addEventListener("click", function () {
        if (typeof input.onSelect === "function") input.onSelect(entry.entityId);
      });
      selectCell.appendChild(button);
      row.appendChild(selectCell);
      row.appendChild(makeElement(documentRef, "td", "record-name", recordName(entry)));
      row.appendChild(makeElement(documentRef, "td", "record-detail", recordDetail(input.entityType, entry.value)));
      body.appendChild(row);
    });
    return entries;
  }

  function orderedFields(entityType, value) {
    const config = entityConfig(entityType);
    const keys = Object.keys(value || {});
    return keys.sort(function (left, right) {
      if (left === config.idField) return -1;
      if (right === config.idField) return 1;
      return left.localeCompare(right);
    });
  }

  function inputKind(field, value) {
    if (field === "weekdays") return "weekdays";
    if (field === "stops") return "stops";
    if (ENUMS[field]) return "enum";
    if (typeof value === "boolean" || /^(?:is|has|can|enabled|required|exactTimes|throughBooking|baggageTransfer)/.test(field)) return "boolean";
    if (typeof value === "number" || /(?:Seconds|Minutes|Count|Capacity|Sequence|Minor|Km|Latitude|Longitude)$/i.test(field)) return "number";
    if (/(?:Date|effectiveFrom|effectiveTo)$/i.test(field)) return "date";
    if (/(?:Time)$/i.test(field)) return "serviceTime";
    if (value && typeof value === "object") return "structured";
    return "text";
  }

  function renderWeekdays(documentRef, container, value) {
    const group = makeElement(documentRef, "fieldset", "editor-weekdays");
    group.dataset.editorGroup = "weekdays";
    group.appendChild(makeElement(documentRef, "legend", "", fieldLabel("weekdays")));
    WEEKDAYS.forEach(function (definition) {
      const label = makeElement(documentRef, "label", "weekday-option");
      const input = makeElement(documentRef, "input");
      input.type = "checkbox";
      input.dataset.weekday = definition[0];
      input.checked = Boolean(value && value[definition[0]]);
      label.appendChild(input);
      label.appendChild(documentRef.createTextNode(definition[1]));
      group.appendChild(label);
    });
    container.appendChild(group);
  }

  function renderStops(documentRef, container, stops) {
    const label = makeElement(documentRef, "label", "editor-field editor-field-wide");
    label.appendChild(makeElement(documentRef, "span", "field-label", fieldLabel("stops")));
    const textarea = makeElement(documentRef, "textarea", "stops-editor");
    textarea.rows = Math.max(4, Math.min(10, (stops || []).length + 1));
    textarea.dataset.editorField = "stops";
    textarea.dataset.editorKind = "stops";
    textarea.value = (stops || []).map(function (stop) {
      return [stop.stopSequence, stop.locationId, stop.locationNameTh || ""].join(" | ").replace(/\s+\|\s*$/, "");
    }).join("\n");
    textarea.placeholder = "1 | STP-... | ชื่อป้าย";
    label.appendChild(textarea);
    label.appendChild(makeElement(documentRef, "small", "field-help", "หนึ่งป้ายต่อหนึ่งบรรทัด: ลำดับ | รหัสป้าย | ชื่อ"));
    container.appendChild(label);
  }

  function renderForm(options) {
    const input = options || {};
    const documentRef = input.document;
    const container = input.container;
    const entry = input.entry;
    if (!documentRef || !container) return;
    container.replaceChildren();
    if (!entry) {
      container.appendChild(makeElement(documentRef, "p", "editor-empty", "เลือกรายการจากตาราง"));
      return;
    }
    const value = entry.value || {};
    orderedFields(input.entityType, value).forEach(function (field) {
      const current = value[field];
      const kind = inputKind(field, current);
      if (kind === "weekdays") return renderWeekdays(documentRef, container, current);
      if (kind === "stops") return renderStops(documentRef, container, current);
      const label = makeElement(documentRef, "label", "editor-field" + (kind === "structured" ? " editor-field-wide" : ""));
      label.appendChild(makeElement(documentRef, "span", "field-label", fieldLabel(field)));
      let control;
      if (kind === "enum") {
        control = makeElement(documentRef, "select");
        ENUMS[field].forEach(function (optionValue) {
          const option = makeElement(documentRef, "option", "", optionValue);
          option.value = optionValue;
          control.appendChild(option);
        });
        control.value = String(current || "");
      } else if (kind === "boolean") {
        control = makeElement(documentRef, "select");
        [["true", "ใช่"], ["false", "ไม่ใช่"]].forEach(function (choice) {
          const option = makeElement(documentRef, "option", "", choice[1]);
          option.value = choice[0];
          control.appendChild(option);
        });
        control.value = current === true ? "true" : "false";
      } else if (kind === "structured") {
        control = makeElement(documentRef, "textarea");
        control.rows = 5;
        control.value = JSON.stringify(current, null, 2);
      } else {
        control = makeElement(documentRef, "input");
        control.type = kind === "number" ? "number" : kind === "date" ? "date" : "text";
        if (kind === "number") control.step = Number.isInteger(current) ? "1" : "any";
        if (kind === "serviceTime") {
          control.inputMode = "numeric";
          control.pattern = "(?:[0-3]?\\d|4[0-7]):[0-5]\\d:[0-5]\\d";
          control.placeholder = "06:30:00";
        }
        control.value = current == null ? "" : String(current);
      }
      control.dataset.editorField = field;
      control.dataset.editorKind = kind;
      if (field === entityConfig(input.entityType).idField && !entry.isNew) control.readOnly = true;
      label.appendChild(control);
      container.appendChild(label);
    });
  }

  function parseStops(text) {
    return String(text || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).map(function (line, index) {
      const parts = line.split("|").map(function (part) { return part.trim(); });
      const stopSequence = Number(parts[0]);
      if (!Number.isInteger(stopSequence) || stopSequence < 1 || !parts[1]) {
        const error = new Error("stops_editor_invalid_line_" + (index + 1));
        error.code = "stops_editor_invalid";
        throw error;
      }
      const result = { stopSequence, locationId: parts[1] };
      if (parts[2]) result.locationNameTh = parts[2];
      return result;
    });
  }

  function readForm(container, original) {
    const result = Object.assign({}, original || {});
    container.querySelectorAll("[data-editor-field]").forEach(function (control) {
      const field = control.dataset.editorField;
      const kind = control.dataset.editorKind;
      if (kind === "number") result[field] = control.value === "" ? null : Number(control.value);
      else if (kind === "boolean") result[field] = control.value === "true";
      else if (kind === "structured") {
        try {
          result[field] = JSON.parse(control.value);
        } catch (_error) {
          const error = new Error("structured_field_invalid:" + field);
          error.code = "structured_field_invalid";
          throw error;
        }
      } else if (kind === "stops") result[field] = parseStops(control.value);
      else result[field] = control.value.trim();
    });
    const weekdayGroup = container.querySelector('[data-editor-group="weekdays"]');
    if (weekdayGroup) {
      result.weekdays = {};
      weekdayGroup.querySelectorAll("[data-weekday]").forEach(function (checkbox) {
        result.weekdays[checkbox.dataset.weekday] = checkbox.checked;
      });
    }
    return result;
  }

  return Object.freeze({
    ENTITIES,
    FIELD_LABELS,
    MAX_BULK_OPERATIONS,
    MAX_SHIFT_MINUTES,
    SERVICE_TIME_PATTERN,
    buildTimeShiftOperations,
    entityConfig,
    fieldLabel,
    filterEntries,
    readForm,
    recordDetail,
    recordName,
    renderForm,
    renderRecordTable,
    secondsToServiceTime,
    serviceTimeToSeconds,
    shiftedRecord,
    shiftServiceTime
  });
}));