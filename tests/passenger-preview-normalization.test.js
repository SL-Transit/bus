const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TH = {
  chachoengsao: '\u0e09\u0e30\u0e40\u0e0a\u0e34\u0e07\u0e40\u0e17\u0e23\u0e32 (\u0e41\u0e1b\u0e14\u0e23\u0e34\u0e49\u0e27)',
  chachoengsaoShort: '\u0e09\u0e30\u0e40\u0e0a\u0e34\u0e07\u0e40\u0e17\u0e23\u0e32',
  phanom: '\u0e1e\u0e19\u0e21\u0e2a\u0e32\u0e23\u0e04\u0e32\u0e21',
  sanamchai: '\u0e17\u0e48\u0e32\u0e23\u0e16\u0e2a\u0e19\u0e32\u0e21\u0e0a\u0e31\u0e22\u0e40\u0e02\u0e15',
  km1: '\u0e01\u0e21.1',
  km7: '\u0e01\u0e21.7',
  km10: '\u0e01\u0e21.10',
  huaiSom: '\u0e2b\u0e49\u0e27\u0e22\u0e42\u0e2a\u0e21',
  tatakiab: '\u0e17\u0e48\u0e32\u0e15\u0e30\u0e40\u0e01\u0e35\u0e22\u0e1a',
  nongkhok: '\u0e2b\u0e19\u0e2d\u0e07\u0e04\u0e2d\u0e01',
  khlongTakien: '\u0e04\u0e25\u0e2d\u0e07\u0e15\u0e30\u0e40\u0e04\u0e35\u0e22\u0e19',
  nongruea: '\u0e2b\u0e19\u0e2d\u0e07\u0e40\u0e23\u0e37\u0e2d',
  phaijit: '\u0e44\u0e1e\u0e23\u0e08\u0e34\u0e15',
  thoengkabin: '\u0e17\u0e38\u0e48\u0e07\u0e01\u0e1a\u0e34\u0e19\u0e17\u0e23\u0e4c',
  siyaekkhonom: '\u0e2a\u0e35\u0e48\u0e41\u0e22\u0e01\u0e42\u0e04\u0e19\u0e21',
  wangNamYen: '\u0e27\u0e31\u0e07\u0e19\u0e49\u0e33\u0e40\u0e22\u0e47\u0e19',
  khlonghat: '\u0e04\u0e25\u0e2d\u0e07\u0e2b\u0e32\u0e14',
  pattaya: '\u0e1e\u0e31\u0e17\u0e22\u0e32',
  rangsit: '\u0e23\u0e31\u0e07\u0e2a\u0e34\u0e15',
  transferGroup: '\u0e15\u0e48\u0e2d\u0e23\u0e16',
  estimatedBadge: '\u0e40\u0e27\u0e25\u0e32\u0e42\u0e14\u0e22\u0e1b\u0e23\u0e30\u0e21\u0e32\u0e13',
  estimatedDisclaimer: '\u0e40\u0e27\u0e25\u0e32\u0e1b\u0e23\u0e30\u0e21\u0e32\u0e13\u0e01\u0e32\u0e23 \u0e2d\u0e32\u0e08\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e41\u0e1b\u0e25\u0e07\u0e15\u0e32\u0e21\u0e2a\u0e20\u0e32\u0e1e\u0e01\u0e32\u0e23\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07',
  transferBadge: '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07',
  transferDisclaimer: '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e40\u0e1b\u0e47\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07'
};

const corridor = [
  TH.chachoengsao,
  TH.phanom,
  TH.sanamchai,
  TH.km1,
  TH.km7,
  TH.huaiSom,
  TH.tatakiab,
  TH.nongkhok,
  TH.khlongTakien,
  TH.nongruea,
  TH.phaijit,
  TH.thoengkabin,
  TH.siyaekkhonom,
  TH.wangNamYen,
  TH.khlonghat
];

