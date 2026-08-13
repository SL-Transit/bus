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
  if (field.sourceColumn === "change_reason") return "?????????????????";
  if (field.sourceColumn === "source_row_id") return "SRC-" + rowNumber;
  return "TEST";
}

function matrixFor(mapping, sheetName, rows) {
  const sheet = mapping.sheets[sheetName];
  const headers = sheet.fields.map(function (field) { return field.sourceColumn; });
  const matrix = [[], [], headers, headers.map(function () { return "????????"; })];
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
  sheets["91_???????????????"] = [[], [], [], [], [null, null, version]];
  sheets["01_????????"] = matrixFor(activeMapping, "01_????????", [{
    operator_id: "OPR-BUS01", operator_name_th: "?????????????????", timezone: "Asia/Bangkok"
  }]);
  sheets["02_?????????"] = matrixFor(activeMapping, "02_?????????", [
    { location_id: "LOC-001", location_name_th: "??????????", location_type: "terminal", latitude: null, longitude: null, coordinate_source: null, verified_by: null },
    { location_id: "LOC-002", location_name_th: "??????????", location_type: "stop", latitude: null, longitude: null, coordinate_source: null, verified_by: null }
  ]);
  sheets["03_???????"] = matrixFor(activeMapping, "03_???????", [{
    route_id: "RTE-001", operator_id: "OPR-BUS01", route_short_name: "????????",
    route_long_name_th: "??????????????????", service_type: "fixed",
    origin_location_id: "LOC-001", destination_location_id: "LOC-002"
  }]);
  sheets["04_?????????????"] = matrixFor(activeMapping, "04_?????????????", [
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 1, location_id: "LOC-001" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 2, location_id: "LOC-002" },
    { journey_pattern_id: "PAT-001", route_id: "RTE-001", stop_sequence: 3, location_id: "LOC-001" }
  ]);
  sheets["05_????????????"] = matrixFor(activeMapping, "05_????????????", [{
    service_calendar_id: "CAL-001", service_name_th: "??????",
    monday: "yes", tuesday: "yes", wednesday: "yes", thursday: "yes", friday: "yes", saturday: "yes", sunday: "yes",
    start_date: "2026-01-01", end_date: "2026-12-31"
  }]);
  sheets["07_????????????"] = matrixFor(activeMapping, "07_????????????", [{
    trip_template_id: "TRP-001", route_id: "RTE-001", journey_pattern_id: "PAT-001",
    service_calendar_id: "CAL-001", departure_time: "09:00", default_capacity: 3, booking_enabled: "yes"
  }]);
  sheets["08_???????????"] = matrixFor(activeMapping, "08_???????????", [
    { stop_time_id: "STM-001", trip_template_id: "TRP-001", stop_sequence: 1, location_id: "LOC-001", arrival_time: "09:00", departure_time: "09:00" },
    { stop_time_id: "STM-002", trip_template_id: "TRP-001", stop_sequence: 2, location_id: "LOC-002", arrival_time: "09:20", departure_time: "09:20" },
    { stop_time_id: "STM-003", trip_template_id: "TRP-001", stop_sequence: 3, location_id: "LOC-001", arrival_time: "09:40", departure_time: "09:40" }
  ]);
  sheets["09_?????????"] = matrixFor(activeMapping, "09_?????????", [{
    fare_rule_id: "FAR-001", fare_product_id: "FPR-001", route_id: "RTE-001",
    origin_location_id: "LOC-001", destination_location_id: "LOC-002", currency: "THB", base_fare: 0
  }]);
  sheets["11_??"] = matrixFor(activeMapping, "11_??", [{
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

test("?????? Excel 3.3.4 ??? 3.3.5 ????????????????? 91 ???? C5", function () {
  ["3.3.4", "3.3.5"].forEach(function (version) {
    const result = convert(version);
    assert.equal(result.ok, true);
    assert.equal(result.version, version);
    assert.equal(result.package.metadata.mode, "validate_only");
    assert.equal(result.package.metadata.templateVersion, version);
    assert.deepEqual(validator.validateNetworkPackage(result.package), []);
  });
});

test("??????????????????????????????????????????? Backend", function () {
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

test("?????????????????????????????????????????????", function () {
  const result = convert("3.3.5");
  assert.equal(result.ok, true);
  assert.equal("latitude" in result.package.locations[0], false);
  assert.equal("longitude" in result.package.locations[0], false);
});

test("???????????????????????????????????? ???????????? Draft ???????", function () {
  const result = convert("3.3.5");
  assert.equal(result.package.operationalRecords.vehicles.length, 1);
  assert.equal(result.package.operationalRecords.vehicles[0].vehicleId, "VEH-001");
  assert.equal(draftService.entityCount(result.package), 13);
  const records = draftStore.entityRecords("DRF-TEST", result.package);
  assert.ok(records.some(function (record) {
    return record.path === "authoring/drafts/DRF-TEST/entities/vehicles/VEH-001";
  }));
});

test("????????????????????????????????????????????????????", function () {
  const result = convert("3.3.5");
  assert.deepEqual(result.package.journeyPatterns[0].stops.map(function (stop) { return stop.locationId; }), ["LOC-001", "LOC-002", "LOC-001"]);
  assert.equal(result.errors.some(function (error) { return error.code === "excel.id_duplicate"; }), false);
});

test("?????????????????????????????????????????????????????????????????", function () {
  const wrongVersion = workbookFor("3.3.5");
  wrongVersion.sheets["91_???????????????"][4][2] = "3.2.0";
  assert.throws(function () { convert("3.3.5", wrongVersion); }, function (error) {
    return error.code === "excel_version_not_supported";
  });

  const missingHeader = workbookFor("3.3.5");
  const headers = missingHeader.sheets["03_???????"][2];
  headers[headers.indexOf("route_id")] = "";
  const result = convert("3.3.5", missingHeader);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) {
    return error.code === "excel.header_missing" && /route_id/.test(error.message);
  }));
});

test("???????????????????????????????????? Backend", function () {
  const workbook = workbookFor("3.3.5");
  const mapping = mapper.applyMappingProfile(baseMapping, profile("3.3.5"));
  const headers = workbook.sheets["03_???????"][2];
  workbook.sheets["03_???????"][4][headers.indexOf("operator_id")] = "OPR-MISSING";
  const result = excel.convertWorkbook({
    workbook, baseMapping, profile: profile("3.3.5"), mapper,
    operatorScope: ["OPR-BUS01"], sourceChecksumSha256: "sha256:" + "b".repeat(64)
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) { return /????????????????/.test(error.message); }));
  assert.ok(mapping.sheets["02_?????????"].fields.find(function (field) { return field.sourceColumn === "latitude"; }).required === false);
});

test("???? Admin ??? xlsx ???????? JSON ????????????????? Publish", function () {
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

test("???? xlsx ??????????????? JSON ??????????????????????????", async function () {
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

test("?????????????????????????????????????????????????? ??????????????????????? ?? ?????????????????????????", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  const surveySheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("02B_"); });
  const patternSheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("04_"); });
  const vehicleSheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("11_"); });
  const driverSheet = Object.keys(activeMapping.sheets).find(function (name) { return name.startsWith("12_"); });

  workbook.sheets[surveySheet] = matrixFor(activeMapping, surveySheet, [{
    survey_id: "SRV-003", location_id: "LOC-003", location_name_th: "????????????",
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
    change_reason: "?????", source_row_id: "SRC-VEH-001"
  }]);
  workbook.sheets[driverSheet] = matrixFor(activeMapping, driverSheet, [{
    driver_id: "DRV-001", operator_id: "OPR-BUS01", employee_number: "1",
    display_name_th: "?????????????", license_class: null, license_expiry: null,
    qualified_vehicle_types: "van", driver_status: "active", record_status: "active",
    effective_from: "2026-01-01", change_reason: "?????", source_row_id: "SRC-DRV-001"
  }]);

  const result = convert(version, workbook);
  assert.equal(result.ok, true);
  assert.equal(result.package.locations.find(function (item) { return item.locationId === "LOC-003"; }).nameTh, "????????????");
  assert.equal(result.package.journeyPatterns[0].stops[3].locationNameTh, "????????????");
  assert.equal(result.package.operationalRecords.locationSurveys.length, 1);
  assert.equal("seatCapacity" in result.package.operationalRecords.vehicles[0], false);
  assert.equal("licenseClass" in result.package.operationalRecords.drivers[0], false);
});


