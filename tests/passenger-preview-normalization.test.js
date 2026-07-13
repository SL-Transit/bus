const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const schedule = sandbox.SLPassengerLogic.schedule;
const encodedDest1 = 'k_4LiB4LihLjE';
const encodedDest7 = 'k_4LiB4LihLjc';
const encodedDest10 = 'k_4LiB4LihLjEw';
const encodedPair1 = 'k_pair_chachoengsao_km1';
const encodedPair7 = 'k_pair_chachoengsao_km7';
const encodedPair10 = 'k_pair_chachoengsao_km10';

schedule.applyPublishedSchedule({
  origins: ['ฉะเชิงเทรา (แปดริ้ว)'],
  destinations: {
    [encodedDest1]: { group: null },
    [encodedDest7]: { group: null },
    [encodedDest10]: { group: null },
    normalDest: { label: 'คลองหาด', group: 'ต่อรถ' }
  },
  pairs: {
    [encodedPair1]: {
      compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__กม.1',
      originLabel: 'ฉะเชิงเทรา (แปดริ้ว)',
      destinationLabel: 'กม.1',
      segments: [{ times: [{ time: '09:00', isEstimated: true, displayBadgeTh: 'เวลาโดยประมาณ', disclaimerTh: 'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง' }] }]
    },
    [encodedPair7]: {
      compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__กม.7',
      originLabel: 'ฉะเชิงเทรา (แปดริ้ว)',
      destinationLabel: 'กม.7',
      segments: [{ times: [{ time: '10:00' }] }]
    },
    [encodedPair10]: {
      compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__กม.10',
      originLabel: 'ฉะเชิงเทรา (แปดริ้ว)',
      destinationLabel: 'กม.10',
      displayBadgeTh: 'ข้อมูลต่อรถอ้างอิง',
      transferDisclaimerTh: 'ข้อมูลต่อรถเป็นข้อมูลอ้างอิง',
      segments: [{ times: [{ time: '11:00' }] }]
    }
  },
  compatibilityKeyIndex: {
    [encodedPair1]: { compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__กม.1' },
    [encodedPair7]: { compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__กม.7' },
    [encodedPair10]: { compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__กม.10' }
  },
  excludedPreviewPairs: {
    transferUnknown: {
      hiddenPair: { compatibilityPairKey: 'ฉะเชิงเทรา (แปดริ้ว)__รังสิต' }
    }
  },
  firebaseKeyEncoding: {
    encodedKeyIndex: {
      destinations: {
        [encodedDest1]: 'กม.1',
        [encodedDest7]: 'กม.7',
        [encodedDest10]: 'กม.10'
      },
      pairs: {
        [encodedPair1]: 'ฉะเชิงเทรา (แปดริ้ว)__กม.1',
        [encodedPair7]: 'ฉะเชิงเทรา (แปดริ้ว)__กม.7',
        [encodedPair10]: 'ฉะเชิงเทรา (แปดริ้ว)__กม.10'
      },
      compatibilityKeyIndex: {
        [encodedPair1]: 'ฉะเชิงเทรา (แปดริ้ว)__กม.1',
        [encodedPair7]: 'ฉะเชิงเทรา (แปดริ้ว)__กม.7',
        [encodedPair10]: 'ฉะเชิงเทรา (แปดริ้ว)__กม.10'
      }
    }
  }
});

const destinations = schedule.getDestinations();
const labels = Object.keys(destinations);

assert(labels.includes('กม.1'), 'กม.1 destination label must be restored');
assert(labels.includes('กม.7'), 'กม.7 destination label must be restored');
assert(labels.includes('กม.10'), 'กม.10 destination label must be restored');
assert(!labels.some((label) => label.startsWith('k_')), 'visible destination labels must not expose encoded Firebase keys');

assert(schedule.getPair('ฉะเชิงเทรา (แปดริ้ว)', 'กม.1'), 'กม.1 pair lookup must resolve through encoded key');
assert(schedule.getPair('ฉะเชิงเทรา (แปดริ้ว)', 'กม.7'), 'กม.7 pair lookup must resolve through encoded key');
assert(schedule.getPair('ฉะเชิงเทรา (แปดริ้ว)', 'กม.10'), 'กม.10 pair lookup must resolve through encoded key');
assert(!schedule.getPair('ฉะเชิงเทรา (แปดริ้ว)', 'รังสิต'), 'excludedPreviewPairs must remain hidden');
assert(schedule.getPair('ฉะเชิงเทรา (แปดริ้ว)', 'กม.1').segments[0].times[0].displayBadgeTh === 'เวลาโดยประมาณ', 'estimated badge must pass through');
assert(schedule.getPair('ฉะเชิงเทรา (แปดริ้ว)', 'กม.10').transferDisclaimerTh === 'ข้อมูลต่อรถเป็นข้อมูลอ้างอิง', 'transfer disclaimer must pass through');

console.log('passenger preview normalization ok');
