"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");

const repositoryRoot = path.join(__dirname, "..");
const contractRoot = path.join(repositoryRoot, "contracts/greenfield-erp/v1");
const mapper = require(path.join(repositoryRoot, "greenfield-erp/phase2/excel-row-mapper.js"));
const excel = require(path.join(repositoryRoot, "admin-erp1-excel-3-3-x.js"));
const validator = require(path.join(contractRoot, "runtime/validate-network-package.js"));
const draftService = require(path.join(repositoryRoot, "greenfield-erp/phase2/draft-service.js"));
const draftStore = require(path.join(repositoryRoot, "greenfield-erp/phase2/rtdb-emulator-draft-store.js"));
const baseMapping = JSON.parse(fs.readFileSync(path.join(contractRoot, "excel-mapping-3.1.5.json"), "utf8"));

function profile(version) {
  return JSON.parse(fs.readFileSync(path.join(contractRoot, "excel-mapping-" + version + ".json"), "utf8"));
}

function valueFor(field, rowNumber) {
  if (!field.required) return null;
  if (field.targetType === "integer") return 1;
  if (field.targetType === "number" || field.targetType === "money-major") return 0;
  if (field.targetType === "date") return "2026-01-01";
  if (field.targetType === "date-time") return "2026-01-01T00:00:00Z";
  if (field.targetType === "service-time") return "09:00:00";
  if (field.enumSource === "yesNo") return "yes";
  if (field.enumSource === "direction") return "outbound";
  if (field.sourceColumn === "record_status") return "active";
  if (field.sourceColumn === "approval_state") return "approved";
  if (field.sourceColumn === "change_reason") return "เตรียมข้อมูลทดสอบ";
  if (field.sourceColumn === "source_row_id") return "SRC-" + rowNumber;
  return "TEST";
}

function matrixFor(mapping, sheetName, rows) {
  const sheet = mapping.sheets[sheetName];
  const headers = sheet.fields.map(function (field) { return field.sourceColumn; });
  const matrix = [[], [], headers, headers.map(function () { return "ชื่อช่อง"; })];
  rows.forEach(function (overrides, rowIndex) {
    matrix.push(sheet.fields.map(function (field) {
      return Object.prototype.hasOwnProperty.call(overrides, field.sourceColumn)
        ? overrides[field.sourceColumn]
        : valueFor(field, rowIndex + 5);
    }));
  });
  return matrix;
}

