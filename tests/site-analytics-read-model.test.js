const assert = require('assert');
const model = require('../site-analytics-read-model.js');

// hourly range is honestly reported unavailable — source data has no per-hour breakdown
const hourly = model.snapshot({ range: 'hourly' });
assert.strictEqual(hourly.status, 'unavailable');
assert.deepStrictEqual(hourly.points, []);

// loading state before any cache is populated
const loading = model.snapshot({ range: 'daily' });
assert.strictEqual(loading.status, 'loading');

// populate a fake cache (as if Firebase had returned data) and verify aggregation
model._setCacheForTest({
  '2026-07-20': { pageViews: 10, count: 4 },
  '2026-07-21': { pageViews: 8, count: 3 },
  '2026-07-27': { pageViews: 5, count: 2 }
}, 'ready');

const daily = model.snapshot({ range: 'daily' });
assert.strictEqual(daily.status, 'ready');
const day1 = daily.points.find(p => p.key === '2026-07-20');
assert.deepStrictEqual(day1, { key: '2026-07-20', visits: 10, estimatedVisitors: 4 });

// weekly bucket must sum days that fall into the same computed week key
const weekly = model.snapshot({ range: 'weekly' });
const d1 = new Date('2026-07-20T00:00:00+07:00');
const d2 = new Date('2026-07-21T00:00:00+07:00');
const sameWeek = model.weekKeyFromDate(d1) === model.weekKeyFromDate(d2);
if (sameWeek) {
  const bucket = weekly.points.find(p => p.key === model.weekKeyFromDate(d1));
  assert.strictEqual(bucket.visits, 18);
  assert.strictEqual(bucket.estimatedVisitors, 7);
}

// monthly aggregation sums every day in the same year-month key
const monthly = model.snapshot({ range: 'monthly' });
const julyBucket = monthly.points.find(p => p.key === '2026-07');
assert.strictEqual(julyBucket.visits, 23); // 10 + 8 + 5
assert.strictEqual(julyBucket.estimatedVisitors, 9); // 4 + 3 + 2

console.log('site-analytics-read-model.test.js OK');