test("???????????????????????????????????? Draft operational records", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["05A_??????????????"] = matrixFor(activeMapping, "05A_??????????????", [{
    schedule_rule_id: "RUL-002-01", service_group_id: "GRP-002", day_scope: "all_days",
    schedule_mode: "fixed_recurring", service_calendar_id: "CAL-001", admin_entry_cycle: "daily"
  }]);
  workbook.sheets["23_??????????????"] = matrixFor(activeMapping, "23_??????????????", [{
    queue_rule_id: "QRL-001", assignment_mode: "rotation", vehicle_ids: "VEH-001",
    queue_ids: "QUE-001", rotate_daily: "yes", generation_time: "23:45",
    manual_override_supported: "yes", active: "yes"
  }]);
  const result = convert(version, workbook);
  assert.equal(result.ok, true);
  assert.equal(result.package.operationalRecords.scheduleRules[0].scheduleRuleId, "RUL-002-01");
  assert.equal(result.package.operationalRecords.dailyQueueRules[0].queueRuleId, "QRL-001");
});

test("???? Draft ????? GRP-001 ???????????????????????????????????? headway", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_???????????"] = matrixFor(activeMapping, "02C_???????????", [{
    service_group_id: "GRP-001", service_group_name_th: "?????", display_order: 1
  }]);
  const routeHeaders = workbook.sheets["03_???????"][2];
  workbook.sheets["03_???????"][4][routeHeaders.indexOf("service_group_id")] = "GRP-001";
  workbook.sheets["03_???????"][4][routeHeaders.indexOf("service_type")] = "scheduled";
  workbook.sheets["05A_??????????????"] = matrixFor(activeMapping, "05A_??????????????", [{
    schedule_rule_id: "RUL-001", service_group_id: "GRP-001", day_scope: "all_days",
    schedule_mode: "fixed_recurring", service_calendar_id: "CAL-001", admin_entry_cycle: "not_required"
  }]);
  const result = convert(version, workbook);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_mode_required" && error.sheetName === "03_???????"; }));
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_schedule_mode_conflict" && error.sheetName === "05A_??????????????"; }));
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_fixed_trip_conflict" && error.sheetName === "07_????????????"; }));
  assert.ok(result.errors.some(function (error) { return error.code === "excel.frequency_data_required" && error.sheetName === "24_????????????????"; }));
  assert.equal(result.report.status, "blocked");
  assert.equal(result.report.gates.frequency.status, "blocked");
  const frequencyIssue = result.report.errors.find(function (error) { return error.code === "excel.frequency_mode_required"; });
  assert.equal(frequencyIssue.sheetName, "03_???????");
  assert.equal(frequencyIssue.rowNumber, 5);
  assert.equal(frequencyIssue.sourceColumn, "service_type");
});