function workbookFor(version) {
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const sheets = {};
  sheets["91_ควบคุมการนำเข้า"] = [[], [], [], [], [null, null, version]];
  sheets["01_หน่วยงาน"] = matrixFor(activeMapping, "01_หน่วยงาน", [{
    operator_id: "OPR-BUS01", operator_name_th: "แพลตฟอร์มรถโดยสาร", timezone: "Asia/Bangkok"
  }]);
  sheets["02_จุดบริการ"] = matrixFor(activeMapping, "02_จุดบริการ", [
    { location_id: "LOC-001", location_name_th: "ฉะเชิงเทรา", location_type: "terminal", latitude: null, longitude: null, coordinate_source: null, verified_by: null },
    { location_id: "LOC-002", location_name_th: "สี่แยกโคนม", location_type: "stop", latitude: null, longitude: null, coordinate_source: null, verified_by: null }
  ]);
  sheets["03_เส้นทาง"] = matrixFor(activeMapping, "03_เส้นทาง", [{
    route_id: "RTE-001", operator_id: "OPR-BUS01", route_short_name: "สายทดสอบ",
    route_long_name_th: "ฉะเชิงเทรา–คลองหาด", service_type: "fixed",
    origin_location_id: "LOC-001", destination_location_id: "LOC-002"
  }]);
  sheets["04_รูปแบบเส้นทาง"] = matrixFor(activeMapping, "04_รูปแบบเส้นทาง", [
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 1, location_id: "LOC-001" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 2, location_id: "LOC-002" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 3, location_id: "LOC-001" }
  ]);
  sheets["05_ปฏิทินบริการ"] = matrixFor(activeMapping, "05_ปฏิทินบริการ", [{
    service_calendar_id: "CAL-001", service_name_th: "ทุกวัน",
    monday: "yes", tuesday: "yes", wednesday: "yes", thursday: "yes", friday: "yes", saturday: "yes", sunday: "yes",
    start_date: "2026-01-01", end_date: "2026-12-31"
  }]);
  sheets["07_แม่แบบเที่ยว"] = matrixFor(activeMapping, "07_แม่แบบเที่ยว", [{
    trip_template_id: "TRP-001", route_id: "RTE-001", journey_pattern_id: "PAT-001",
    service_calendar_id: "CAL-001", departure_time: "09:00", default_capacity: 3, booking_enabled: "yes"
  }]);
  sheets["08_เวลารายป้าย"] = matrixFor(activeMapping, "08_เวลารายป้าย", [
    { stop_time_id: "STM-001", trip_template_id: "TRP-001", stop_sequence: 1, location_id: "LOC-001", arrival_time: "09:00", departure_time: "09:00" },
    { stop_time_id: "STM-002", trip_template_id: "TRP-001", stop_sequence: 2, location_id: "LOC-002", arrival_time: "09:20", departure_time: "09:20" },
    { stop_time_id: "STM-003", trip_template_id: "TRP-001", stop_sequence: 3, location_id: "LOC-001", arrival_time: "09:40", departure_time: "09:40" }
  ]);
  sheets["09_ค่าโดยสาร"] = matrixFor(activeMapping, "09_ค่าโดยสาร", [{
    fare_rule_id: "FAR-001", fare_product_id: "FPR-001", route_id: "RTE-001",
    origin_location_id: "LOC-001", destination_location_id: "LOC-002", currency: "THB", base_fare: 0
  }]);
  sheets["11_รถ"] = matrixFor(activeMapping, "11_รถ", [{
    vehicle_id: "VEH-001", operator_id: "OPR-BUS01", vehicle_type: "van", capacity: 6
  }]);
  return { sheets };
}

function parserFor(workbook) {
  return {
    read() { return { SheetNames: Object.keys(workbook.sheets), Sheets: workbook.sheets }; },
    utils: { sheet_to_json(sheet) { return sheet; } }
  };
}

function convert(version, workbook) {
  return excel.convertWorkbook({
    workbook: workbook || workbookFor(version),
    baseMapping,
    profile: profile(version),
    mapper,
    operatorScope: ["OPR-BUS01"],
    sourceChecksumSha256: "sha256:" + "a".repeat(64)
  });
}
test("แปลงจุดต่อรถแบบ fixed ไป frequency โดยใช้ Service ID เป็นตัวกรองเสริม", function () {
  const pkg = excel.makePackage({
    operator: [
      { operatorId: "OPR-A", operatorNameTh: "บริษัท A" },
      { operatorId: "OPR-B", operatorNameTh: "บริษัท B" }
    ],
    location: [{ locationId: "LOC-H", locationType: "hub", locationNameTh: "ฉะเชิงเทรา" }],
    route: [
      { routeId: "RTE-A", operatorId: "OPR-A", routeShortName: "A", serviceType: "fixed" },
      { routeId: "RTE-B", operatorId: "OPR-B", routeShortName: "B", serviceType: "frequency" }
    ],
    fixedTrip: [{ tripTemplateId: "TRP-A", routeId: "RTE-A" }],
    frequencyService: [{ frequencyServiceId: "FRQ-B", routeId: "RTE-B" }],
    transferRule: [{
      connectionId: "TRF-H",
      hubLocationId: "LOC-H",
      inboundOperatorId: "OPR-A",
      outboundOperatorId: "OPR-B",
      inboundServiceMode: "fixed",
      outboundServiceMode: "frequency",
      inboundServiceId: "TRP-A",
      outboundServiceId: "FRQ-B",
      minimumTransferMinutes: 5,
      maximumTransferMinutes: 60,
      throughBooking: "no",
      baggageTransfer: "no"
    }]
  }, { schemaVersion: "greenfield-erp-v1" });
  assert.deepEqual(pkg.transferRules[0], {
    transferRuleId: "TRF-H",
    fromLocationId: "LOC-H",
    toLocationId: "LOC-H",
    locationNameTh: "ฉะเชิงเทรา",
    minimumTransferSeconds: 300,
    maximumTransferSeconds: 3600,
    throughBooking: false,
    baggageTransfer: false,
    fromOperatorId: "OPR-A",
    toOperatorId: "OPR-B",
    fromServiceMode: "fixed",
    toServiceMode: "frequency",
    fromServiceId: "TRP-A",
    toServiceId: "FRQ-B"
  });
});