function loadPassengerLogic() {
  const mapDisplaySource = fs.readFileSync(path.join(__dirname, '..', 'map-display-center.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'passenger-logic.js'), 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: function() {},
    cancelAnimationFrame: function() {},
    navigator: { geolocation: null },
    localStorage: {
      getItem: function() { return null; },
      setItem: function() {}
    },
    firebase: {
      initializeApp: function() { return { database: function() { return {}; } }; },
      app: function() { return { database: function() { return {}; } }; }
    },
    SLTransit: {
      core: { init: function() { return Promise.resolve(); } },
      db: { init: function() {}, getStops: function() { return Promise.resolve([]); } }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(mapDisplaySource, sandbox, { filename: 'map-display-center.js' });
  vm.runInNewContext(source, sandbox, { filename: 'passenger-logic.js' });
  return sandbox;
}

function installMapStub(sandbox) {
  const state = {
    markers: [],
    polylines: [],
    removed: [],
    markerMoves: [],
    resizeCount: 0,
    repaintCount: 0,
    locations: [],
    zooms: []
  };
  const mapObj = {
    Ui: ['DPad', 'Zoombar', 'Toolbar', 'LayerSelector', 'Fullscreen', 'Scale', 'Crosshair', 'Geolocation']
      .reduce((ui, name) => {
        ui[name] = { visible: function() {} };
        return ui;
      }, {}),
    Event: {
      bind: function(eventName, callback) {
        if (eventName === 'ready') sandbox.setTimeout(callback, 0);
      }
    },
    Overlays: {
      add: function(overlay) {
        if (overlay && overlay.__type === 'polyline') state.polylines.push(overlay);
        else state.markers.push(overlay);
      },
      remove: function(overlay) {
        state.removed.push(overlay);
      }
    },
    resize: function() {
      state.resizeCount += 1;
    },
    repaint: function() {
      state.repaintCount += 1;
    },
    location: function(point, animate) {
      state.locations.push({ point, animate });
    },
    zoom: function(value, animate) {
      state.zooms.push({ value, animate });
    }
  };
  sandbox.document = {
    getElementById: function() {
      return { addEventListener: function() {} };
    }
  };
  sandbox.longdo = {
    OverlayWeight: { Top: 'top' },
    Map: function() { return mapObj; },
    Marker: function(point, options) {
      return {
        __type: 'marker',
        point,
        options,
        move: function(nextPoint) {
          this.point = nextPoint;
          state.markerMoves.push({ marker: this, point: nextPoint, method: 'move' });
        },
        location: function(nextPoint) {
          this.point = nextPoint;
          state.markerMoves.push({ marker: this, point: nextPoint, method: 'location' });
        }
      };
    },
    Polyline: function(points, options) {
      return { __type: 'polyline', points, options };
    }
  };
  return state;
}

function waitForAsyncMapWork() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

const encodedDest1 = 'k_4LiB4LihLjE';
const encodedDest7 = 'k_4LiB4LihLjc';
const encodedDest10 = 'k_4LiB4LihLjEw';
const encodedPair1 = 'k_pair_chachoengsao_km1';
const encodedPair7 = 'k_pair_chachoengsao_km7';
const encodedPair10 = 'k_pair_chachoengsao_km10';
const encodedPairKm1Km7 = 'k_pair_km1_km7';

function pairKey(origin, dest) {
  return origin + '__' + dest;
}

function sampleSchedule() {
  return {
    originOptions: corridor.map((label, displayOrder) => ({ label, displayOrder })),
    origins: corridor,
    destinations: {
      [encodedDest1]: { destinationId: 'km_1' },
      [encodedDest7]: { destinationId: 'km_7' },
      [encodedDest10]: { destinationId: 'km_10', group: TH.transferGroup, displayOrder: 2 },
      [TH.khlongTakien]: { destinationId: 'khlong_takien' },
      [TH.khlonghat]: { destinationId: 'khlonghat' },
      [TH.chachoengsao]: { destinationId: 'chachoengsao' },
      [TH.phanom]: { destinationId: 'phanom' },
      [TH.sanamchai]: { destinationId: 'sanamchai' },
      [TH.huaiSom]: { destinationId: 'huai_som' },
      [TH.tatakiab]: { destinationId: 'tatakiab' },
      [TH.nongkhok]: { destinationId: 'nongkhok' },
      [TH.nongruea]: { destinationId: 'nongruea' },
      [TH.phaijit]: { destinationId: 'phaijit' },
      [TH.thoengkabin]: { destinationId: 'thoengkabin' },
      [TH.siyaekkhonom]: { destinationId: 'siyaekkhonom' },
      [TH.wangNamYen]: { destinationId: 'wang_nam_yen' },
      [TH.pattaya]: { group: TH.transferGroup, displayOrder: 1 }
    },
    pairs: {
      [encodedPair1]: {
        compatibilityPairKey: pairKey(TH.chachoengsao, TH.km1),
        originLabel: TH.chachoengsao,
        destinationLabel: TH.km1,
        segments: [{ times: [{ time: '09:00', isEstimated: true, displayBadgeTh: TH.estimatedBadge, disclaimerTh: TH.estimatedDisclaimer }] }]
      },
      [encodedPair7]: {
        compatibilityPairKey: pairKey(TH.chachoengsao, TH.km7),
        originLabel: TH.chachoengsao,
        destinationLabel: TH.km7,
        segments: [{ times: [{ time: '10:00' }] }]
      },
      [encodedPair10]: {
        compatibilityPairKey: pairKey(TH.chachoengsao, TH.km10),
        originLabel: TH.chachoengsao,
        destinationLabel: TH.km10,
        displayBadgeTh: TH.transferBadge,
        transferDisclaimerTh: TH.transferDisclaimer,
        segments: [{ times: [{ time: '11:00' }] }]
      },
      phanomPhaijit: {
        compatibilityPairKey: pairKey(TH.phanom, TH.phaijit),
        originLabel: TH.phanom,
        destinationLabel: TH.phaijit,
        segments: [{ times: [{ time: '12:00' }] }]
      },
      [encodedPairKm1Km7]: {
        originLabel: TH.km1,
        destinationLabel: TH.km7,
        segments: [{ times: [{ time: '13:00' }] }]
      }
    },
    compatibilityKeyIndex: {
      [encodedPair1]: { compatibilityPairKey: pairKey(TH.chachoengsao, TH.km1) },
      [encodedPair7]: { compatibilityPairKey: pairKey(TH.chachoengsao, TH.km7) },
      [encodedPair10]: { compatibilityPairKey: pairKey(TH.chachoengsao, TH.km10) },
      [encodedPairKm1Km7]: { compatibilityPairKey: pairKey(TH.km1, TH.km7) }
    },
    excludedPreviewPairs: {
      transferUnknown: {
        hiddenPair: { compatibilityPairKey: pairKey(TH.chachoengsao, TH.rangsit) }
      }
    },
    firebaseKeyEncoding: {
      encodedKeyIndex: {
        destinations: {
          [encodedDest1]: TH.km1,
          [encodedDest7]: TH.km7,
          [encodedDest10]: TH.km10
        },
        pairs: {
          [encodedPair1]: pairKey(TH.chachoengsao, TH.km1),
          [encodedPair7]: pairKey(TH.chachoengsao, TH.km7),
          [encodedPair10]: pairKey(TH.chachoengsao, TH.km10),
          [encodedPairKm1Km7]: pairKey(TH.km1, TH.km7)
        },
        compatibilityKeyIndex: {
          [encodedPair1]: pairKey(TH.chachoengsao, TH.km1),
          [encodedPair7]: pairKey(TH.chachoengsao, TH.km7),
          [encodedPair10]: pairKey(TH.chachoengsao, TH.km10),
          [encodedPairKm1Km7]: pairKey(TH.km1, TH.km7)
        }
      }
    }
  };
}

function sampleScheduleWithDestinationOptions() {
  const schedule = sampleSchedule();
  schedule.destinationOptionsByOrigin = {
    [TH.chachoengsao]: [
      {
        label: TH.pattaya,
        destinationLabel: TH.pattaya,
        pairKey: encodedPair1,
        group: TH.transferGroup,
        displayOrder: 0
      },
      {
        label: TH.chachoengsao,
        destinationLabel: TH.chachoengsao,
        pairKey: encodedPair7,
        displayOrder: 1
      },
      {
        label: TH.km7,
        destinationLabel: TH.km7,
        pairKey: encodedPair7,
        displayOrder: 2
      }
    ],
    [TH.phanom]: [
      {
        label: TH.phaijit,
        destinationLabel: TH.phaijit,
        pairKey: 'phanomPhaijit',
        displayOrder: 0
      }
    ]
  };
  return schedule;
}

function sampleOptionOnlySchedule() {
  const schedule = sampleScheduleWithDestinationOptions();
  delete schedule.pairs;
  delete schedule.destinations;
  schedule.originOptions = corridor.map((label, displayOrder) => ({ label, displayOrder }));
  const stopToStopPolyline = corridor.map((_, displayOrder) => ({ lat: 13.4 + displayOrder / 100, lng: 101.0 + displayOrder / 100 }));
  const roadPolyline = stopToStopPolyline.flatMap((point, index) => {
    if (index === stopToStopPolyline.length - 1) return [point];
    const next = stopToStopPolyline[index + 1];
    return [
      point,
      { lat: Number(((point.lat + next.lat) / 2 + 0.001).toFixed(6)), lng: Number(((point.lng + next.lng) / 2 + 0.001).toFixed(6)) }
    ];
  });
  schedule.mapView = {
    schemaVersion: 'publishedSchedule.mapView.v1.preview',
    referenceOnly: true,
    operationalProof: false,
    liveVehicleMarkers: false,
    stops: corridor.map((label, displayOrder) => ({
      stopKey: 'stop_' + displayOrder,
      nodeId: 'node_' + displayOrder,
      groupStopId: 'gs_' + displayOrder,
      groupStopCode: 'g01p' + String(displayOrder + 1).padStart(3, '0'),
      label: displayOrder === 0 ? TH.chachoengsaoShort : label,
      displayOrder,
      lat: 13.4 + displayOrder / 100,
      lng: 101.0 + displayOrder / 100,
      icon: displayOrder === 0 ? '🚍' : '🚏',
      visible: true,
      previewDisplayMode: 'static_map_reference',
      referenceOnly: true,
      sourceLineage: [{ sourcePath: 'publishedSchedule/mapView/stops/' + displayOrder }]
    })),
    routes: [
      {
        routeViewId: 'map_route_group_001_corridor_fallback',
        serviceGroupId: 'group_001',
        direction: 'corridor_display_order',
        geometryType: 'stop_to_stop_fallback',
        stopKeys: corridor.map((_, displayOrder) => 'stop_' + displayOrder),
        polyline: stopToStopPolyline,
        referenceOnly: true,
        operationalProof: false,
        previewDisplayMode: 'static_map_reference'
      },
      {
        routeViewId: 'map_route_group_001_corridor_preview',
        serviceGroupId: 'group_001',
        direction: 'corridor_display_order',
        geometryType: 'road_polyline',
        stopKeys: corridor.map((_, displayOrder) => 'stop_' + displayOrder),
        polyline: roadPolyline,
        referenceOnly: true,
        operationalProof: false,
        previewDisplayMode: 'static_map_reference'
      }
    ]
  };
  schedule.destinationOptionsByOrigin = {
    [TH.chachoengsao]: [
      {
        label: TH.pattaya,
        destinationLabel: TH.pattaya,
        pairKey: pairKey(TH.chachoengsao, TH.km1),
        group: TH.transferGroup,
        displayOrder: 0
      },
      {
        label: TH.chachoengsao,
        destinationLabel: TH.chachoengsao,
        pairKey: encodedPair7,
        displayOrder: 1
      },
      {
        label: TH.km7,
        destinationLabel: TH.km7,
        pairKey: encodedPair7,
        displayOrder: 2
      }
    ],
    [encodedDest1]: [
      {
        label: TH.km7,
        destinationLabel: TH.km7,
        pairKey: pairKey(TH.km1, TH.km7),
        displayOrder: 0
      }
    ]
  };
  schedule.firebaseKeyEncoding.encodedKeyIndex.destinationOptionsByOrigin = {
    [encodedDest1]: TH.km1
  };
  return schedule;
}

const sandbox = loadPassengerLogic();
const schedule = sandbox.SLPassengerLogic.schedule;
let scheduleUpdatedCount = 0;
sandbox.SLPassengerLogic.on('scheduleUpdated', function() {
  scheduleUpdatedCount += 1;
});

schedule.applyPublishedSchedule(sampleSchedule());

const destinations = schedule.getDestinations();
const labels = Array.from(Object.keys(destinations));
const orderedLabels = Array.from(schedule.getDestinationLabels());
const phanomLabels = Array.from(schedule.getDestinationLabels(TH.phanom));
const km1Labels = Array.from(schedule.getDestinationLabels(TH.km1));

assert.deepStrictEqual(Array.from(schedule.getOrigins()), corridor, 'originOptions must be the visible origin source');
assert.deepStrictEqual(labels, [], 'destinations must not be built from legacy destinations without destinationOptionsByOrigin');
assert.deepStrictEqual(orderedLabels, [], 'destination labels must not be derived from pairs when option contract is absent');
assert.deepStrictEqual(phanomLabels, [], 'phanom destinations must not be derived from pairs');
assert.deepStrictEqual(km1Labels, [], 'km1 destinations must not be derived from pairs');
assert(schedule.hasDestinationOptionsByOrigin() === false, 'missing destinationOptionsByOrigin must be reported explicitly');
assert.strictEqual(schedule.getDestinationContractStatus(TH.phanom), 'missing_destination_options', 'missing destinationOptionsByOrigin must be a contract-unavailable state');
assert(!labels.some((label) => label.startsWith('k_')), 'visible destination labels must not expose encoded Firebase keys');
assert.strictEqual(schedule.getPair(TH.chachoengsao, TH.km1), null, 'pair lookup must fail closed when destinationOptionsByOrigin does not supply pairKey');
assert.strictEqual(schedule.getPair(TH.phanom, TH.phaijit), null, 'Passenger must not construct a pair key from labels');
assert(!km1Labels.includes(TH.phaijit), 'invalid old destination must not remain after origin changes');
assert(!schedule.getPair(TH.chachoengsao, TH.rangsit), 'excludedPreviewPairs must remain hidden');
assert(scheduleUpdatedCount === 1, 'scheduleUpdated must fire as soon as preview schedule is applied');

schedule.applyPublishedSchedule(sampleScheduleWithDestinationOptions());
assert(schedule.hasDestinationOptionsByOrigin() === true, 'schedule must report ERP-provided destinationOptionsByOrigin');
const optionLabels = Array.from(schedule.getDestinationLabels(TH.chachoengsao));
assert.deepStrictEqual(optionLabels, [TH.pattaya, TH.chachoengsao, TH.km7], 'destinationOptionsByOrigin order/content must be rendered exactly as ERP provides it');
assert(JSON.stringify(schedule.getDestinationOptions(TH.chachoengsao).map((option) => option.group || null)) === JSON.stringify([TH.transferGroup, null, null]), 'destination option groups must come from ERP options');
assert(schedule.getPair(TH.chachoengsao, TH.pattaya), 'pair lookup must use pairKey supplied by destination option');
assert.strictEqual(schedule.getPair(TH.chachoengsao, TH.pattaya).segments[0].times[0].displayBadgeTh, TH.estimatedBadge, 'estimated badge must pass through via the ERP pairKey');
assert(schedule.getPair(TH.chachoengsao, TH.chachoengsao), 'Passenger must not filter selected-origin option when ERP provides it');
assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.phanom)), [TH.phaijit], 'origin-specific destination options must not be derived from visible pairs');
assert(scheduleUpdatedCount === 2, 'scheduleUpdated must fire after option-backed preview schedule is applied');

