"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Editor = require("../admin-erp1-data-editor.js");
const ROOT = path.join(__dirname, "..");

test("typed editor exposes the canonical and operational entity catalog", function () {
  ["operators", "locations", "routes", "fixedTrips", "stopTimes", "frequencyServices", "fareRules", "transferRules", "vehicles", "drivers"].forEach(function (entityType) {
    assert.ok(Editor.ENTITIES[entityType], entityType);
    assert.ok(Editor.ENTITIES[entityType].idField, entityType + " idField");
  });
});

test("service time accepts the Greenfield 00:00:00 through 47:59:59 range", function () {
  assert.equal(Editor.serviceTimeToSeconds("00:00:00"), 0);
  assert.equal(Editor.serviceTimeToSeconds("24:15:00"), 87300);
  assert.equal(Editor.serviceTimeToSeconds("47:59:59"), 172799);
  assert.equal(Editor.secondsToServiceTime(172799), "47:59:59");
  assert.throws(function () { Editor.serviceTimeToSeconds("48:00:00"); }, /service_time_invalid/);
  assert.throws(function () { Editor.shiftServiceTime("47:59:59", 1); }, /service_time_out_of_range/);
});

test("bulk time shift changes only loaded fixed records and preserves other fields", function () {
  const entries = [
    { entityId: "STP-TIME-1", value: { stopTimeId: "STP-TIME-1", fixedTripId: "TRIP-1", stopSequence: 1, locationId: "STOP-1", arrivalTime: "23:55:00", departureTime: "23:57:00", sourceRowId: "08:5" } },
    { entityId: "STP-TIME-2", value: { stopTimeId: "STP-TIME-2", fixedTripId: "TRIP-1", stopSequence: 2, locationId: "STOP-2", arrivalTime: "24:10:00", departureTime: "24:12:00", sourceRowId: "08:6" } }
  ];
  const operations = Editor.buildTimeShiftOperations("stopTimes", entries, 10);
  assert.equal(operations.length, 2);
  assert.equal(operations[0].value.arrivalTime, "24:05:00");
  assert.equal(operations[0].value.departureTime, "24:07:00");
  assert.equal(operations[0].value.sourceRowId, "08:5");
  assert.equal(entries[0].value.arrivalTime, "23:55:00");
});

test("bulk time shift is bounded and cannot target frequency records", function () {
  const tooMany = Array.from({ length: 101 }, function (_item, index) {
    return { entityId: "TRIP-" + index, value: { fixedTripId: "TRIP-" + index, departureTime: "06:00:00" } };
  });
  assert.throws(function () { Editor.buildTimeShiftOperations("fixedTrips", tooMany, 5); }, /bulk_operation_count_invalid/);
  assert.throws(function () {
    Editor.buildTimeShiftOperations("frequencyServices", [{ entityId: "FREQ-1", value: { frequencyServiceId: "FREQ-1" } }], 5);
  }, /time_shift_entity_unsupported/);
});

test("Fixed and Frequency records use separate validation rules", function () {
  assert.doesNotThrow(function () {
    Editor.validateRecord("fixedTrips", { fixedTripId: "TRIP-1", departureTime: "25:10:00" });
  });
  assert.doesNotThrow(function () {
    Editor.validateRecord("frequencyServices", {
      frequencyServiceId: "FREQ-1",
      startTime: "06:00:00",
      endTime: "18:00:00",
      headwaySeconds: 600,
      boardingModel: "queue",
      exactTimes: false
    });
  });
  assert.throws(function () {
    Editor.validateRecord("frequencyServices", {
      frequencyServiceId: "FREQ-1",
      startTime: "18:00:00",
      endTime: "06:00:00",
      headwaySeconds: 600
    });
  }, /frequency_window_invalid/);
  assert.throws(function () {
    Editor.validateRecord("frequencyServices", {
      frequencyServiceId: "FREQ-1",
      startTime: "06:00:00",
      endTime: "18:00:00",
      headwaySeconds: 30
    });
  }, /frequency_headway_invalid/);
});

test("new Frequency template is explicit and does not pretend to come from Excel", function () {
  const entry = Editor.newRecord("frequencyServices");
  assert.equal(entry.isNew, true);
  assert.equal(entry.value.frequencyServiceId, "");
  assert.equal(entry.value.headwaySeconds, 600);
  assert.equal(entry.value.boardingModel, "queue");
  assert.equal(entry.value.exactTimes, false);
});

test("Admin ERP1 keeps one entry, loads the editor before controller, and hides raw JSON hooks", function () {
  const html = fs.readFileSync(path.join(ROOT, "admin-erp1.html"), "utf8");
  assert.equal((html.match(/id="draft-record-body"/g) || []).length, 1);
  assert.equal((html.match(/id="draft-record-form"/g) || []).length, 1);
  assert.match(html, /id="draft-json"[^>]*hidden/);
  assert.ok(html.indexOf('src="admin-erp1-data-editor.js"') < html.indexOf('src="admin-erp1-greenfield-controller.js"'));
  assert.match(html, /id="excel-error-body"/);
  assert.match(html, /id="validation-error-body"/);
  assert.match(html, /id="time-shift-panel"/);
});

test("controller reuses bounded Draft commands and contains no direct Firebase write", function () {
  const controller = fs.readFileSync(path.join(ROOT, "admin-erp1-greenfield-controller.js"), "utf8");
  assert.match(controller, /client\.send\("draft\.read"/);
  assert.match(controller, /client\.send\("draft\.save"/);
  assert.match(controller, /client\.send\("draft\.validate"/);
  assert.match(controller, /DataEditor\.buildTimeShiftOperations/);
  assert.match(controller, /const DataEditor = root\\.SLTransitAdminErpDataEditor;/);
  assert.match(controller, /!State \\|\\| !Api \\|\\| !DataEditor/);
  assert.doesNotMatch(controller, /firebase\.database\s*\(/);
  assert.doesNotMatch(controller, /\.ref\s*\(/);
  assert.doesNotMatch(controller, /client\.send\("publish/);
});

test("mobile navigation and record list are forced to one item per row", function () {
  const css = fs.readFileSync(path.join(ROOT, "admin-erp-ui.css"), "utf8");
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.nav-group \{ display: block !important/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.record-table tr \{ display: grid; grid-template-columns: 1fr/);
});