test("รองรับ Excel 3.3.4 และ 3.3.5 โดยอ่านรุ่นจากชีต 91 ช่อง C5", function () {
  ["3.3.4", "3.3.5"].forEach(function (version) {
    const result = convert(version);
    assert.equal(result.ok, true);
    assert.equal(result.version, version);
    assert.equal(result.package.metadata.mode, "validate_only");
    assert.equal(result.package.metadata.templateVersion, version);
    assert.deepEqual(validator.validateNetworkPackage(result.package), []);
  });
});

test("สร้างรายงานความพร้อมพร้อมยอดข้อมูลก่อนเรียก Backend", function () {
  const result = convert("3.3.5");
  assert.equal(result.report.status, "ready");
  assert.equal(result.report.blockingCount, 0);
  assert.equal(result.report.warningCount, 0);
  assert.deepEqual(result.report.summary, {
    operators: 1,
    locations: 2,
    routes: 1,
    journeyPatterns: 1,
    fixedTrips: 1,
    stopTimes: 3,
    frequencyServices: 0,
    fareRules: 1,
    transferRules: 0
  });
  assert.equal(result.report.gates.frequency.status, "ready");
  assert.equal(result.report.gates.transfers.status, "ready");
});

test("ไม่มีพิกัดและระยะทางก็สร้างข้อมูลเครือข่ายได้", function () {
  const result = convert("3.3.5");
  assert.equal(result.ok, true);
  assert.equal("latitude" in result.package.locations[0], false);
  assert.equal("longitude" in result.package.locations[0], false);
});

test("ข้อมูลรถและข้อมูลปฏิบัติการไม่สูญหาย และถูกเก็บใน Draft แยกหมวด", function () {
  const result = convert("3.3.5");
  assert.equal(result.package.operationalRecords.vehicles.length, 1);
  assert.equal(result.package.operationalRecords.vehicles[0].vehicleId, "VEH-001");
  assert.equal(draftService.entityCount(result.package), 13);
  const records = draftStore.entityRecords("DRF-TEST", result.package);
  assert.ok(records.some(function (record) {
    return record.path === "authoring/drafts/DRF-TEST/entities/vehicles/VEH-001";
  }));
});

test("จุดเชื่อมต่อเดิมซ้ำได้เมื่ออยู่คนละลำดับในเส้นทางแยก", function () {
  const result = convert("3.3.5");
  assert.deepEqual(result.package.journeyPatterns[0].stops.map(function (stop) { return stop.locationId; }), ["LOC-001", "LOC-002", "LOC-001"]);
  assert.equal(result.errors.some(function (error) { return error.code === "excel.id_duplicate"; }), false);
});

test("ปฏิเสธรุ่นไม่รองรับและหัวตารางที่หายไปด้วยข้อความที่อ่านรู้เรื่อง", function () {
  const wrongVersion = workbookFor("3.3.5");
  wrongVersion.sheets["91_ควบคุมการนำเข้า"][4][2] = "3.2.0";
  assert.throws(function () { convert("3.3.5", wrongVersion); }, function (error) {
    return error.code === "excel_version_not_supported";
  });

  const missingHeader = workbookFor("3.3.5");
  const headers = missingHeader.sheets["03_เส้นทาง"][2];
  headers[headers.indexOf("route_id")] = "";
  const result = convert("3.3.5", missingHeader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) {
    return error.code === "excel.header_missing" && /route_id/.test(error.message);
  }));
});

test("ปฏิเสธรหัสอ้างอิงที่ไม่มีจริงก่อนส่ง Backend", function () {
  const workbook = workbookFor("3.3.5");
  const mapping = mapper.applyMappingProfile(baseMapping, profile("3.3.5"));
  const headers = workbook.sheets["03_เส้นทาง"][2];
  workbook.sheets["03_เส้นทาง"][4][headers.indexOf("operator_id")] = "OPR-MISSING";
  const result = excel.convertWorkbook({
    workbook, baseMapping, profile: profile("3.3.5"), mapper,
    operatorScope: ["OPR-BUS01"], sourceChecksumSha256: "sha256:" + "b".repeat(64)
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) { return /หน่วยงานที่ไม่มี/.test(error.message); }));
  assert.ok(mapping.sheets["02_จุดบริการ"].fields.find(function (field) { return field.sourceColumn === "latitude"; }).required === false);
});

