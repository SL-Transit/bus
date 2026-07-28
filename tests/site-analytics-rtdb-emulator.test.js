const assert = require('assert');
const admin = require('../functions/node_modules/firebase-admin');
const core = require('../functions/site-analytics-core.js');

const PROJECT_ID = 'sl-transit-9464e';
const DATABASE_NS = 'sl-transit-9464e-default-rtdb';

function app() {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw new Error('FIREBASE_DATABASE_EMULATOR_HOST is required');
  }
  return admin.apps[0] || admin.initializeApp({
    projectId: PROJECT_ID,
    databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${DATABASE_NS}`
  });
}

function adapter(db, failPathOnceRef) {
  const paths = [];
  return {
    paths,
    transaction(path, updateFn) {
      paths.push(path);
      if (failPathOnceRef && failPathOnceRef.path === path) {
        failPathOnceRef.path = '';
        return Promise.reject(new Error('simulated bucket failure'));
      }
      return db.ref(path).transaction(updateFn);
    }
  };
}

function event(visitorHash, nowMs, eventType = 'page_view') {
  return {
    visitorHash,
    pageCategory: 'home',
    eventType,
    activitySource: eventType === 'activity' ? 'click' : '',
    nowMs,
    newVisitId: `visit-${visitorHash}-${nowMs}`
  };
}

async function bucket(db, granularity, key) {
  return (await db.ref(`analytics/webV1/bucketState/${granularity}/${key}`).get()).val() || {};
}

async function denied(method, path, body) {
  const url = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/${path}.json?ns=${DATABASE_NS}`;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });
  return !res.ok;
}

(async () => {
  const db = app().database();
  await db.ref().set(null);
  const base = Date.UTC(2026, 6, 27, 1, 50, 0);
  const keys = core.bucketKeys(new Date(base));

  {
    const a = adapter(db);
    await Promise.all(Array.from({ length: 20 }, () => core.commitEvent(a, event('same', base))));
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits, 1, '20 concurrent same visitor requests add one visit');
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visitorsApprox, 1, '20 concurrent same visitor requests add one visitor');
    assert(!a.paths.includes('analytics/webV1'), 'root analytics transaction must not be used');
  }

  await db.ref().set(null);
  {
    const a = adapter(db);
    await Promise.all(Array.from({ length: 20 }, (_, index) => core.commitEvent(a, event(`visitor-${index}`, base + index * 1000))));
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits, 20, '20 different visitors are counted independently');
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visitorsApprox, 20, '20 different visitor markers are counted independently');
  }

  await db.ref().set(null);
  {
    const a = adapter(db);
    await core.commitEvent(a, event('retry', base));
    await core.commitEvent(a, event('retry', base));
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits, 1, 'duplicate retry does not duplicate visits');
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visitorsApprox, 1, 'duplicate retry does not duplicate visitors');
  }

  await db.ref().set(null);
  {
    const a = adapter(db);
    const first = Date.UTC(2026, 6, 27, 1, 55, 0);
    const second = Date.UTC(2026, 6, 27, 2, 10, 0);
    const firstHour = core.bucketKeys(new Date(first)).hourly;
    const secondHour = core.bucketKeys(new Date(second)).hourly;
    await core.commitEvent(a, event('cross-hour', first));
    await core.commitEvent(a, event('cross-hour', second));
    assert.strictEqual((await bucket(db, 'hourly', firstHour)).visits, 1, 'same session visit remains in start hour');
    assert.strictEqual((await bucket(db, 'hourly', secondHour)).visits || 0, 0, 'same session does not open visit in next hour');
    assert.strictEqual((await bucket(db, 'hourly', secondHour)).pageViews, 1, 'page view still lands in current hour');
  }

  await db.ref().set(null);
  {
    const a = adapter(db);
    await core.commitEvent(a, event('active', base));
    await core.commitEvent(a, event('active', base + 10 * 60 * 1000, 'activity'));
    await core.commitEvent(a, event('active', base + 20 * 60 * 1000, 'activity'));
    await core.commitEvent(a, event('active', base + 35 * 60 * 1000, 'activity'));
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits, 1, 'continuous activity keeps one visit');
    await core.commitEvent(a, event('active', base + 66 * 60 * 1000, 'activity'));
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits, 2, 'inactivity beyond 30 minutes opens a new visit');
  }

  await db.ref().set(null);
  {
    const fail = { path: `analytics/webV1/bucketState/daily/${keys.daily}` };
    const a = adapter(db, fail);
    const item = event('partial', base);
    await assert.rejects(() => core.commitEvent(a, item), /simulated bucket failure/);
    assert.strictEqual((await bucket(db, 'hourly', keys.hourly)).visits, 1, 'some buckets can commit before partial failure');
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits || 0, 0, 'failed bucket is missing before retry');
    await core.commitEvent(a, item);
    assert.strictEqual((await bucket(db, 'daily', keys.daily)).visits, 1, 'retry fills missing bucket');
    assert.strictEqual((await bucket(db, 'hourly', keys.hourly)).visits, 1, 'retry does not duplicate completed bucket');
  }

  {
    assert(await denied('GET', 'analytics/webV1/bucketState/daily/2026-07-27'), 'browser read to bucketState must be denied by rules');
    assert(await denied('PUT', 'analytics/webV1/bucketState/daily/2026-07-27', { visits: 999 }), 'browser write to bucketState must be denied by rules');
    assert(await denied('GET', 'analytics/webV1/private/visitorState/x'), 'browser read to private analytics must be denied by rules');
  }

  await db.ref().set(null);
  {
    const oldAt = base - core.RETENTION_MS.daily - 1;
    await db.ref(`analytics/webV1/bucketState/daily/${keys.daily}`).set({
      visits: 3,
      visitorsApprox: 2,
      visitCommitted: { old: { committedAt: oldAt }, fresh: { committedAt: base } },
      visitorSeen: { oldVisitor: { firstSeenAt: oldAt }, freshVisitor: { firstSeenAt: base } }
    });
    await db.ref(`analytics/webV1/bucketState/daily/${keys.daily}`).transaction((current) => core.cleanupBucketState(current, 'daily', base));
    const cleaned = await bucket(db, 'daily', keys.daily);
    assert.strictEqual(cleaned.visits, 3, 'cleanup must not change aggregate visits');
    assert.strictEqual(cleaned.visitorsApprox, 2, 'cleanup must not change aggregate visitors');
    assert(!cleaned.visitCommitted.old, 'expired visit marker is removed');
    assert(cleaned.visitCommitted.fresh, 'fresh visit marker remains');
    assert(!cleaned.visitorSeen.oldVisitor, 'expired visitor marker is removed');
    assert(cleaned.visitorSeen.freshVisitor, 'fresh visitor marker remains');
  }

  await db.ref().set(null);
  await Promise.all(admin.apps.map((item) => item.delete()));
  console.log('site analytics rtdb emulator ok');
})().catch(async (err) => {
  console.error(err);
  await Promise.all(admin.apps.map((item) => item.delete()));
  process.exit(1);
});
