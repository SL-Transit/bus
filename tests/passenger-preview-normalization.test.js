const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TH = {
  chachoengsao: '\u0e09\u0e30\u0e40\u0e0a\u0e34\u0e07\u0e40\u0e17\u0e23\u0e32 (\u0e41\u0e1b\u0e14\u0e23\u0e34\u0e49\u0e27)',
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
  vm.runInNewContext(source, sandbox, { filename: 'passenger-logic.js' });
  return sandbox;
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
const mainLabels = orderedLabels.filter((label) => !(destinations[label] && destinations[label].group));
const expectedMainLabels = corridor.filter((label) => labels.includes(label));

assert.deepStrictEqual(mainLabels, expectedMainLabels, 'main destination labels must follow corridor order');
assert(phanomLabels.length > 0, 'phanom must expose visible destinations from pairs');
assert(km1Labels.length > 0, 'km1 must expose visible destinations from pairs');
assert(!phanomLabels.includes(TH.phanom), 'selected phanom origin must be excluded from destinations');
assert(!km1Labels.includes(TH.km1), 'selected km1 origin must be excluded from destinations');
assert(labels.includes(TH.km1), 'km1 destination label must be restored');
assert(labels.includes(TH.km7), 'km7 destination label must be restored');
assert(labels.includes(TH.km10), 'km10 destination label must be restored');
assert(!labels.some((label) => label.startsWith('k_')), 'visible destination labels must not expose encoded Firebase keys');
assert(orderedLabels.indexOf(TH.km1) < orderedLabels.indexOf(TH.km7), 'destination sorting must not follow encoded Firebase key order');
assert(schedule.getPair(TH.chachoengsao, TH.km1), 'km1 pair lookup must resolve through encoded key');
assert(schedule.getPair(TH.chachoengsao, TH.km7), 'km7 pair lookup must resolve through encoded key');
assert(schedule.getPair(TH.chachoengsao, TH.km10), 'km10 pair lookup must resolve through encoded key');
assert(schedule.getPair(TH.phanom, TH.phaijit), 'phanom to phaijit pair lookup must work');
assert(schedule.getPair(TH.km1, TH.km7), 'km1 to km7 pair lookup must work');
assert(!km1Labels.includes(TH.phaijit), 'invalid old destination must not remain after origin changes');
assert(!schedule.getPair(TH.chachoengsao, TH.rangsit), 'excludedPreviewPairs must remain hidden');
assert(schedule.getPair(TH.chachoengsao, TH.km1).segments[0].times[0].displayBadgeTh === TH.estimatedBadge, 'estimated badge must pass through');
assert(schedule.getPair(TH.chachoengsao, TH.km10).transferDisclaimerTh === TH.transferDisclaimer, 'transfer disclaimer must pass through');
assert(scheduleUpdatedCount === 1, 'scheduleUpdated must fire as soon as preview schedule is applied');

schedule.applyPublishedSchedule(sampleScheduleWithDestinationOptions());
assert(schedule.hasDestinationOptionsByOrigin() === true, 'schedule must report ERP-provided destinationOptionsByOrigin');
const optionLabels = Array.from(schedule.getDestinationLabels(TH.chachoengsao));
assert.deepStrictEqual(optionLabels, [TH.pattaya, TH.chachoengsao, TH.km7], 'destinationOptionsByOrigin order/content must be rendered exactly as ERP provides it');
assert(JSON.stringify(schedule.getDestinationOptions(TH.chachoengsao).map((option) => option.group || null)) === JSON.stringify([TH.transferGroup, null, null]), 'destination option groups must come from ERP options');
assert(schedule.getPair(TH.chachoengsao, TH.pattaya) === schedule.getPair(TH.chachoengsao, TH.km1), 'pair lookup must use pairKey supplied by destination option');
assert(schedule.getPair(TH.chachoengsao, TH.chachoengsao) === schedule.getPair(TH.chachoengsao, TH.km7), 'Passenger must not filter selected-origin option when ERP provides it');
assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.phanom)), [TH.phaijit], 'origin-specific destination options must not be derived from visible pairs');
assert(scheduleUpdatedCount === 2, 'scheduleUpdated must fire after option-backed preview schedule is applied');

(async function runLazyScheduleTests() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'passenger.html'), 'utf8');
  assert(!/db\.ref\(['"]preview\/publishedSchedule['"]\)\.on\s*\(/.test(html), 'Passenger must not subscribe to full preview/publishedSchedule on initial load');
  assert(!/db\.ref\(['"]preview\/publishedSchedule['"]\)\.once\s*\(/.test(html), 'Passenger must not once-read full preview/publishedSchedule on initial load');
  assert(html.includes(".child('originOptions')"), 'Passenger must read originOptions as lightweight initial data');
  assert(html.includes(".child('destinationOptionsByOrigin')"), 'Passenger must read destinationOptionsByOrigin as lightweight initial data');
  assert(html.includes(".child('pairs').child(storageKey)"), 'Passenger must lazy-load only the selected pair key');
  assert(!html.includes(".child('excludedPreviewPairs')"), 'Passenger visible UI must not read excludedPreviewPairs');

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
  assert.deepStrictEqual(Array.from(schedule.getDestinationLabels(TH.km1)), [TH.km7], 'encoded destinationOptionsByOrigin keys must resolve to display origin labels');
  assert(!schedule.getDestinationLabels(TH.chachoengsao).includes(TH.rangsit), 'excludedPreviewPairs must not become destination options');
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