test("หน้า Admin รับ xlsx แปลงเป็น JSON และยังไม่มีคำสั่ง Publish", function () {
  const html = fs.readFileSync(path.join(repositoryRoot, "admin-erp1.html"), "utf8");
  const controller = fs.readFileSync(path.join(repositoryRoot, "admin-erp1-greenfield-controller.js"), "utf8");
  assert.match(html, /assets\/vendor\/xlsx\.full\.min\.js/);
  assert.match(html, /admin-erp1-excel-3-3-x\.js/);
  assert.match(html, /accept="\.xlsx,\.json/);
  assert.match(controller, /convertFileToCanonical/);
  assert.match(controller, /renderExcelReadiness\(converted\.report\)/);
  assert.match(controller, /error && error\.report/);
  assert.match(html, /id="excel-readiness"/);
  assert.match(html, /id="excel-blocking-list"/);
  assert.match(html, /id="excel-warning-list"/);
  assert.match(html, /id="excel-frequency-gate"/);
  assert.match(html, /id="excel-transfer-gate"/);
  assert.equal(controller.includes("innerHTML"), false);
  assert.match(controller, /contentType: "application\/json"/);
  assert.equal(controller.includes('client.send("publish'), false);
  const bundledReader = fs.readFileSync(path.join(repositoryRoot, "assets/vendor/xlsx.full.min.js"), "utf8");
  assert.match(bundledReader, /version="0\.20\.3"/);
  assert.ok(fs.readFileSync(path.join(repositoryRoot, "assets/vendor/XLSX-LICENSE.txt"), "utf8").includes("Apache License"));
});

test("ไฟล์ xlsx ถูกแปลงเป็นไฟล์ JSON สำหรับเขตกักกันก่อนอัปโหลด", async function () {
  const workbook = workbookFor("3.3.5");
  const parser = parserFor(workbook);

  const source = new File([new Uint8Array([1, 2, 3])], "new erp data.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const converted = await excel.convertFileToCanonical(source, {
    parser,
    crypto: webcrypto,
    mapper,
    operatorScope: ["OPR-BUS01"],
    mapping: { base: baseMapping, profile: profile("3.3.5") }
  });
  assert.equal(converted.version, "3.3.5");
  assert.equal(converted.file.type, "application/json");
  assert.match(converted.file.name, /\.canonical\.json$/);
  const payload = JSON.parse(await converted.file.text());
  assert.equal(payload.metadata.mode, "validate_only");
  assert.equal(payload.operationalRecords.vehicles[0].vehicleId, "VEH-001");
  assert.equal(converted.report.status, "ready");
  assert.equal(converted.report.summary.stopTimes, 3);
});