test("????? Frequency Service ?????????? headway ???????????????????? Fixed Trip", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_???????????"] = matrixFor(activeMapping, "02C_???????????", [{
    service_group_id: "GRP-001", service_group_name_th: "?????", display_order: 1
  }]);
  const routeHeaders = workbook.sheets["03_???????"][2];
  workbook.sheets["03_???????"][4][routeHeaders.indexOf("service_group_id")] = "GRP-001";
  workbook.sheets["03_???????"][4][routeHeaders.indexOf("service_type")] = "frequency";
  workbook.sheets["07_????????????"] = matrixFor(activeMapping, "07_????????????", []);
  workbook.sheets["08_???????????"] = matrixFor(activeMapping, "08_???????????", []);
  workbook.sheets["05A_??????????????"] = matrixFor(activeMapping, "05A_??????????????", [{
    schedule_rule_id: "RUL-001", service_group_id: "GRP-001", day_scope: "all_days",
    schedule_mode: "frequency", service_calendar_id: "CAL-001", admin_entry_cycle: "not_required"
  }]);
  workbook.sheets["24_????????????????"] = matrixFor(activeMapping, "24_????????????????", [{
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

test("??????????????????????????????????????????????", function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_???????????"] = matrixFor(activeMapping, "02C_???????????", [
    { service_group_id: "GRP-002", service_group_name_th: "????????", display_order: 2 },
    { service_group_id: "GRP-003", service_group_name_th: "????????", display_order: 3 }
  ]);
  const result = convert(version, workbook);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(function (error) {
    return error.code === "excel.transfer_rule_required" && error.sheetName === "19_????????????" && error.rowNumber === 5;
  }));
  assert.equal(result.report.gates.transfers.status, "blocked");
  assert.equal(result.report.gates.transfers.issueCount, 1);
});

test("?????????????????????????????????? Admin ??????????????????", async function () {
  const version = "3.3.5";
  const activeMapping = mapper.applyMappingProfile(baseMapping, profile(version));
  const workbook = workbookFor(version);
  workbook.sheets["02C_???????????"] = matrixFor(activeMapping, "02C_???????????", [
    { service_group_id: "GRP-002", service_group_name_th: "????????", display_order: 2 },
    { service_group_id: "GRP-003", service_group_name_th: "????????", display_order: 3 }
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
