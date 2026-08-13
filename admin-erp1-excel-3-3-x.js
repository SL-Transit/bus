(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SLTransitAdminErpExcel33x = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const BASE_MAPPING_URL = "contracts/greenfield-erp/v1/excel-mapping-3.1.5.json";
  const PROFILE_URL = "contracts/greenfield-erp/v1/excel-mapping-{version}.json";
  const MAX_EXCEL_BYTES = 25 * 1024 * 1024;
  const CORE_ENTITIES = new Set([
    "operator", "location", "route", "journeyPatternStop", "serviceCalendar",
    "fixedTrip", "stopTime", "fareRule", "transferRule"
  ]);
  const OPERATIONAL_ENTITIES = Object.freeze({
    account: "accounts",
    accountAccess: "accountAccesses",
    locationAccess: "locationAccesses",
    locationSurvey: "locationSurveys",
    routeDraft: "routeDrafts",
    routeDraftStop: "routeDraftStops",
    calendarException: "calendarExceptions",
    queue: "queues",
    vehicle: "vehicles",
    driver: "drivers",
    vehicleBlock: "vehicleBlocks",
    driverDuty: "driverDuties",
    assignment: "assignments",
    bookingPolicy: "bookingPolicies",
    incident: "incidents",
    platformAssignment: "platformAssignments",
    serviceGroup: "serviceGroups"
  });

  function excelError(code, message, details) {
    const error = new Error(message);
    error.code = code;
    error.details = details || [];
    return error;
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function number(value) {
    if (value === "" || value === null || value === undefined) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function integer(value) {
    const result = number(value);
    return Number.isInteger(result) ? result : null;
  }

  function yes(value) {
    return ["1", "true", "yes", "y", "ใช่", "เปิด", "เปิดจอง"].includes(text(value).toLowerCase());
  }

  function serviceTime(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const seconds = Math.round((value % 1) * 86400);
      return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
        .map(function (part) { return String(part).padStart(2, "0"); }).join(":");
    }
    const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/.exec(text(value));
    return match ? String(Number(match[1])).padStart(2, "0") + ":" + match[2] + ":" + (match[3] || "00") : text(value);
  }

  function serviceMode(value) {
    const normalized = text(value).toLowerCase();
    if (/hybrid|ผสม/.test(normalized)) return "hybrid";
    if (/frequency|dynamic|ความถี่|ไม่ประจำ|กรอกทุก/.test(normalized)) return "frequency";
    return "fixed";
  }

  function shaHex(buffer, cryptoRef) {
    if (!cryptoRef || !cryptoRef.subtle) return Promise.reject(excelError("excel_checksum_unavailable", "เครื่องมือตรวจลายนิ้วมือไฟล์ไม่พร้อมใช้งาน"));
    return cryptoRef.subtle.digest("SHA-256", buffer).then(function (digest) {
      return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    });
  }

  async function fetchJson(url, fetchImpl) {
    const response = await fetchImpl(url, { credentials: "same-origin" });
    if (!response.ok) throw excelError("excel_mapping_load_failed", "โหลดกติกาอ่าน Excel ไม่สำเร็จ");
    return response.json();
  }

  async function loadMapping(version, options) {
    const settings = options || {};
    const fetchImpl = settings.fetch || root.fetch;
    if (typeof fetchImpl !== "function") throw excelError("excel_mapping_load_failed", "ไม่พบเครื่องมือโหลดกติกาอ่าน Excel");
    const values = await Promise.all([
      fetchJson(settings.baseMappingUrl || BASE_MAPPING_URL, fetchImpl),
      fetchJson((settings.profileUrl || PROFILE_URL).replace("{version}", version), fetchImpl)
    ]);
    return { base: values[0], profile: values[1] };
  }

  function workbookMatrices(sheetWorkbook, parser) {
    const sheets = {};
    (sheetWorkbook.SheetNames || []).forEach(function (sheetName) {
      sheets[sheetName] = parser.utils.sheet_to_json(sheetWorkbook.Sheets[sheetName], {
        header: 1,
        blankrows: true,
        defval: null,
        raw: false
      });
    });
    return { sheets };
  }

  function groupValues(records) {
    const grouped = {};
    records.forEach(function (record) {
      if (!grouped[record.targetEntity]) grouped[record.targetEntity] = [];
      grouped[record.targetEntity].push(record.value);
    });
    return grouped;
  }

  function addIf(target, key, value) {
    if (value !== null && value !== undefined && value !== "") target[key] = value;
    return target;
  }

  function makePackage(grouped, metadata) {
    const operators = (grouped.operator || []).map(function (row) {
      return { operatorId: row.operatorId, nameTh: row.operatorNameTh || row.legalNameTh || row.operatorId, timezone: row.timezone || "Asia/Bangkok" };
    });
    const locations = (grouped.location || []).map(function (row) {
      const value = { locationId: row.locationId, locationType: row.locationType || "stop", nameTh: row.locationNameTh || row.locationCode || row.locationId };
      addIf(value, "parentLocationId", row.parentLocationId);
      addIf(value, "latitude", number(row.latitude));
      addIf(value, "longitude", number(row.longitude));
      return value;
    });
    const locationNames = new Map(locations.map(function (item) { return [item.locationId, item.nameTh]; }));
    const routes = (grouped.route || []).map(function (row) {
      return {
        routeId: row.routeId,
        operatorId: row.operatorId,
        shortName: row.routeShortName || row.routeLongNameTh || row.routeId,
        nameTh: row.routeLongNameTh || row.routeShortName || row.routeId,
        serviceMode: serviceMode(row.serviceType)
      };
    });
    const patternGroups = new Map();
    (grouped.journeyPatternStop || []).forEach(function (row) {
      if (!patternGroups.has(row.journeyPatternId)) {
        patternGroups.set(row.journeyPatternId, {
          journeyPatternId: row.journeyPatternId,
          routeId: row.routeId,
          direction: row.direction || "outbound",
          stops: []
        });
      }
      patternGroups.get(row.journeyPatternId).stops.push({
        stopSequence: integer(row.stopSequence),
        locationId: row.locationId,
        locationNameTh: locationNames.get(row.locationId) || row.locationId
      });
    });
    const journeyPatterns = Array.from(patternGroups.values()).map(function (pattern) {
      pattern.stops.sort(function (left, right) { return left.stopSequence - right.stopSequence; });
      return pattern;
    });
    const serviceCalendars = (grouped.serviceCalendar || []).map(function (row) {
      return {
        serviceCalendarId: row.serviceCalendarId,
        nameTh: row.serviceNameTh || row.serviceCalendarId,
        startDate: text(row.startDate),
        endDate: text(row.endDate),
        weekdays: {
          monday: yes(row.monday), tuesday: yes(row.tuesday), wednesday: yes(row.wednesday),
          thursday: yes(row.thursday), friday: yes(row.friday), saturday: yes(row.saturday), sunday: yes(row.sunday)
        }
      };
    });
    const fixedTrips = (grouped.fixedTrip || []).map(function (row) {
      return {
        fixedTripId: row.tripTemplateId,
        routeId: row.routeId,
        journeyPatternId: row.journeyPatternId,
        serviceCalendarId: row.serviceCalendarId,
        nameTh: row.tripPublicName || row.tripTemplateId,
        departureTime: serviceTime(row.departureTime),
        capacity: integer(row.defaultCapacity),
        bookingEnabled: yes(row.bookingEnabled)
      };
    });
    const stopTimes = (grouped.stopTime || []).map(function (row) {
      return {
        stopTimeId: row.stopTimeId,
        fixedTripId: row.tripTemplateId,
        stopSequence: integer(row.stopSequence),
        locationId: row.locationId,
        locationNameTh: locationNames.get(row.locationId) || row.locationId,
        arrivalTime: serviceTime(row.arrivalTime),
        departureTime: serviceTime(row.departureTime)
      };
    });
    const fareProductMap = new Map();
    const fareRules = (grouped.fareRule || []).map(function (row) {
      const fareProductId = row.fareProductId;
      if (fareProductId && !fareProductMap.has(fareProductId)) {
        fareProductMap.set(fareProductId, { fareProductId, nameTh: "ค่าโดยสารปกติ", currency: row.currency || "THB" });
      }
      const major = number(row.baseFare);
      return {
        fareRuleId: row.fareRuleId,
        fareProductId,
        routeId: row.routeId,
        originLocationId: row.originLocationId,
        originNameTh: locationNames.get(row.originLocationId) || row.originLocationId,
        destinationLocationId: row.destinationLocationId,
        destinationNameTh: locationNames.get(row.destinationLocationId) || row.destinationLocationId,
        amountMinor: major === null ? null : Math.round(major * 100)
      };
    });
    const transferRules = (grouped.transferRule || []).map(function (row) {
      const minimum = integer(row.minimumTransferMinutes);
      const maximum = integer(row.maximumTransferMinutes);
      return {
        transferRuleId: row.connectionId,
        fromLocationId: row.hubLocationId,
        toLocationId: row.hubLocationId,
        locationNameTh: locationNames.get(row.hubLocationId) || row.hubLocationId,
        minimumTransferSeconds: (minimum === null ? 0 : minimum) * 60,
        maximumTransferSeconds: (maximum === null ? (minimum === null ? 0 : minimum) : maximum) * 60,
        throughBooking: yes(row.throughBooking),
        baggageTransfer: yes(row.baggageTransfer)
      };
    });
    const operationalRecords = {};
    Object.keys(OPERATIONAL_ENTITIES).forEach(function (sourceEntity) {
      const targetEntity = OPERATIONAL_ENTITIES[sourceEntity];
      operationalRecords[targetEntity] = (grouped[sourceEntity] || []).map(function (row) { return Object.assign({}, row); });
    });
    return {
      metadata,
      operators,
      locations,
      routes,
      journeyPatterns,
      serviceCalendars,
      fixedTrips,
      stopTimes,
      frequencyServices: [],
      fareProducts: Array.from(fareProductMap.values()),
      fareRules,
      transferRules,
      operationalRecords
    };
  }

  function validateRelations(pkg) {
    const errors = [];
    function index(items, field, label) {
      const ids = new Set();
      items.forEach(function (item, position) {
        const id = text(item && item[field]);
        if (!id) errors.push({ code: "excel.id_required", message: label + " ลำดับ " + (position + 1) + " ไม่มีรหัส" });
        else if (ids.has(id)) errors.push({ code: "excel.id_duplicate", message: "รหัส " + id + " ซ้ำในหมวด " + label });
        else ids.add(id);
      });
      return ids;
    }
    const operators = index(pkg.operators, "operatorId", "หน่วยงาน");
    const locations = index(pkg.locations, "locationId", "ป้าย/จุดบริการ");
    const routes = index(pkg.routes, "routeId", "เส้นทาง");
    const patterns = index(pkg.journeyPatterns, "journeyPatternId", "รูปแบบเส้นทาง");
    const calendars = index(pkg.serviceCalendars, "serviceCalendarId", "ปฏิทินบริการ");
    const trips = index(pkg.fixedTrips, "fixedTripId", "แม่แบบเที่ยว");
    index(pkg.stopTimes, "stopTimeId", "เวลารายป้าย");
    index(pkg.fareRules, "fareRuleId", "ค่าโดยสาร");
    pkg.routes.forEach(function (route) {
      if (!operators.has(route.operatorId)) errors.push({ code: "excel.reference_missing", message: "เส้นทาง " + route.routeId + " อ้างถึงหน่วยงานที่ไม่มีในไฟล์" });
    });
    pkg.journeyPatterns.forEach(function (pattern) {
      if (!routes.has(pattern.routeId)) errors.push({ code: "excel.reference_missing", message: "รูปแบบเส้นทาง " + pattern.journeyPatternId + " อ้างถึงเส้นทางที่ไม่มีในไฟล์" });
      pattern.stops.forEach(function (stop) {
        if (!locations.has(stop.locationId)) errors.push({ code: "excel.reference_missing", message: "รูปแบบเส้นทาง " + pattern.journeyPatternId + " อ้างถึงป้ายที่ไม่มีในไฟล์: " + stop.locationId });
      });
      pattern.stops.forEach(function (stop, indexValue) {
        if (stop.stopSequence !== indexValue + 1) errors.push({ code: "excel.sequence_invalid", message: "ลำดับป้ายของ " + pattern.journeyPatternId + " ต้องเรียงต่อกันจาก 1" });
      });
    });
    pkg.fixedTrips.forEach(function (trip) {
      if (!routes.has(trip.routeId) || !patterns.has(trip.journeyPatternId) || !calendars.has(trip.serviceCalendarId)) {
        errors.push({ code: "excel.reference_missing", message: "แม่แบบเที่ยว " + trip.fixedTripId + " อ้างอิงเส้นทาง รูปแบบ หรือปฏิทินไม่ครบ" });
      }
    });
    pkg.stopTimes.forEach(function (stopTime) {
      if (!trips.has(stopTime.fixedTripId) || !locations.has(stopTime.locationId)) {
        errors.push({ code: "excel.reference_missing", message: "เวลารายป้าย " + stopTime.stopTimeId + " อ้างอิงเที่ยวหรือป้ายที่ไม่มีในไฟล์" });
      }
    });
    return errors;
  }

  function ignoredRows(grouped) {
    return Object.keys(grouped).filter(function (key) {
      return !CORE_ENTITIES.has(key) && !OPERATIONAL_ENTITIES[key];
    }).reduce(function (sum, key) {
      return sum + grouped[key].length;
    }, 0);
  }

  function convertWorkbook(input) {
    const Mapper = input.mapper || root.SLTransitExcelRowMapper;
    if (!Mapper) throw excelError("excel_mapper_unavailable", "ไม่พบชุดแปลงข้อมูล Excel");
    const version = Mapper.detectTemplateVersion(input.workbook, [input.profile]);
    if (!version || version !== input.profile.templateVersion) {
      throw excelError("excel_version_not_supported", "ไฟล์นี้ไม่ใช่ Excel รุ่น 3.3.4 หรือ 3.3.5");
    }
    const mapping = Mapper.applyMappingProfile(input.baseMapping, input.profile);
    const mapped = Mapper.mapWorkbook({ workbook: input.workbook, mapping });
    const grouped = groupValues(mapped.records);
    const checksum = text(input.sourceChecksumSha256).replace(/^sha256:/, "");
    const metadata = {
      packageId: "IPK-" + checksum.slice(0, 24).toUpperCase(),
      schemaVersion: "greenfield-erp-v1",
      templateVersion: version,
      sourceChecksumSha256: "sha256:" + checksum,
      mode: "validate_only",
      operatorScope: input.operatorScope,
      idempotencyKey: "excel-" + version + "-" + checksum,
      operationalExtensionVersion: "greenfield-erp-operational-v1"
    };
    const pkg = makePackage(grouped, metadata);
    const errors = mapped.errors.concat(validateRelations(pkg));
    const ignored = ignoredRows(grouped);
    const warnings = ignored ? [{
      code: "excel.non_network_rows_skipped",
      message: "มีข้อมูลประกอบ " + ignored + " แถวที่อยู่นอกข้อมูลเครือข่ายฉบับร่าง จึงยังไม่ส่งเข้าระบบกลาง"
    }] : [];
    return { ok: errors.length === 0, version, package: pkg, errors, warnings, mappingVersion: mapping.mappingVersion };
  }

  async function convertFileToCanonical(file, options) {
    const settings = options || {};
    const parser = settings.parser || root.XLSX;
    if (!file || !/\.xlsx$/i.test(file.name || "")) throw excelError("excel_file_required", "กรุณาเลือกไฟล์ .xlsx");
    if (file.size > MAX_EXCEL_BYTES) throw excelError("excel_file_too_large", "ไฟล์ Excel ต้องมีขนาดไม่เกิน 25 MB");
    if (!parser || typeof parser.read !== "function") throw excelError("excel_parser_unavailable", "ตัวอ่าน Excel ยังไม่พร้อมใช้งาน");
    const sourceBuffer = await file.arrayBuffer();
    const checksum = await shaHex(sourceBuffer, settings.crypto || root.crypto);
    const rawWorkbook = parser.read(new Uint8Array(sourceBuffer), { type: "array", cellDates: false });
    const workbook = workbookMatrices(rawWorkbook, parser);
    const Mapper = settings.mapper || root.SLTransitExcelRowMapper;
    const profiles = settings.profiles || [
      { templateVersion: "3.3.4", versionLocation: { sheetName: "91_ควบคุมการนำเข้า", cell: "C5" } },
      { templateVersion: "3.3.5", versionLocation: { sheetName: "91_ควบคุมการนำเข้า", cell: "C5" } }
    ];
    const version = Mapper && Mapper.detectTemplateVersion(workbook, profiles);
    if (!version) throw excelError("excel_version_not_supported", "รองรับเฉพาะ Excel รุ่น 3.3.4 และ 3.3.5 โดยอ่านรุ่นจากชีต 91 ช่อง C5");
    const loaded = settings.mapping || await loadMapping(version, settings);
    const result = convertWorkbook({
      workbook,
      baseMapping: loaded.base,
      profile: loaded.profile,
      mapper: Mapper,
      operatorScope: settings.operatorScope,
      sourceChecksumSha256: "sha256:" + checksum
    });
    if (!result.ok) throw excelError("excel_validation_failed", "ข้อมูลใน Excel ยังไม่พร้อมสร้างฉบับร่าง", result.errors);
    const json = JSON.stringify(result.package);
    const outputName = text(file.name).replace(/\.xlsx$/i, "") + ".canonical.json";
    let outputFile;
    if (typeof root.File === "function") {
      outputFile = new root.File([json], outputName, { type: "application/json" });
    } else {
      outputFile = new Blob([json], { type: "application/json" });
      Object.defineProperty(outputFile, "name", { value: outputName });
    }
    return { file: outputFile, version: result.version, package: result.package, warnings: result.warnings, mappingVersion: result.mappingVersion };
  }

  return {
    MAX_EXCEL_BYTES,
    loadMapping,
    workbookMatrices,
    convertWorkbook,
    convertFileToCanonical,
    validateRelations,
    makePackage
  };
}));