test("ใช้ชื่อป้ายจากชีตสำรวจได้เมื่อชีตจุดบริการยังไม่มี และไม่บังคับข้อมูลสำรวจ รถ หรือใบขับขี่ที่ยังไม่ทราบ", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  const surveySheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("02B_"); });
  const patternSheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("04_"); });
  const vehicleSheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("11_"); });
  const driverSheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("12_"); });

  workbook.sheets[surveySheet] = matrixFor(activeMapping, surveySheet, [{
    survey_id: "SRV-003", location_id: "LOC-003", location_name_th: "ป้ายตัวอย่าง",
    location_type: "stop", country_code: "TH", public_visible: "yes",
    approval_state: "approved", record_status: "active", effective_from: "2026-01-01",
    source_row_id: "SRC-SRV-003"
  }]);
  workbook.sheets[patternSheet] = matrixFor(activeMapping, patternSheet, [
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 1, location_id: "LOC-001" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 2, location_id: "LOC-002" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 3, location_id: "LOC-001" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 4, location_id: "LOC-003" }
  ]);
  workbook.sheets[vehicleSheet] = matrixFor(activeMapping, vehicleSheet, [{
    vehicle_id: "VEH-001", operator_id: "OPR-BUS01", fleet_number: "1",
    registration_number: "TEST-1", vehicle_type: "van", seat_capacity: null,
    vehicle_status: "active", record_status: "active", effective_from: "2026-01-01",
    change_reason: "ทดสอบ", source_row_id: "SRC-VEH-001"
  }]);
  workbook.sheets[driverSheet] = matrixFor(activeMapping, driverSheet, [{
    driver_id: "DRV-001", operator_id: "OPR-BUS01", employee_number: "1",
    display_name_th: "คนขับตัวอย่าง", license_class: null, license_expiry: null,
    qualified_vehicle_types: "van", driver_status: "active", record_status: "active",
    effective_from: "2026-01-01", change_reason: "ทดสอบ", source_row_id: "SRC-DRV-001"
  }]);

  const result = convert(version, workbook);
  assert.equal(result.ok, true);
  assert.equal(result.package.locations.find(function (item) { return item.locationId === "LOC-003"; }).nameTh, "ป้ายตัวอย่าง");
  assert.equal(result.package.journeyPatterns[0].stops[3].locationNameTh, "ป้ายตัวอย่าง");
  assert.equal(result.package.operationalRecords.locationSurveys.length, 1);
  assert.equal("seatCapacity" in result.package.operationalRecords.vehicles[0], false);
  assert.equal("licenseClass" in result.package.operationalRecords.drivers[0], false);
});


test("อ่านกติกาตารางเวลาและกฎคิวรายวันเข้า Draft operational records", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["05A_กติกาตารางเวลา"] = matrixFor(activeMapping, "05A_กติกาตารางเวลา", [{
    schedule_rule_id: "RUL-002-01", service_group_id: "GRP-002", day_scope: "all_days",
    schedule_mode: "fixed_recurring", service_calendar_id: "CAL-001", admin_entry_cycle: "daily"
  }]);
  workbook.sheets["23_กฎจัดคิวรายวัน"] = matrixFor(activeMapping, "23_กฎจัดคิวรายวัน", [{
    queue_rule_id: "QRL-001", assignment_mode: "rotation", vehicle_ids: "VEH-001",
    queue_ids: "QUE-001", rotate_daily: "yes", generation_time: "23:45",
    manual_override_supported: "yes", active: "yes"
  }]);
  const result = convert(version, workbook);
  assert.equal(result.ok, true);
  assert.equal(result.package.operationalRecords.scheduleRules[0].scheduleRuleId, "RUL-002-01");
  assert.equal(result.package.operationalRecords.dailyQueueRules[0].queueRuleId, "QRL-001");
});

test("หยุด Draft เมื่อ GRP-001 ยังเป็นเที่ยวเวลาคงที่และไม่มีข้อมูล headway", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_กลุ่มบริการ"] = matrixFor(activeMapping, "02C_กลุ่มบริการ", [{
    service_group_id: "GRP-001", service_group_name_th: "รถคิว", display_order: 1
  }]);
  const routeHeaders = workbook.sheets["03_เส้นทาง"][2];
  workbook.sheets["03_เส้นทาง"][4][routeHeaders.indexOf("service_group_id")] = "GRP-001";
  workbook.sheets["03_เส้นทาง"][4][routeHeaders.indexOf("service_type")] = "scheduled";
  workbook.sheets["05A_กติกาตารางเวลา"] = matrixFor(activeMapping, "05A_กติกาตารางเวลา", [{
    schedule_rule_id: "RUL-001", service_group_id: "GRP-001", day_scope: "all_days",
    schedule_mode: "fixed_recurring", service_calendar_id: "CAL-001", admin_entry_cycle: "not_required"
  }]);
  const result = convert(version, workbook);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_mode_required" && error.sheetName === "03_เส้นทาง"; }));
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_schedule_mode_conflict" && error.sheetName === "05A_กติกาตารางเวลา"; }));
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_fixed_trip_conflict" && error.sheetName === "07_แม่แบบเที่ยว"; }));
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_data_required" && error.sheetName === "24_บริการตามความถี่"; }));
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.gates.frequency.status, "blocked");
  const frequencyIssue = result.report.errors.find(function (error) { return error.code === "excel.frequency_mode_required"; });
  assert.equal(frequencyIssue.sheetName, "03_เส้นทาง");
  assert.equal(frequencyIssue.rowNumber, 5);
  assert.equal(frequencyIssue.sourceColumn, "service_type");
});

