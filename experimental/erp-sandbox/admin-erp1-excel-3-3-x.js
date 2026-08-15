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
    "fixedTrip", "stopTime", "frequencyService", "fareRule", "transferRule"
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
    serviceGroup: "serviceGroups",
    scheduleRule: "scheduleRules",
    dailyQueueRule: "dailyQueueRules"
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

  function transferServiceMode(value) {
    const normalized = text(value).toLowerCase();
    if (!normalized) return "";
    if (/frequency|dynamic|ความถี่|ไม่ประจำ|กรอกทุก/.test(normalized)) return "frequency";
    if (/fixed|scheduled|ประจำ|ตารางเวลา/.test(normalized)) return "fixed";
    return normalized;
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
    function locationFromRow(row) {
      const value = { locationId: row.locationId, locationType: row.locationType || "stop", nameTh: row.locationNameTh || row.locationCode || row.locationId };
      addIf(value, "parentLocationId", row.parentLocationId);
      addIf(value, "latitude", number(row.latitude));
      addIf(value, "longitude", number(row.longitude));
      return value;
    }
    const locations = (grouped.location || []).map(locationFromRow);
    const locationIds = new Set(locations.map(function (item) { return item.locationId; }));
    (grouped.locationSurvey || []).forEach(function (row) {
      const locationId = text(row && row.locationId);
      if (!locationId || locationIds.has(locationId)) return;
      locations.push(locationFromRow(row));
      locationIds.add(locationId);
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
    const frequencyServices = (grouped.frequencyService || []).map(function (row) {
      return {
        frequencyServiceId: row.frequencyServiceId,
        routeId: row.routeId,
        journeyPatternId: row.journeyPatternId,
        serviceCalendarId: row.serviceCalendarId,
        startTime: serviceTime(row.startTime),
        endTime: serviceTime(row.endTime),
        headwaySeconds: integer(row.headwaySeconds),
        boardingModel: text(row.boardingModel).toLowerCase() === "queue" ? "queue" : "frequency",
        exactTimes: yes(row.exactTimes)
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
      const value = {
        transferRuleId: row.connectionId,
        fromLocationId: row.hubLocationId,
        toLocationId: row.hubLocationId,
        locationNameTh: locationNames.get(row.hubLocationId) || row.hubLocationId,
        minimumTransferSeconds: (minimum === null ? 0 : minimum) * 60,
        maximumTransferSeconds: (maximum === null ? (minimum === null ? 0 : minimum) : maximum) * 60,
        throughBooking: yes(row.throughBooking),
        baggageTransfer: yes(row.baggageTransfer)
      };
      addIf(value, "fromOperatorId", text(row.inboundOperatorId));
      addIf(value, "toOperatorId", text(row.outboundOperatorId));
      addIf(value, "fromServiceMode", transferServiceMode(row.inboundServiceMode));
      addIf(value, "toServiceMode", transferServiceMode(row.outboundServiceMode));
      addIf(value, "fromServiceId", text(row.inboundServiceId) || text(row.inboundTripTemplateId));
      addIf(value, "toServiceId", text(row.outboundServiceId) || text(row.outboundTripTemplateId));
      return value;
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
      frequencyServices,
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
    const frequencies = index(pkg.frequencyServices, "frequencyServiceId", "บริการตามความถี่");
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
    pkg.frequencyServices.forEach(function (frequency) {
      if (!frequencies.has(frequency.frequencyServiceId) || !routes.has(frequency.routeId) || !patterns.has(frequency.journeyPatternId) || !calendars.has(frequency.serviceCalendarId)) {
        errors.push({ code: "excel.reference_missing", message: "บริการตามความถี่ " + frequency.frequencyServiceId + " อ้างอิงเส้นทาง รูปแบบ หรือปฏิทินไม่ครบ" });
      }
    });
    pkg.stopTimes.forEach(function (stopTime) {
      if (!trips.has(stopTime.fixedTripId) || !locations.has(stopTime.locationId)) {
        errors.push({ code: "excel.reference_missing", message: "เวลารายป้าย " + stopTime.stopTimeId + " อ้างอิงเที่ยวหรือป้ายที่ไม่มีในไฟล์" });
      }
    });
    return errors;
  }


  function recordLocation(record, sourceColumn, fallbackSheet) {
    const source = text(record && record.sourceRowId);
    const separator = source.lastIndexOf(":");
    const rowNumber = separator >= 0 ? integer(source.slice(separator + 1)) : null;
    const sheetName = separator >= 0 ? source.slice(0, separator) : fallbackSheet;
    return { sheetName: sheetName || fallbackSheet, rowNumber: rowNumber || 5, sourceColumn };
  }

  function validationError(code, message, record, sourceColumn, fallbackSheet) {
    return Object.assign({ code, message }, recordLocation(record, sourceColumn, fallbackSheet));
  }

  function recordsFor(mapped, targetEntity) {
    return (mapped && mapped.records || []).filter(function (record) { return record.targetEntity === targetEntity; });
  }

  function validateSafety(mapped, profile, pkg) {
    const rules = profile && profile.safetyRules || {};
    const errors = [];
    const routeRecords = recordsFor(mapped, "route");
    const groupRecords = recordsFor(mapped, "serviceGroup");
    const scheduleRecords = recordsFor(mapped, "scheduleRule");
    const fixedTripRecords = recordsFor(mapped, "fixedTrip");
    const frequencyRecords = recordsFor(mapped, "frequencyService");
    const transferRecords = recordsFor(mapped, "transferRule");
    const frequencyGroupId = text(rules.frequencyServiceGroupId);

    if (frequencyGroupId) {
      const groupRoutes = routeRecords.filter(function (record) { return text(record.value.serviceGroupId) === frequencyGroupId; });
      if (groupRoutes.length) {
        const routeIds = new Set(groupRoutes.map(function (record) { return text(record.value.routeId); }));
        groupRoutes.forEach(function (record) {
          if (serviceMode(record.value.serviceType) !== "frequency") {
            errors.push(validationError(
              "excel.frequency_mode_required",
              "กลุ่ม " + frequencyGroupId + " ต้องใช้รูปแบบ frequency/queue ตามกติกาเครือข่าย ห้ามแปลงตารางเที่ยวคงที่เป็นความถี่เอง",
              record, "service_type", "03_เส้นทาง"
            ));
          }
        });
        const allowedModes = new Set((rules.allowedFrequencyScheduleModes || []).map(function (value) { return text(value).toLowerCase(); }));
        const groupSchedules = scheduleRecords.filter(function (record) { return text(record.value.serviceGroupId) === frequencyGroupId; });
        if (!groupSchedules.length) {
          errors.push(validationError(
            "excel.frequency_schedule_rule_required",
            "กลุ่ม " + frequencyGroupId + " ต้องมีข้อกำหนดเวลาเปิด-ปิดและความถี่",
            null, "schedule_mode", "05A_กติกาตารางเวลา"
          ));
        } else {
          groupSchedules.forEach(function (record) {
            if (!allowedModes.has(text(record.value.scheduleMode).toLowerCase())) {
              errors.push(validationError(
                "excel.frequency_schedule_mode_conflict",
                "กลุ่ม " + frequencyGroupId + " ระบุ schedule_mode เป็น " + text(record.value.scheduleMode) + " ซึ่งขัดกับระบบคิว/ความถี่",
                record, "schedule_mode", "05A_กติกาตารางเวลา"
              ));
            }
          });
        }
        fixedTripRecords.filter(function (record) { return routeIds.has(text(record.value.routeId)); }).forEach(function (record) {
          errors.push(validationError(
            "excel.frequency_fixed_trip_conflict",
            "เที่ยว " + text(record.value.tripTemplateId) + " อยู่ในกลุ่มความถี่ จึงห้ามใช้เวลาออกแบบเที่ยวคงที่",
            record, "departure_time", "07_แม่แบบเที่ยว"
          ));
        });
        const groupFrequencyRecords = frequencyRecords.filter(function (record) { return routeIds.has(text(record.value.routeId)); });
        if (rules.requireFrequencyServiceForGroup && !groupFrequencyRecords.length) {
          errors.push(validationError(
            "excel.frequency_data_required",
            "กลุ่ม " + frequencyGroupId + " ต้องมี start_time, end_time และ headway_secs; ระบบจะไม่เดาค่าความถี่",
            null, "headway_secs", "24_บริการตามความถี่"
          ));
        }
      }
    }

    const minimumTransfers = integer(rules.minimumTransferRulesWhenMultipleGroups) || 0;
    if (minimumTransfers > 0 && groupRecords.length > 1 && transferRecords.length < minimumTransfers) {
      errors.push(validationError(
        "excel.transfer_rule_required",
        "มีหลายกลุ่มบริการแต่ยังไม่มีจุดต่อเที่ยวขั้นต่ำ " + minimumTransfers + " รายการ จึงยังสร้าง Network Journey ข้ามกลุ่มไม่ได้",
        null, "connection_id", "19_จุดต่อเที่ยว"
      ));
    }

    const operatorIds = new Set((pkg.operators || []).map(function (item) { return item.operatorId; }));
    const locationIds = new Set((pkg.locations || []).map(function (item) { return item.locationId; }));
    const routeById = new Map((pkg.routes || []).map(function (item) { return [item.routeId, item]; }));
    const serviceById = new Map();
    (pkg.fixedTrips || []).forEach(function (item) {
      const route = routeById.get(item.routeId);
      serviceById.set(item.fixedTripId, { mode: "fixed", operatorId: route && route.operatorId });
    });
    (pkg.frequencyServices || []).forEach(function (item) {
      const route = routeById.get(item.routeId);
      serviceById.set(item.frequencyServiceId, { mode: "frequency", operatorId: route && route.operatorId });
    });
    transferRecords.forEach(function (record) {
      const row = record.value || {};
      if (!locationIds.has(row.hubLocationId) || !operatorIds.has(row.inboundOperatorId) || !operatorIds.has(row.outboundOperatorId)) {
        errors.push(validationError(
          "excel.transfer_reference_missing",
          "จุดต่อเที่ยว " + text(row.connectionId) + " อ้างอิงจุดหรือบริษัทไม่ครบ",
          record, "connection_id", "19_จุดต่อเที่ยว"
        ));
      }
      const inboundMode = transferServiceMode(row.inboundServiceMode);
      const outboundMode = transferServiceMode(row.outboundServiceMode);
      if (rules.requireTransferServiceModes && (!inboundMode || !outboundMode)) {
        errors.push(validationError(
          "excel.transfer_service_mode_required",
          "จุดต่อเที่ยว " + text(row.connectionId) + " ต้องระบุโหมดขาเข้าและขาออกเป็น fixed หรือ frequency",
          record, !inboundMode ? "inbound_service_mode" : "outbound_service_mode", "19_จุดต่อเที่ยว"
        ));
      }
      [["inbound", inboundMode], ["outbound", outboundMode]].forEach(function (side) {
        if (side[1] && !["fixed", "frequency"].includes(side[1])) {
          errors.push(validationError(
            "excel.transfer_service_mode_invalid",
            "จุดต่อเที่ยว " + text(row.connectionId) + " ระบุโหมด " + side[1] + " ซึ่งระบบไม่รองรับ",
            record, side[0] + "_service_mode", "19_จุดต่อเที่ยว"
          ));
        }
      });
      const selectors = [
        { side: "inbound", mode: inboundMode, operatorId: text(row.inboundOperatorId), genericId: text(row.inboundServiceId), legacyId: text(row.inboundTripTemplateId) },
        { side: "outbound", mode: outboundMode, operatorId: text(row.outboundOperatorId), genericId: text(row.outboundServiceId), legacyId: text(row.outboundTripTemplateId) }
      ];
      selectors.forEach(function (selector) {
        if (selector.genericId && selector.legacyId && selector.genericId !== selector.legacyId) {
          errors.push(validationError(
            "excel.transfer_service_selector_conflict",
            "จุดต่อเที่ยว " + text(row.connectionId) + " ระบุ Service ID กับ Trip ID ไม่ตรงกัน",
            record, selector.side + "_service_id", "19_จุดต่อเที่ยว"
          ));
          return;
        }
        if (selector.legacyId && selector.mode === "frequency") {
          errors.push(validationError(
            "excel.transfer_service_selector_conflict",
            "จุดต่อเที่ยว " + text(row.connectionId) + " ใช้ Trip ID กับโหมด frequency ไม่ได้",
            record, selector.side + "_trip_template_id", "19_จุดต่อเที่ยว"
          ));
          return;
        }
        const serviceId = selector.genericId || selector.legacyId;
        if (!serviceId) return;
        const service = serviceById.get(serviceId);
        if (!service) {
          errors.push(validationError(
            "excel.transfer_service_reference_missing",
            "จุดต่อเที่ยว " + text(row.connectionId) + " อ้างถึงบริการ " + serviceId + " ที่ไม่มีในไฟล์",
            record, selector.side + "_service_id", "19_จุดต่อเที่ยว"
          ));
          return;
        }
        if ((selector.mode && service.mode !== selector.mode) || (selector.operatorId && service.operatorId !== selector.operatorId)) {
          errors.push(validationError(
            "excel.transfer_service_selector_conflict",
            "จุดต่อเที่ยว " + text(row.connectionId) + " ระบุ Service ID ไม่ตรงกับโหมดหรือบริษัท",
            record, selector.side + "_service_id", "19_จุดต่อเที่ยว"
          ));
        }
      });
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

  function packageSummary(pkg) {
    const value = pkg || {};
    function count(key) { return Array.isArray(value[key]) ? value[key].length : 0; }
    return {
      operators: count("operators"),
      locations: count("locations"),
      routes: count("routes"),
      journeyPatterns: count("journeyPatterns"),
      fixedTrips: count("fixedTrips"),
      stopTimes: count("stopTimes"),
      frequencyServices: count("frequencyServices"),
      fareRules: count("fareRules"),
      transferRules: count("transferRules")
    };
  }

  function normalizeReadinessIssue(issue, severity) {
    const value = issue || {};
    return {
      severity,
      code: text(value.code) || "excel.validation_error",
      message: text(value.message) || "ข้อมูลไม่ผ่านการตรวจ",
      sheetName: text(value.sheetName) || "ข้อมูลกลาง",
      rowNumber: integer(value.rowNumber),
      sourceColumn: text(value.sourceColumn),
      path: text(value.path)
    };
  }

  function readinessGate(issues, prefix) {
    const matching = issues.filter(function (issue) { return issue.code.indexOf(prefix) === 0; });
    return { status: matching.length ? "blocked" : "ready", issueCount: matching.length };
  }

  function buildReadinessReport(result) {
    const value = result || {};
    const errors = (Array.isArray(value.errors) ? value.errors : []).map(function (issue) {
      return normalizeReadinessIssue(issue, "blocking");
    });
    const warnings = (Array.isArray(value.warnings) ? value.warnings : []).map(function (issue) {
      return normalizeReadinessIssue(issue, "warning");
    });
    return {
      status: errors.length ? "blocked" : (warnings.length ? "ready_with_warnings" : "ready"),
      blockingCount: errors.length,
      warningCount: warnings.length,
      summary: packageSummary(value.package),
      gates: {
        frequency: readinessGate(errors, "excel.frequency"),
        transfers: readinessGate(errors, "excel.transfer")
      },
      errors,
      warnings
    };
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
    const errors = mapped.errors.concat(validateRelations(pkg), validateSafety(mapped, input.profile, pkg));
    const ignored = ignoredRows(grouped);
    const warnings = ignored ? [{
      code: "excel.non_network_rows_skipped",
      message: "มีข้อมูลประกอบ " + ignored + " แถวที่อยู่นอกข้อมูลเครือข่ายฉบับร่าง จึงยังไม่ส่งเข้าระบบกลาง"
    }] : [];
    const result = { ok: errors.length === 0, version, package: pkg, errors, warnings, mappingVersion: mapping.mappingVersion };
    result.report = buildReadinessReport(result);
    return result;
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
    const report = result.report || buildReadinessReport(result);
    if (!result.ok) {
      const error = excelError("excel_validation_failed", "ข้อมูลใน Excel ยังไม่พร้อมสร้างฉบับร่าง", result.errors);
      error.report = report;
      throw error;
    }
    const json = JSON.stringify(result.package);
    const outputName = text(file.name).replace(/\.xlsx$/i, "") + ".canonical.json";
    let outputFile;
    if (typeof root.File === "function") {
      outputFile = new root.File([json], outputName, { type: "application/json" });
    } else {
      outputFile = new Blob([json], { type: "application/json" });
      Object.defineProperty(outputFile, "name", { value: outputName });
    }
    return { file: outputFile, version: result.version, package: result.package, warnings: result.warnings, mappingVersion: result.mappingVersion, report };
  }

  return {
    MAX_EXCEL_BYTES,
    loadMapping,
    workbookMatrices,
    convertWorkbook,
    convertFileToCanonical,
    packageSummary,
    buildReadinessReport,
    validateRelations,
    validateSafety,
    makePackage
  };
}));