(async function runLazyScheduleTests() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'passenger.html'), 'utf8');
  const logicSource = fs.readFileSync(path.join(__dirname, '..', 'passenger-logic.js'), 'utf8');
  assert(!html.includes("db.ref('routeData')"), 'Passenger must not read legacy routeData');
  assert(!html.includes("db.ref('publishedCatalog')"), 'Passenger must not read legacy publishedCatalog');
  assert(!html.includes("db.ref('bus')"), 'Passenger must not read legacy bus vehicle feed');
  assert(!html.includes("db.ref('liveVehicles')"), 'Passenger must not read legacy liveVehicles feed');
  assert(!logicSource.includes("operations/liveVehicles"), 'Passenger logic must not read operations/liveVehicles directly');
  assert(!logicSource.includes("db.ref('routeData')"), 'Passenger logic must not fallback-read legacy routeData');
  assert(!logicSource.includes('legacyRouteData'), 'Passenger logic must not derive route/map data from legacy catalog adapters');
  assert(html.includes("db.ref('publishedSchedule')"), 'Passenger must read active publishedSchedule');
  assert(!/db\.ref\(['"]publishedSchedule['"]\)\.on\s*\(/.test(html), 'Passenger must not subscribe to full publishedSchedule on initial load');
  assert(!/db\.ref\(['"]publishedSchedule['"]\)\.once\s*\(/.test(html), 'Passenger must not once-read full publishedSchedule on initial load');
  assert(html.includes(".child('originOptions')"), 'Passenger must read originOptions as lightweight initial data');
  assert(html.includes(".child('destinationOptionsByOrigin')"), 'Passenger must read destinationOptionsByOrigin as lightweight initial data');
  assert(html.includes(".child('mapView')"), 'Passenger must read mapView as lightweight initial data');
  assert(html.includes(".child('pairs').child(storageKey)"), 'Passenger must lazy-load only the selected pair key');
  assert(!html.includes(".child('excludedPreviewPairs')"), 'Passenger visible UI must not read excludedPreviewPairs');
  assert(html.includes('opt.value = o; opt.textContent = o;'), 'origin dropdown value must be the exact ERP originOptions label');
  const selectStopStart = html.indexOf('window.selectPassengerStop');
  const selectStopEnd = html.indexOf('window.selectPassengerBus', selectStopStart);
  const selectStopBlock = html.slice(selectStopStart, selectStopEnd);
  assert(selectStopStart !== -1 && selectStopEnd !== -1, 'Passenger map stop handler must exist');
  assert(!selectStopBlock.includes('setOrigin'), 'map stop focus must not overwrite selected origin contract label');
  assert(!logicSource.includes('router.project-osrm.org'), 'Passenger must not fetch route geometry from OSRM');
  assert(!html.includes('setInterval(function(){'), 'Passenger must not keep a page-local map/vehicle retry loop');
  assert(!html.includes('SLPassengerLogic.map.updateVehicles(allBusPositions)'), 'Passenger page must not push locally cached vehicle positions back onto the map');
  assert(html.includes('ไม่พบข้อมูลปลายทาง'), 'Passenger must show an explicit destination contract-unavailable state');
  assert(!logicSource.includes('normalizePreviewDestinationsByOrigin'), 'Passenger must not derive destinations from pairs');
  assert(!logicSource.includes('normalizePreviewDestinationLabels'), 'Passenger must not locally sort destination labels');
  assert(!html.includes('ADMIN_TESTER_PHONE') && !html.includes('0929383999'), 'Passenger must not contain a hardcoded tester phone');
  assert(!logicSource.includes("originLabel + '__'") && !logicSource.includes("originLabel + '__' + destLabel"), 'Passenger must not construct pair keys from route labels');
  assert(!html.includes('Object.keys(destinations)'), 'Passenger must not build destination options from local destination maps');
  assert(!html.includes('กำลังวิ่ง') && !html.includes('วิ่งอยู่'), 'Passenger must not infer running status from local time');
  assert(!html.includes('nowMin()') && !html.includes('toMin(entry.time)'), 'Passenger schedule display must not compare current time to timetable entries');
  assert(!html.includes('SLPassengerLogic.map.focusRoute()'), 'Passenger page must not request destination-inclusive route focus');
  assert(!logicSource.includes('focusRoute:'), 'Passenger logic must not expose destination-inclusive route focus');
  assert(!logicSource.includes('updateCurrentLocation'), 'Passenger must not use Longdo native geolocation marker');
  assert(!logicSource.includes('LocationMode.Geolocation'), 'Passenger must not use Longdo native geolocation mode');
  assert(!logicSource.includes('requestUserLocation'), 'Passenger location button must use one browser location request and one Passenger marker');
  assert(logicSource.includes('userLocationMarker.move(normalized)'), 'Passenger user location marker must move the existing marker');
  assert(logicSource.includes('focusUserLocation: focusUserLocation'), 'Passenger map API must expose a single user-location focus command');
  assert(html.includes('SLPassengerLogic.map.focusUserLocation(point)'), 'Passenger page must focus the browser-provided user point');
  assert(html.includes('navigator.geolocation.getCurrentPosition'), 'Passenger location button must request a browser one-shot user location');
  assert(html.includes('requestPassengerUserLocation({ showErrors: false, setBusy: false, timeout: 8000 })'), 'Passenger initial load must request one silent user-location focus before origin fallback');
  assert(html.includes('if (!initialUserLocation) SLPassengerLogic.map.focusOrigin()'), 'Passenger initial load must fallback to origin only when user location is unavailable');
  assert(!html.includes('setLocationConsentVisible(true, USER_LOCATION_LOADING_TEXT)'), 'Passenger must not show its custom consent modal while browser geolocation is pending');
  assert(!html.includes('watchPosition'), 'Passenger must not continuously track user location');
  assert(!logicSource.includes('.sort('), 'Passenger logic must not sort stops or destination options locally');
  [
    'getVehicleTs',
    'getLatestVehicleTs',
    'distanceMeters',
    'navigator.geolocation',
    'watchPosition',
    'getCurrentPosition',
    'startUserLocation',
    'requestCurrentLocation',
    'USER_ANIM',
    'projectPoint',
    'snapPoint',
    'accuracy',
    'heading'
  ].forEach((forbidden) => {
    assert(!logicSource.includes(forbidden), 'Passenger logic must not contain GPS/vehicle motion helper: ' + forbidden);
  });
  assert(!/fake\s*(gps|eta|vehicle|assignment)/i.test(html + '\n' + logicSource), 'Passenger must not create fake GPS/ETA/vehicle/assignment data');

  const mapFirstSandbox = loadPassengerLogic();
  const mapFirstState = installMapStub(mapFirstSandbox);
  await mapFirstSandbox.SLPassengerLogic.map.init();
  await waitForAsyncMapWork();
  assert.strictEqual(mapFirstState.markers.length, 0, 'map init before mapView must not render empty/stale markers');
  assert(mapFirstState.locations.length >= 1, 'map init must apply the Map Display Center default viewport');
  mapFirstSandbox.SLPassengerLogic.schedule.applyPublishedScheduleOptions(sampleOptionOnlySchedule());
  await waitForAsyncMapWork();
  assert.strictEqual(mapFirstState.markers.length, 30, 'mapView arriving after map init must render 15 marker+label overlays');
  assert.strictEqual(mapFirstState.polylines.length, 1, 'mapView arriving after map init must render the ERP Map road polyline');
  assert(mapFirstState.polylines[0].points.length > corridor.length, 'ERP Map route must be road geometry, not stop-to-stop fallback');
  assert(mapFirstState.locations.length >= 2, 'late mapView data must apply the Map Display Center overview viewport');
  const beforeUserMarkers = mapFirstState.markers.length;
  const firstUserPoint = { lat: 13.6123, lng: 101.3123 };
  const secondUserPoint = { lat: 13.6234, lng: 101.3234 };
  mapFirstSandbox.SLPassengerLogic.map.focusUserLocation(firstUserPoint);
  mapFirstSandbox.SLPassengerLogic.map.focusUserLocation(secondUserPoint);
  const userMarkers = mapFirstState.markers
    .slice(beforeUserMarkers)
    .filter((marker) => marker.options && marker.options.icon && marker.options.icon.html.indexOf('map-user-location-marker') !== -1);
  assert.strictEqual(userMarkers.length, 1, 'two user-location requests should keep one user marker overlay');
  assert.strictEqual(mapFirstState.markerMoves.length, 1, 'second user-location request must move the existing marker');
  assert.strictEqual(userMarkers[0].point.lat, secondUserPoint.lat, 'user marker must move to latest browser latitude');
  assert.strictEqual(userMarkers[0].point.lon, secondUserPoint.lng, 'user marker must move to latest browser longitude');
  assert.strictEqual(mapFirstState.locations[mapFirstState.locations.length - 1].point.lat, secondUserPoint.lat, 'user-location focus must move map to latest browser latitude');
  assert.strictEqual(mapFirstState.locations[mapFirstState.locations.length - 1].point.lon, secondUserPoint.lng, 'user-location focus must move map to latest browser longitude');

  const dataFirstSandbox = loadPassengerLogic();
  const dataFirstState = installMapStub(dataFirstSandbox);
  dataFirstSandbox.SLPassengerLogic.schedule.applyPublishedScheduleOptions(sampleOptionOnlySchedule());
  await waitForAsyncMapWork();
  assert.strictEqual(dataFirstState.markers.length, 0, 'mapView before map init must wait for map readiness');
  await dataFirstSandbox.SLPassengerLogic.map.init();
  await waitForAsyncMapWork();
  assert.strictEqual(dataFirstState.markers.length, 30, 'map init after mapView must render 15 marker+label overlays');
  assert.strictEqual(dataFirstState.polylines.length, 1, 'map init after mapView must render the ERP Map road polyline');
  assert(dataFirstState.polylines[0].points.length > corridor.length, 'Passenger must not downgrade ERP road geometry to stop-to-stop fallback');
  assert(dataFirstState.locations.length >= 1, 'map init after mapView must apply the Map Display Center overview viewport');

  const sourcePairs = sampleSchedule().pairs;
  const loadCalls = [];
  schedule.applyPublishedScheduleOptions(sampleOptionOnlySchedule());
  schedule.setPairLoader((storageKey) => {
    loadCalls.push(storageKey);
    return Promise.resolve(sourcePairs[storageKey] || null);
  });

  assert(schedule.hasDestinationOptionsByOrigin() === true, 'option-only schedule must report ERP destination options');
  assert.deepStrictEqual(Array.from(schedule.getOrigins()), corridor, 'originOptions must be enough to build origins');
  assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.chachoengsao)), [TH.pattaya, TH.chachoengsao, TH.km7], 'option-only destinations must keep ERP order/content exactly');
  assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.chachoengsaoShort)), [], 'short map stop label must not be used as a destinationOptionsByOrigin key');
  assert.strictEqual(schedule.getDestinationContractStatus(TH.chachoengsaoShort), 'missing_origin_options', 'short map stop label must show contract-unavailable instead of alias guessing');
  assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.km1)), [TH.km7], 'encoded destinationOptionsByOrigin keys must resolve to display origin labels');
  assert.strictEqual(schedule.getDestinationContractStatus(TH.rangsit), 'missing_origin_options', 'missing selected origin must be a contract-unavailable state');
  assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.rangsit)), [], 'missing selected origin must not derive substitute destinations from pairs');
  assert(!schedule.getDestinationLabels(TH.chachoengsao).includes(TH.rangsit), 'excludedPreviewPairs must not become destination options');
  const previewRouteData = await sandbox.SLPassengerLogic.map.loadRouteData();
  assert(Array.isArray(previewRouteData.stations) && previewRouteData.stations.length === 15, 'Passenger must accept map stops from publishedSchedule mapView');
  assert(previewRouteData.stations[0].name === TH.chachoengsaoShort, 'Passenger map stop labels must come from mapView without replacing originOptions labels');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(previewRouteData.stations.map((station) => station.key))),
    corridor.map((_, index) => 'stop_' + index),
    'Passenger map stops must preserve backend-provided order exactly'
  );
  assert(previewRouteData.stations.every((station) => station.name && Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lng))), 'Passenger map adapter must consume all visible map stops');
  assert(previewRouteData.geometryType === 'road_polyline', 'Passenger map must use ERP Map road geometry');
  assert(Array.isArray(previewRouteData.polyline) && previewRouteData.polyline.length > corridor.length, 'Passenger must consume mapView.routes road polyline from ERP Map');
  assert.strictEqual(schedule.getPair(TH.chachoengsao, TH.pattaya), null, 'option-only initial state must not have full pairs loaded');

  const loadedPair = await schedule.loadPair(TH.chachoengsao, TH.pattaya);
  assert(loadedPair, 'loadPair must fetch the selected pair');
  assert.strictEqual(loadCalls[0], encodedPair1, 'loadPair must resolve raw option pairKey to encoded Firebase-safe key');
  assert.strictEqual(schedule.getPair(TH.chachoengsao, TH.pattaya), loadedPair, 'getPair must return cached lazy-loaded pair');
  assert.strictEqual(loadedPair.segments[0].times[0].displayBadgeTh, TH.estimatedBadge, 'estimated badge must pass through after lazy load');

  await schedule.loadPair(TH.chachoengsao, TH.pattaya);
  assert.strictEqual(loadCalls.length, 1, 'pair cache must prevent duplicate fetch for same pair');

  const encodedOriginPair = await schedule.loadPair(TH.km1, TH.km7);
  assert(encodedOriginPair, 'encoded origin destination option must lazy-load');
  assert.strictEqual(loadCalls[1], encodedPairKm1Km7, 'encoded pair keys must still resolve for lazy load');

  const missingPair = await schedule.loadPair(TH.chachoengsao, TH.rangsit);
  assert.strictEqual(missingPair, null, 'missing pair must resolve to null');
  assert.strictEqual(schedule.getPairLoadStatus(TH.chachoengsao, TH.rangsit), 'missing', 'missing lazy pair must be marked missing');
})().then(() => {
  console.log('passenger preview normalization ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
