const assert = require('assert');
const adapter = require('../admin-erp-data-adapter.js');

const root = { stops: { s1: { stopKey: 's1', nameTh: 'ต้นทาง' } }, routes: { r1: { routeId: 'r1', fromStopKey: 's1', toStopKey: 's1' } }, workbookSource: { routeFareRows: { fare_0002: { sourceRowId: 'fare_0002', amount: 100 } } } };
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

(async () => {
  let readCount = 0;
  adapter.configure({ endpoint: 'https://example.test/readAdminErpDataCenter', getIdToken: async () => 'emulator-token', now: () => 1000, fetchImpl: async (url, options) => { readCount += 1; const scope = new URL(url).searchParams.get('scope'); const payload = scope === 'stops' ? { stops: root.stops } : scope === 'routeFareRows' ? { workbookSource: { routeFareRows: root.workbookSource.routeFareRows } } : scope === 'access' ? {} : root; const path = { stops: 'data/erpDataCenter/stops', routeFareRows: 'data/erpDataCenter/workbookSource/routeFareRows', access: 'data/erpDataCenter/meta/access', root: 'data/erpDataCenter' }[scope] || 'data/erpDataCenter'; assert.strictEqual(options.headers.Authorization, 'Bearer emulator-token'); return response({ status: 'ready', path, erpDataCenter: payload, permissions: ['read'], generatedAt: 1000 }); } });
  const stops = await adapter.getCatalog('stops'); assert.strictEqual(stops.status, 'ready'); assert.strictEqual(stops.rows[0].stopKey, 's1');
  assert.strictEqual((await adapter.getCatalog('stops')).rows[0].stopKey, 's1'); assert.strictEqual(readCount, 1);
  assert.strictEqual((await adapter.getWorkbookSource('routeFareRows')).rows[0].sourceRowId, 'fare_0002'); assert.strictEqual(readCount, 2);
  const access = await adapter.getAccess(); assert.strictEqual(access.permissions.includes('read'), true); assert.strictEqual(readCount, 3);
  adapter.clearReadCache('stops'); assert.strictEqual((await adapter.getCatalog('stops')).rows[0].stopKey, 's1'); assert.strictEqual(readCount, 4);
  adapter.configure({ endpoint: 'https://example.test/read-order', getIdToken: async () => 'token', fetchImpl: async (url) => {
    const scope = new URL(url).searchParams.get('scope');
    const payload = scope === 'stops' ? { stops: {
      stop_0003: { stopKey: 'stop_0003', sourceRowNumber: 3 },
      stop_0002: { stopKey: 'stop_0002', sourceRowNumber: 2 }
    } } : scope === 'assignmentRules' ? { fleet: {
      assignmentRules: { rule_1: { runtimeVehicleId: 'runtime_1', sourceRowNumber: 5 } }
    } } : { routes: {
      route_b: { routeId: 'route_b' },
      route_a: { routeId: 'route_a' }
    } };
    const path = scope === 'stops' ? 'data/erpDataCenter/stops' : scope === 'assignmentRules' ? 'data/erpDataCenter/fleet/assignmentRules' : 'data/erpDataCenter/routes';
    return response({ status: 'ready', path, erpDataCenter: payload, generatedAt: 1000 });
  }, now: () => 1000 });
  const orderedStops = await adapter.getCatalog('stops');
  assert.deepStrictEqual(orderedStops.rows.map((row) => row.stopKey), ['stop_0002', 'stop_0003'], 'Excel source row numbers must control row order');
  assert.strictEqual(orderedStops.orderVerified, true);
  const payloadOrderRoutes = await adapter.getCatalog('routes');
  assert.deepStrictEqual(payloadOrderRoutes.rows.map((row) => row.routeId), ['route_b', 'route_a'], 'without source row numbers the adapter must preserve backend payload order');
  assert.strictEqual(payloadOrderRoutes.status, 'partial');
  assert.strictEqual(payloadOrderRoutes.orderVerified, false);
  const assignmentRules = await adapter.getCatalog('assignmentRules');
  assert.strictEqual(assignmentRules.path, 'data/erpDataCenter/fleet/assignmentRules');
  assert.strictEqual(assignmentRules.rows[0].runtimeVehicleId, 'runtime_1');
  adapter.configure({ endpoint: 'https://example.test/enrich', getIdToken: async () => 'token', fetchImpl: async (url) => {
    const scope = new URL(url).searchParams.get('scope');
    const payloads = {
      stopTimes: { stopTimes: { time_1: { tripId: 'trip_1', stopKey: 'stop_0002', time: '09:00', sourceRowNumber: 2 } } },
      stops: { stops: { stop_0002: { stopKey: 'stop_0002', nameTh: 'ป้ายกลาง' } } },
      assignmentRules: { fleet: { assignmentRules: { rule_1: { runtimeVehicleId: 'runtime_1', serviceGroupId: 'group_001' } } } },
      serviceGroups: { serviceGroups: { group_001: { serviceGroupId: 'group_001', displayNameTh: 'กลุ่มกลาง' } } }
    };
    const paths = { stopTimes: 'data/erpDataCenter/stopTimes', stops: 'data/erpDataCenter/stops', assignmentRules: 'data/erpDataCenter/fleet/assignmentRules', serviceGroups: 'data/erpDataCenter/serviceGroups' };
    return response({ status: 'ready', path: paths[scope], erpDataCenter: payloads[scope], generatedAt: 1000 });
  }, now: () => 1000 });
  const enrichedStopTimes = await adapter.getCatalog('stopTimes');
  assert.strictEqual(enrichedStopTimes.rows[0].stopNameTh, 'ป้ายกลาง', 'stop times must resolve names from the canonical stop catalog');
  assert.strictEqual(enrichedStopTimes.status, 'ready');
  const enrichedAssignments = await adapter.getCatalog('assignmentRules');
  assert.strictEqual(enrichedAssignments.rows[0].serviceGroupNameTh, 'กลุ่มกลาง', 'assignment rules must resolve service group names from the canonical catalog');
  assert.strictEqual(enrichedAssignments.status, 'ready');
  adapter.configure({ endpoint: 'https://example.test/admin-read', getIdToken: async () => 'owner-token', fetchImpl: async (url) => {
    const scope = new URL(url).searchParams.get('scope');
    const payloads = {
      adminAccounts: { adminAccounts: { owner: { uid: 'owner', role: 'owner', canRead: true } } },
      alerts: { meta: { alerts: { alert_1: { alertId: 'alert_1', type: 'review', priority: 'normal', status: 'open' } } } }
    };
    const paths = { adminAccounts: 'data/erpDataCenter/adminAccounts', alerts: 'data/erpDataCenter/meta/alerts' };
    return response({ status: 'ready', path: paths[scope], erpDataCenter: payloads[scope], generatedAt: 1000 });
  }, now: () => 1000 });
  const adminAccounts = await adapter.getCatalog('adminAccounts');
  assert.strictEqual(adminAccounts.path, 'data/erpDataCenter/adminAccounts');
  assert.strictEqual(adminAccounts.rows[0].uid, 'owner');
  const alerts = await adapter.getCatalog('alerts');
  assert.strictEqual(alerts.path, 'data/erpDataCenter/meta/alerts');
  assert.strictEqual(alerts.rows[0].alertId, 'alert_1');
  const draft = await adapter.createDraft({ base: { stops: root.stops }, records: { stops: { s1: root.stops.s1 } } }); await adapter.updateDraft(draft.draftId, { routes: { r1: root.routes.r1 } });
  const validation = await adapter.validateDraft(draft.draftId); assert.strictEqual(validation.valid, true); assert.strictEqual(validation.auditPreview.productionWrite, false); assert.strictEqual(validation.diff.counts.added, 1);
  const review = await adapter.submitForReview(draft.draftId); assert.strictEqual(review.status, 'in_review'); assert.strictEqual(review.productionWrite, false);
  await assert.rejects(() => adapter.approveReview(review.reviewId, { localOnly: true, role: 'viewer', ownerApproved: false }), (error) => error.code === 'owner_approval_required');
  const approval = await adapter.approveReview(review.reviewId, { localOnly: true, role: 'owner', ownerApproved: true }); assert.strictEqual(approval.status, 'approved');
  const published = await adapter.publish(review.reviewId); assert.strictEqual(published.status, 'published'); assert.strictEqual(published.localOnly, true); assert.strictEqual(published.productionWrite, false);
  const history = await adapter.getAuditHistory(); assert(history.count >= 4);
  const rolledBack = await adapter.rollback(published.versionId); assert.strictEqual(rolledBack.status, 'rolled_back'); assert.strictEqual(rolledBack.productionWrite, false);
  const duplicateDraft = await adapter.createDraft({ records: { stops: [{ stopKey: 'duplicate' }, { stopKey: 'duplicate' }] } }); const duplicateValidation = await adapter.validateDraft(duplicateDraft.draftId); assert(duplicateValidation.issues.some((issue) => issue.code === 'duplicate_id'));
  const missingDraft = await adapter.createDraft({ records: { routes: { route_1: { routeId: 'route_1', fromStopKey: 's1' } } } }); const missingValidation = await adapter.validateDraft(missingDraft.draftId); assert(missingValidation.issues.some((issue) => issue.code === 'missing_required_field' && issue.field === 'toStopKey'));
  const foreignKeyDraft = await adapter.createDraft({ records: { routes: { route_1: { routeId: 'route_1', fromStopKey: 'missing', toStopKey: 'missing' } } } }); const foreignKeyValidation = await adapter.validateDraft(foreignKeyDraft.draftId); assert(foreignKeyValidation.issues.some((issue) => issue.code === 'invalid_foreign_key'));
  const relationshipDraft = await adapter.createDraft({ records: {
    stops: { stop_1: { stopKey: 'stop_1' } },
    routes: { route_1: { routeId: 'route_1', fromStopKey: 'stop_1', toStopKey: 'stop_1' } },
    fares: { fare_1: { fareId: 'fare_1', routeId: 'route_1', serviceGroupId: 'missing_group', fromStopKey: 'missing_stop', toStopKey: 'stop_1', amount: 55 } },
    queues: { queue_1: { queueId: 'queue_1', groupId: 'missing_group' } }
  } });
  const relationshipValidation = await adapter.validateDraft(relationshipDraft.draftId);
  assert(relationshipValidation.issues.some((issue) => issue.entity === 'fares' && issue.field === 'serviceGroupId'), 'fare must reference an existing service group');
  assert(relationshipValidation.issues.some((issue) => issue.entity === 'fares' && issue.field === 'fromStopKey'), 'fare origin must reference an existing stop');
  assert(relationshipValidation.issues.some((issue) => issue.entity === 'queues' && issue.field === 'groupId'), 'queue must reference an existing service group');
  await assert.rejects(() => adapter.publish('review-1'), (error) => error.code === 'review_not_found');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => null, fetchImpl: async () => response({}) }); await assert.rejects(() => adapter.getCatalog('stops'), (error) => error.code === 'token_required');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => 'token', fetchImpl: async () => response({}, 403) }); await assert.rejects(() => adapter.getCatalog('stops'), (error) => error.code === 'forbidden');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => 'token', fetchImpl: async () => response({ erpDataCenter: { passengers: { p1: {} } } }) }); await assert.rejects(() => adapter.getCatalog('stops'), (error) => error.code === 'forbidden_data_scope');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => 'token', fetchImpl: async () => response({ status: 'empty', path: 'data/erpDataCenter/stops', erpDataCenter: {} }) }); assert.strictEqual((await adapter.getCatalog('stops')).status, 'empty');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => 'token', fetchImpl: async () => response({ status: 'partial', path: 'data/erpDataCenter/stops', erpDataCenter: { stops: { s1: {} } } }) }); assert.strictEqual((await adapter.getCatalog('stops')).status, 'partial');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => 'token', now: () => 100000, maxAgeMs: 10, fetchImpl: async () => response({ status: 'ready', path: 'data/erpDataCenter/stops', erpDataCenter: {}, generatedAt: 1 }) }); assert.strictEqual((await adapter.getCatalog('stops')).status, 'stale');
  adapter.configure({ endpoint: 'https://example.test/read', getIdToken: async () => 'token', fetchImpl: async () => { throw new Error('network timeout'); } }); await assert.rejects(() => adapter.getCatalog('stops'), (error) => error.code === 'endpoint_error');
  adapter.configure({ endpoint: '', getIdToken: async () => 'token', fetchImpl: async () => response({}) }); await assert.rejects(() => adapter.getCatalog('stops'), (error) => error.code === 'data_source_not_configured');
  console.log('admin-erp-data-adapter: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
