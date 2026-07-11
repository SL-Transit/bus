'use strict';

const {
  buildDryRunSnapshot,
  buildStableIdRegistry,
  resolveStableIdFromRegistry,
  validateReferences,
  validateStableIdRegistry
} = require('../tools/erp-data-center-dry-run-snapshot.js');
const registryAuthority = require('../tools/erp-stable-id-registry.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function values(value) {
  return Object.values(value || {});
}

function hasBlock(validation, code) {
  return validation.blockers.some((blocker) => blocker.code === code);
}

(async () => {
  const result = await buildDryRunSnapshot();
  const erp = result.snapshot.erpDataCenter;
  const baselineRegistry = buildStableIdRegistry();

  assert(Object.keys(baselineRegistry.entries).length === 118, 'registry entry count mismatch');
  assert(Object.keys(registryAuthority.OWNER_ENTRIES).length === 118, 'explicit owner registry count mismatch');
  assert(baselineRegistry.allocationPolicy === 'append_only_explicit_no_reuse', 'registry must prohibit ID reuse');
  assert(validateStableIdRegistry(erp).blockers.length === 0, 'baseline registry must validate');

  const renamed = clone(erp);
  const oldKey = 'chachoengsao';
  const newKey = 'chachoengsao_renamed_for_test';
  const originalNodeId = renamed.destinations[oldKey].nodeId;
  renamed.destinations[newKey] = Object.assign({}, renamed.destinations[oldKey], { destinationId: newKey, displayNameTh: 'ชื่อใหม่สำหรับทดสอบ' });
  delete renamed.destinations[oldKey];
  assert(renamed.destinations[newKey].nodeId === originalNodeId, 'legacy key rename changed stable node ID');
  assert(validateStableIdRegistry(renamed).blockers.length === 0, 'legacy key rename changed registry ownership');
  const renamedRegistry = buildStableIdRegistry();
  const renamedEntry = renamedRegistry.entries[originalNodeId];
  renamedEntry.legacyRefs = renamedEntry.legacyRefs.filter((ref) => ref !== oldKey).concat(newKey);
  assert(resolveStableIdFromRegistry(renamedRegistry, 'networkNode', newKey) === originalNodeId, 'renamed legacy key did not resolve to existing stable ID');

  const aliasAdded = clone(erp);
  const aliasNode = aliasAdded.networkNodes[originalNodeId];
  aliasNode.aliases.push('alias_added_for_test');
  assert(aliasNode.nodeId === originalNodeId, 'adding alias changed stable node ID');
  assert(validateStableIdRegistry(aliasAdded).blockers.length === 0, 'adding alias changed registry ownership');
  const aliasRegistry = buildStableIdRegistry();
  aliasRegistry.entries[originalNodeId].legacyRefs.push('alias_added_for_test');
  assert(resolveStableIdFromRegistry(aliasRegistry, 'networkNode', 'alias_added_for_test') === originalNodeId, 'new alias did not resolve to existing stable ID');

  const reordered = clone(erp);
  reordered.networkNodes = Object.fromEntries(Object.entries(reordered.networkNodes).reverse());
  reordered.groupStops = Object.fromEntries(Object.entries(reordered.groupStops).reverse());
  assert(validateStableIdRegistry(reordered).blockers.length === 0, 'input reordering changed registry ownership');
  assert(Object.keys(reordered.networkNodes).sort().join('|') === Object.keys(erp.networkNodes).sort().join('|'), 'input reordering changed IDs');

  const insertedRequests = [
    { entityType: 'networkNode', legacyRef: 'ao_udom' },
    { entityType: 'networkNode', legacyRef: 'new_entity_inserted_between_inputs' },
    { entityType: 'networkNode', legacyRef: 'asok' }
  ];
  const registryBeforeUnknownAudit = JSON.stringify(baselineRegistry);
  const insertedAudit = registryAuthority.auditRequests(baselineRegistry, insertedRequests);
  assert(insertedAudit.blockers.length === 1 && insertedAudit.blockers[0].code === 'unregistered_stable_id', 'unknown inserted entity must block');
  assert(insertedAudit.proposals.length === 1, 'unknown inserted entity must create one review proposal');
  assert(insertedAudit.proposals[0].proposedStableId === 'node_000050', 'unknown inserted entity proposal mismatch');
  assert(insertedAudit.proposals[0].persistAutomatically === false, 'allocation proposal must not persist automatically');
  assert(JSON.stringify(baselineRegistry) === registryBeforeUnknownAudit, 'unknown source audit silently mutated registry');
  assert(registryAuthority.resolveByLegacyRef(baselineRegistry, 'networkNode', 'ao_udom') === 'node_000001', 'insertion shifted first existing ID');
  assert(registryAuthority.resolveByLegacyRef(baselineRegistry, 'networkNode', 'asok') === 'node_000002', 'insertion shifted second existing ID');

  const removed = clone(erp);
  const removedNode = removed.networkNodes.node_000001;
  delete removed.networkNodes.node_000001;
  assert(hasBlock(validateStableIdRegistry(removed), 'registered-entity-missing'), 'removed active entity must be detected');
  removed.networkNodes.node_000001 = removedNode;
  assert(validateStableIdRegistry(removed).blockers.length === 0, 'restored entity must retain historical ID');

  const retired = clone(erp);
  const retiredEntry = retired.meta.stableIdRegistry.entries.node_000001;
  retiredEntry.status = 'retired';
  retiredEntry.retiredMetadata = { retiredVersion: 'test-only', reason: 'registry invariant test' };
  delete retired.networkNodes.node_000001;
  assert(validateStableIdRegistry(retired).blockers.length === 0, 'retired ownership must remain reserved without active entity');
  assert(retired.meta.stableIdRegistry.entries.node_000001.ownerRef === 'networkNode:000001', 'retirement removed ownership');

  const retiredReuse = clone(erp);
  retiredReuse.meta.stableIdRegistry.entries.node_000001.status = 'retired';
  retiredReuse.meta.stableIdRegistry.entries.node_000001.retiredMetadata = { retiredVersion: 'test-only', reason: 'registry invariant test' };
  retiredReuse.networkNodes.node_000001.registryOwnerRef = 'networkNode:999999';
  assert(hasBlock(validateStableIdRegistry(retiredReuse), 'retired-stable-id-reused'), 'retired ID reuse was not rejected');

  const duplicateOwnership = clone(erp);
  const registryEntries = values(duplicateOwnership.meta.stableIdRegistry.entries);
  registryEntries[1].ownerRef = registryEntries[0].ownerRef;
  assert(hasBlock(validateStableIdRegistry(duplicateOwnership), 'duplicate-registry-owner'), 'duplicate ID ownership was not rejected');

  const duplicateStableId = clone(erp);
  const duplicateEntries = values(duplicateStableId.meta.stableIdRegistry.entries);
  duplicateEntries[1].stableId = duplicateEntries[0].stableId;
  assert(hasBlock(validateStableIdRegistry(duplicateStableId), 'duplicate-stable-id-ownership'), 'duplicate stable ID claim was not rejected');

  const reassigned = clone(erp);
  values(reassigned.networkNodes)[0].registryOwnerRef = 'networkNode:999999';
  assert(hasBlock(validateStableIdRegistry(reassigned), 'stable-id-reassignment'), 'stable ID reassignment was not rejected');

  const semanticHash = clone(erp);
  const node = values(semanticHash.networkNodes)[0];
  node.nodeId = 'node_5bcd70f27a3c';
  assert(hasBlock(validateStableIdRegistry(semanticHash), 'semantic-or-hash-stable-id'), 'semantic/hash ID was not rejected');

  const fullValidation = validateReferences(erp);
  assert(fullValidation.blockers.length === 0, 'registry integration must remain valid');

  console.log('erp stable ID registry ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
