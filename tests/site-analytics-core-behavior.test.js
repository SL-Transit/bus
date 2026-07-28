const assert = require('assert');
const core = require('../functions/site-analytics-core.js');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parts(path) {
  return String(path || '').split('/').filter(Boolean);
}

function getAt(root, path) {
  return parts(path).reduce((node, key) => node && node[key], root);
}

function setAt(root, path, value) {
  const keys = parts(path);
  let node = root;
  for (let i = 0; i < keys.length - 1; i++) {
    node[keys[i]] = node[keys[i]] && typeof node[keys[i]] === 'object' ? node[keys[i]] : {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

class MemoryAdapter {
  constructor() {
    this.root = {};
    this.retryCallbacks = 0;
    this.failNextCommit = false;
    this.failPathOnce = '';
    this.paths = [];
  }
  async transaction(path, updateFn) {
    this.paths.push(path);
    const current = clone(getAt(this.root, path));
    if (this.retryCallbacks) {
      this.retryCallbacks -= 1;
      updateFn(clone(current));
    }
    const next = updateFn(clone(current));
    if (this.failNextCommit || (this.failPathOnce && path === this.failPathOnce)) {
      this.failNextCommit = false;
      this.failPathOnce = '';
      throw new Error('simulated commit failure');
    }
    setAt(this.root, path, clone(next));
    return { committed: true, snapshot: { val: () => clone(next) } };
  }
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

function rollup(db, granularity, key) {
  return getAt(db.root, `analytics/webV1/bucketState/${granularity}/${key}`) || {};
}

async function commit(db, item) {
  return core.commitEvent(db, item);
}

(async () => {
  const base = Date.UTC(2026, 6, 27, 1, 50, 0);

  {
    const db = new MemoryAdapter();
    await Promise.all([commit(db, event('v1', base)), commit(db, event('v1', base))]);
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 1, 'concurrent same visitor requests must add one visit');
    assert(!db.paths.includes('analytics/webV1'), 'root analytics transaction must not be used');
  }

  {
    const db = new MemoryAdapter();
    db.retryCallbacks = 2;
    await commit(db, event('v1', base));
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 1, 'transaction callback retry must not duplicate visits');
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visitorsApprox, 1, 'transaction callback retry must not duplicate visitors');
  }

  {
    const db = new MemoryAdapter();
    const first = Date.UTC(2026, 6, 27, 1, 55, 0);
    const second = Date.UTC(2026, 6, 27, 2, 10, 0);
    const firstHour = core.bucketKeys(new Date(first)).hourly;
    const secondHour = core.bucketKeys(new Date(second)).hourly;
    await commit(db, event('v1', first));
    await commit(db, event('v1', second));
    assert.strictEqual(rollup(db, 'hourly', firstHour).visits, 1, 'first hour has the visit');
    assert.strictEqual(rollup(db, 'hourly', secondHour).visits || 0, 0, 'same session crossing an hour must not add a new visit');
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 1, 'daily stays consistent for cross-hour session');
  }

  {
    const db = new MemoryAdapter();
    await commit(db, event('v1', base));
    await commit(db, event('v1', base + 10 * 60 * 1000, 'activity'));
    await commit(db, event('v1', base + 20 * 60 * 1000, 'activity'));
    await commit(db, event('v1', base + 35 * 60 * 1000, 'activity'));
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 1, 'continuous activity keeps the same session beyond 30 minutes');
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').pageViews, 1, 'activity must not add pageViews');
  }

  {
    const db = new MemoryAdapter();
    await commit(db, event('v1', base));
    await commit(db, event('v1', base + 31 * 60 * 1000, 'activity'));
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 2, 'activity after 30 inactive minutes creates a new visit');
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').pageViews, 1, 'new activity visit still does not add pageViews');
  }

  {
    const db = new MemoryAdapter();
    db.failNextCommit = true;
    await assert.rejects(() => commit(db, event('v1', base)), /simulated/);
    await commit(db, event('v1', base));
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 1, 'retry after failed commit must not lose visit');
  }

  {
    const db = new MemoryAdapter();
    const item = event('v1', base);
    const dailyKey = core.bucketKeys(new Date(base)).daily;
    db.failPathOnce = `analytics/webV1/bucketState/daily/${dailyKey}`;
    await assert.rejects(() => commit(db, item), /simulated/);
    assert.strictEqual(rollup(db, 'hourly', core.bucketKeys(new Date(base)).hourly).visits, 1, 'other buckets can commit before partial failure');
    assert.strictEqual(rollup(db, 'daily', dailyKey).visits || 0, 0, 'failed bucket is missing before retry');
    await commit(db, item);
    assert.strictEqual(rollup(db, 'daily', dailyKey).visits, 1, 'retry fills only the missing bucket');
    assert.strictEqual(rollup(db, 'hourly', core.bucketKeys(new Date(base)).hourly).visits, 1, 'retry does not duplicate already committed bucket');
  }

  {
    const db = new MemoryAdapter();
    const item = event('v1', base);
    await commit(db, item);
    await commit(db, item);
    assert.strictEqual(rollup(db, 'daily', '2026-07-27').visits, 1, 'duplicate retry must not duplicate visits');
  }

  {
    const oldBucket = {
      visits: 4,
      visitorsApprox: 3,
      visitCommitted: { old: { committedAt: base - core.RETENTION_MS.daily - 1 }, fresh: { committedAt: base } },
      visitorSeen: { oldVisitor: { firstSeenAt: base - core.RETENTION_MS.daily - 1 }, freshVisitor: { firstSeenAt: base } }
    };
    const cleaned = core.cleanupBucketState(oldBucket, 'daily', base);
    assert.strictEqual(cleaned.visits, 4, 'cleanup must not change aggregate visits');
    assert.strictEqual(cleaned.visitorsApprox, 3, 'cleanup must not change aggregate visitors');
    assert(!cleaned.visitCommitted.old, 'expired visit marker must be removed');
    assert(cleaned.visitCommitted.fresh, 'open bucket visit marker must remain');
    assert(!cleaned.visitorSeen.oldVisitor, 'expired visitor marker must be removed');
    assert(cleaned.visitorSeen.freshVisitor, 'open bucket visitor marker must remain');
  }

  {
    const db = new MemoryAdapter();
    const item = event('v1', base);
    await commit(db, item);
    await commit(db, item);
    for (const granularity of ['hourly', 'daily', 'weekly', 'monthly', 'yearly']) {
      const key = core.bucketKeys(new Date(base))[granularity];
      assert.strictEqual(rollup(db, granularity, key).visitorsApprox, 1, `${granularity} visitor marker must retry without duplicate`);
      assert.strictEqual(rollup(db, granularity, key).visits, 1, `${granularity} visit count must be consistent`);
    }
  }

  {
    const oversized = { contractVersion: core.VERSION, eventType: 'page_view', deviceId: 'd_x', pageCategory: 'home', pad: 'x'.repeat(core.MAX_BODY_BYTES) };
    assert.strictEqual(core.validatePayload(oversized, core.MAX_BODY_BYTES + 1).error, 'payload_too_large', 'oversized payload must be rejected');
  }

  {
    const db = new MemoryAdapter();
    await commit(db, event('v1', base, 'activity'));
    const result = await commit(db, event('v1', base + 60 * 1000, 'activity'));
    assert.strictEqual(result.accepted, false, 'abnormally frequent activity must be throttled');
    assert.strictEqual(result.reason, 'activity_throttled');
  }

  console.log('site analytics core behavior ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
