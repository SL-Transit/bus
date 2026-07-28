const assert = require('assert');
const fs = require('fs');

const siteAnalytics = fs.readFileSync('site-analytics.js', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');
const rules = fs.readFileSync('database.rules.json', 'utf8');
const adminHtml = fs.readFileSync('admin-erp.html', 'utf8');
const readModelSource = fs.readFileSync('screen01-central-read-model.js', 'utf8');
const coreSource = fs.readFileSync('functions/site-analytics-core.js', 'utf8');
const bookingActivitySource = fs.readFileSync('booking-activity-read-model.js', 'utf8');
const readModel = require('../screen01-central-read-model.js');

assert(siteAnalytics.includes('navigator.webdriver'), 'automated browser runs must not be counted');
assert(siteAnalytics.includes("localStorage.getItem(ADMIN_KEY) === '1'"), 'admin devices must not be counted');
assert(siteAnalytics.includes('fetch(ENDPOINT'), 'browser must send analytics to Cloud Function');
assert(!/firebase|database\(|\.ref\(|analytics\/webV1/.test(siteAnalytics), 'browser must not read/write analytics database paths');
assert(!/crypto\.subtle|SHA-|digest\(/.test(siteAnalytics), 'browser must not hash or access dedupe hashes');
assert(!/sessionId|occurredAt|timeZone|screen\.width|screen\.height/.test(siteAnalytics), 'client payload must not include session id, client time, timezone, or screen size');
assert(siteAnalytics.includes("payload('activity', source)") && siteAnalytics.includes('activitySource'), 'client must send throttled activity pings');
assert(siteAnalytics.includes('ACTIVITY_THROTTLE_MS = 5 * 60 * 1000'), 'activity ping must be throttled to 5 minutes');
assert(siteAnalytics.includes('visibilityState') && siteAnalytics.includes('click') && siteAnalytics.includes('keydown') && siteAnalytics.includes('touchstart'), 'activity sources must be allowed sources only');
assert(!/mousemove|scroll/.test(siteAnalytics), 'mousemove and unthrottled scroll must not be tracked');
for (const category of ['home', 'booking', 'passenger', 'ticket_check', 'cancellation', 'help_info']) {
  assert(siteAnalytics.includes(`'${category}'`), `missing page category ${category}`);
}
assert(siteAnalytics.includes('.catch(function() {})'), 'analytics failure must not break passenger pages');

assert(functionsIndex.includes('defineSecret("ANALYTICS_HASH_SECRET")'), 'HMAC secret must be defined as a Firebase Secret');
assert(functionsIndex.includes('secrets: [analyticsHashSecret]'), 'tracking function must bind the HMAC secret');
assert(functionsIndex.includes('crypto.createHmac("sha256", analyticsHashSecret.value())'), 'hashing must use server-side HMAC-SHA256');
assert(!functionsIndex.includes('crypto.createHash("sha256")'), 'plain SHA-256 must not be used');
assert(functionsIndex.includes('safeAnalyticsId(payload.deviceId, "visitor")'), 'visitor id must be hashed on server');
assert(!/body\.sessionId|safeAnalyticsId\(body\.sessionId/.test(functionsIndex + coreSource), 'server must not trust a client session id');
assert(coreSource.includes('SESSION_TIMEOUT_MS = 30 * 60 * 1000'), 'server session timeout must be 30 minutes');
assert(coreSource.includes('analytics/webV1/private/visitorState/${event.visitorHash}'), 'server visitor state path must exist');
assert(coreSource.includes('analytics/webV1/bucketState/${job.granularity}/${job.key}'), 'bucket transaction path must exist');
assert(!coreSource.includes('transaction("analytics/webV1"') && !coreSource.includes("transaction('analytics/webV1'"), 'root analytics transaction must not be used');
assert(coreSource.includes('event.nowMs - lastActivityAt >= SESSION_TIMEOUT_MS'), 'server must enforce 30-minute visit acceptance');
assert(coreSource.includes('bucket.visitCommitted') && coreSource.includes('acceptedVisitId'), 'accepted visit id and commit marker must exist');
assert(coreSource.includes('event.eventType === "page_view"'), 'only page_view may add pageViews');
assert(coreSource.includes('event.eventType === "activity"'), 'activity events must be handled');
assert(coreSource.includes('bucket.visitorSeen'), 'visitor approximate marker must exist');
assert(!/let\s+firstSeen|var\s+firstSeen|markFirstSeen/.test(functionsIndex), 'transaction race fix must not use stale firstSeen variables');
assert(coreSource.includes('timeZone: TIMEZONE'), 'Bangkok timezone must be explicit on server');
assert(!/req\.ip|x-forwarded-for|user-agent|User-Agent/i.test(functionsIndex), 'raw IP and raw user agent must not be read or stored');
assert(!/deviceId.*set|body\.deviceId.*update|body\.deviceId.*set/.test(functionsIndex), 'raw visitor ids must not be written');
assert(functionsIndex.includes('unsupported_media_type'), 'trackWebVisit must validate content type');
assert(functionsIndex.includes('siteAnalyticsCore.validatePayload'), 'trackWebVisit must validate the narrow payload');
assert(coreSource.includes('MAX_BODY_BYTES = 2048'), 'trackWebVisit must enforce body size limit');
assert.strictEqual(require('../functions/site-analytics-core.js').byteLength(Buffer.from('abcd')), 4, 'byteLength must support Buffer');
assert(coreSource.includes('PAYLOAD_FIELDS'), 'trackWebVisit must reject unknown fields');
assert(coreSource.includes('EVENT_TYPES') && coreSource.includes('"activity"'), 'trackWebVisit must allow only known event types');

assert(functionsIndex.includes('exports.readSiteAnalytics = onRequest'), 'readSiteAnalytics HTTPS Function must exist');
assert(functionsIndex.includes('exports.readBookingActivity = onRequest'), 'readBookingActivity HTTPS Function must exist');
assert(functionsIndex.includes('region: "asia-southeast1"'), 'functions must use asia-southeast1');
assert(functionsIndex.includes('req.method !== "GET"'), 'readSiteAnalytics must validate GET method');
assert(functionsIndex.includes('siteAnalyticsCore.RANGES.has(range)'), 'readSiteAnalytics must validate range allowlist');
assert(functionsIndex.includes('siteAnalyticsCore.validateAnchor(req.query.anchor)'), 'readSiteAnalytics must validate anchor format');
assert(functionsIndex.includes('readLimitOk(origin || "health-check", nowMs)'), 'readSiteAnalytics must rate limit requests');
assert(functionsIndex.includes('JSON.stringify(payload).length > 24576'), 'readSiteAnalytics must enforce a response size limit');
assert(functionsIndex.includes('analytics_read_failed'), 'database read failures must return HTTP error, not fake zero data');
assert(functionsIndex.includes('!origin && !healthCheck'), 'production browser reads must require an allowed origin');
assert(functionsIndex.includes('WEB_ANALYTICS_LOCAL_ORIGINS') && functionsIndex.includes('FUNCTIONS_EMULATOR'), 'localhost must be limited to emulator/test');
assert(functionsIndex.includes('analytics/webV1/bucketState/${plan.granularity}/${point.key}'), 'readSiteAnalytics may only read selected bucket counters');
assert(functionsIndex.includes('exports.cleanupSiteAnalyticsPrivate = onSchedule'), 'scheduled cleanup function must exist');
assert(coreSource.includes('RETENTION_MS'), 'retention policy must be declared in contract');
assert(!/req\.query\.path|req\.body\.path|databasePath|firebasePath/i.test(functionsIndex), 'client must not choose a database path');
assert(functionsIndex.includes('key: point.key') && functionsIndex.includes('visits,') && functionsIndex.includes('estimatedVisitors'), 'readSiteAnalytics response must expose only chart aggregate fields');
assert(functionsIndex.includes('bookings, cancellations, refunds') || (functionsIndex.includes('bookings: 0') && functionsIndex.includes('cancellations: 0') && functionsIndex.includes('refunds: 0')), 'readBookingActivity response must expose only aggregate booking fields');
for (const privateBookingField of ['name', 'phone', 'bookingCode', 'ticketCode', 'paymentEvidence', 'passengerId', 'rawBooking']) {
  assert(!new RegExp(`${privateBookingField}\\s*:`).test(functionsIndex), `readBookingActivity must not return ${privateBookingField}`);
}
for (const granularity of ['hourly', 'daily', 'weekly', 'monthly', 'yearly']) {
  assert(coreSource.includes(granularity), `missing ${granularity} rollup logic`);
}

const parsedRules = JSON.parse(rules);
const webV1Rules = parsedRules.rules.analytics.webV1;
assert.strictEqual(webV1Rules['.read'], false, 'client reads to analytics/webV1 must be blocked');
assert.strictEqual(webV1Rules['.write'], false, 'client writes to analytics/webV1 must be blocked');
assert.strictEqual(webV1Rules.rollups['.read'], false, 'browser must not read rollups directly');
assert.strictEqual(webV1Rules.rollups['.write'], false, 'browser must not write rollups directly');
assert.strictEqual(webV1Rules.bucketState['.read'], false, 'browser must not read bucketState directly');
assert.strictEqual(webV1Rules.bucketState['.write'], false, 'browser must not write bucketState directly');
assert.strictEqual(webV1Rules.private['.read'], false, 'private analytics paths must not be readable');
assert.strictEqual(webV1Rules.private['.write'], false, 'private analytics paths must not be writable');
assert.strictEqual(webV1Rules.private.visitorState['.read'], false, 'visitorState must not be readable');
assert.strictEqual(webV1Rules.private.visitorSeen['.read'], false, 'visitorSeen must not be readable');
assert.strictEqual(webV1Rules.private.sessionSeen['.read'], false, 'sessionSeen must not be readable');
assert.strictEqual(webV1Rules.visitorSeen['.read'], false, 'top-level visitorSeen must not be readable');
assert.strictEqual(webV1Rules.sessionSeen['.read'], false, 'top-level sessionSeen must not be readable');
assert(!parsedRules.rules.analytics.mainWeb, 'legacy analytics/mainWeb rules must not be changed by this PR');

assert(readModelSource.includes('readSiteAnalytics'), 'Admin read model must use the HTTPS Function');
assert(readModelSource.includes('fetch(analyticsFetchUrl'), 'Admin read model must fetch analytics via HTTPS Function');
assert(!/db\.ref\(paths\.webAnalytics|analytics\/webV1\/rollups\/\+|paths\.webAnalytics \+/.test(readModelSource), 'Admin read model must not read Firebase analytics paths directly');
assert(readModelSource.includes('ANALYTICS_PRIVATE_FIELDS'), 'Admin read model must reject private fields');
assert(!adminHtml.includes('site-analytics-read-model.js'), 'admin-erp.html must not load legacy site analytics read model');
assert(!adminHtml.includes('siteAnalyticsReadModel'), 'Admin must not use legacy siteAnalyticsReadModel fallback');
assert(!/db\.ref\(['"]analytics\/mainWeb|firebase\.database\(\)\.ref\(['"]analytics\/mainWeb/.test(adminHtml + readModelSource), 'Admin must not read analytics/mainWeb');
assert(bookingActivitySource.includes('readBookingActivity'), 'booking activity model must use readBookingActivity');
assert(!/firebase\.database|\.ref\(['"]bookings['"]|\.ref\(['"]operations\/bookings['"]/.test(bookingActivitySource), 'booking activity model must not read booking records in browser');
assert(!/\.ref\(['"]bookings['"]|\.ref\(['"]operations\/bookings['"]/.test(adminHtml), 'admin-erp.html must not directly read booking records for stats');

function analyticsResponse(range, serviceDate, points) {
  return readModel.build({
    sources: {
      webAnalytics: {
        status: points.some((p) => p.visits || p.estimatedVisitors) ? 'ready' : 'empty',
        path: 'readSiteAnalytics',
        value: { status: points.some((p) => p.visits || p.estimatedVisitors) ? 'ready' : 'empty', range, timezone: 'Asia/Bangkok', points, generatedAt: 1 }
      }
    }
  }, { serviceDate, range });
}

const dailyPlan = readModel._test.analyticsBucketPlan ? readModel._test.analyticsBucketPlan('daily', '2026-07-26') : null;
assert(dailyPlan === null || dailyPlan.buckets.length === 30, 'daily helper must expose 30 buckets');

const emptyDaily = readModel.build({
  sources: {
    webAnalytics: {
      status: 'empty',
      path: 'readSiteAnalytics',
      value: {
        status: 'empty',
        range: 'daily',
        timezone: 'Asia/Bangkok',
        generatedAt: 1,
        points: Array.from({ length: 30 }, (_, index) => ({ key: readModel._test.analyticsBucketPlan('daily', '2026-07-26').buckets[index].key, label: 'x', visits: 0, estimatedVisitors: 0 }))
      }
    }
  }
}, { serviceDate: '2026-07-26', range: 'daily' });
assert.strictEqual(emptyDaily.visits.status, 'empty', 'empty source must return status empty');
assert.strictEqual(emptyDaily.visits.buckets.length, 30, 'daily range must expose 30 buckets');

for (const [range, serviceDate, expected] of [['hourly', '2026-07-26', 24], ['daily', '2026-07-26', 30], ['weekly', '2026-07-26', 12], ['monthly', '2026-07-26', 12], ['yearly', '2026-07-26', 5]]) {
  const plan = readModel._test.analyticsBucketPlan(range, serviceDate);
  const model = analyticsResponse(range, serviceDate, plan.buckets.map((bucket, index) => ({ key: bucket.key, label: bucket.label, visits: index === 0 ? 1 : 0, estimatedVisitors: index === 0 ? 1 : 0 })));
  assert.strictEqual(model.visits.buckets.length, expected, `${range} bucket count must be ${expected}`);
}

const invalidPrivate = readModel.build({
  sources: {
    webAnalytics: {
      status: 'ready',
      path: 'readSiteAnalytics',
      value: { status: 'ready', range: 'daily', points: Array.from({ length: 30 }, (_, index) => ({ key: readModel._test.analyticsBucketPlan('daily', '2026-07-26').buckets[index].key, label: 'x', visits: 0, estimatedVisitors: 0, visitorHash: 'x' })) }
    }
  }
}, { serviceDate: '2026-07-26', range: 'daily' });
assert.strictEqual(invalidPrivate.visits.status, 'error', 'read model must reject private analytics fields');

const errorModel = readModel.build({ sources: { webAnalytics: { status: 'error', path: 'readSiteAnalytics', value: {}, error: 'database unavailable' } } }, { serviceDate: '2026-07-26', range: 'daily' });
assert.strictEqual(errorModel.visits.status, 'error', 'database error must not be converted to fake zero data');

assert(adminHtml.includes("analyticsRange: 'daily'"), 'Dashboard default range must be daily');
assert(adminHtml.includes('analyticsChart(visits)'), 'Website Analytics chart must remain');
assert(adminHtml.includes('bookingActivityChart(bookings,refunds,bookingCount)') && adminHtml.includes('bookingChartRange'), 'booking/cancel/refund chart from main must remain');
assert(adminHtml.includes('financeDonuts(revenue,refunds,passengerGross,providerFare,platformFee)') && adminHtml.includes('finance-donut-grid'), 'single passenger finance donut from main must remain');
assert(!adminHtml.includes('netPlatform'), 'platform revenue donut must not be reintroduced');
assert(adminHtml.includes('55') && adminHtml.includes('5'), '55 baht/passenger and 5 baht/booking assumptions must remain visible in logic/copy');
assert(adminHtml.includes('drawerOverlay') && adminHtml.includes('toggleSidebar'), 'Sidebar and mobile drawer must remain');
assert(!/Debug|debug|mock visit|sample visit|1,248|4,238|1,285,450/i.test(adminHtml), 'Dashboard must not contain debug wording or sample analytics values');

console.log('site analytics dashboard v1 contract ok');