test("สร้าง Frequency Service ได้เมื่อมี headway จริงและไม่เดาเวลาจาก Fixed Trip", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_กลุ่มบริการ"] = matrixFor(activeMapping, "02C_กลุ่มบริการ", [{
    service_group_id: "GRP-001", service_group_name_th: "รถคิว", display_order: 1
  }]);
  const routeHeaders = workbook.sheets["03_เส้นทาง"][2];
  workbook.sheets["03_เส้นทาง"][4][routeHeaders.indexOf("service_group_id")] = "GRP-001";
  workbook.sheets["03_เส้นทาง"][4][routeHeaders.indexOf("service_type")] = "frequency";
  workbook.sheets["07_แม่แบบเที่ยว"] = matrixFor(activeMapping, "07_แม่แบบเที่ยว", []);
  workbook.sheets["08_เวลารายป้าย"] = matrixFor(activeMapping, "08_เวลารายป้าย", []);
  workbook.sheets["05A_กติกาตารางเวลา"] = matrixFor(activeMapping, "05A_กติกาตารางเวลา", [{
    schedule_rule_id: "RUL-001", service_group_id: "GRP-001", day_scope: "all_days",
    schedule_mode: "frequency", service_calendar_id: "CAL-001", admin_entry_cycle: "not_required"
  }]);
  workbook.sheets["24_บริการตามความถี่"] = matrixFor(activeMapping, "24_บริการตามความถี่", [{
    frequency_service_id: "FRQ-001", route_id: "RTE-001", journey_pattern_id: "PAT-001",
    service_calendar_id: "CAL-001", start_time: "06:00", end_time: "18:00",
    headway_secs: 600, boarding_model: "queue", exact_times: "no"
  }]);
  const result = convert(version, workbook);
  assert.equal(result.ok, true);
  assert.equal(result.package.frequencyServices.length, 1);
  assert.equal(result.package.frequencyServices[0].headwaySeconds, 600);
  assert.equal(result.package.frequencyServices[0].boardingModel, "queue");
  assert.equal(result.package.fixedTrips.length, 0);
});

test("ต้องมีจุดต่อเที่ยวเมื่อข้อมูลมีหลายกลุ่มบริการ", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_กลุ่มบริการ"] = matrixFor(activeMapping, "02C_กลุ่มบริการ", [
    { service_group_id: "GRP-002", service_group_name_th: "กลุ่มสอง", display_order: 2 },
    { service_group_id: "GRP-003", service_group_name_th: "กลุ่มสาม", display_order: 3 }
  ]);
  const result = convert(version, workbook);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) {
    return error.code === "excel.transfer_rule_required" && error.sheetName === "19_จุดต่อเที่ยว" && error.rowNumber === 5;
  }));
  assert.equal(result.report.gates.transfers.status, "blocked");
  assert.equal(result.report.gates.transfers.issueCount, 1);
});

test("ไฟล์ที่ไม่พร้อมส่งคืนรายงานให้หน้า Admin และหยุดก่อนอัปโหลด", async function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_กลุ่มบริการ"] = matrixFor(activeMapping, "02C_กลุ่มบริการ", [
    { service_group_id: "GRP-002", service_group_name_th: "กลุ่มสอง", display_order: 2 },
    { service_group_id: "GRP-003", service_group_name_th: "กลุ่มสาม", display_order: 3 }
  ]);
  const source = new File([new Uint8Array([1, 2, 3])], "blocked.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  await assert.rejects(excel.convertFileToCanonical(source, {
    parser: parserFor(workbook),
    crypto: webcrypto,
    mapper,
    operatorScope: ["OPR-BUS01"],
    mapping: { base: baseMapping, profile: profile(version) }
  }), function (error) {
    return error.code === "excel_validation_failed" &&
      error.report && error.report.status === "blocked" &&
      error.report.gates.transfers.status === "blocked";
  });
});
