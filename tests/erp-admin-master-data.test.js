const schema = require('../erp-schema.js');
require('../erp-import-plan.js');
const adminMasterData = require('../erp-admin-master-data.js');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function codes(result) {
  return (result.blockers || result.validation && result.validation.blockers || []).map((item) => item.code);
}

const validVehicleChange = {
  dryRun: true,
  writesEnabled: false,
  readyForApply: false,
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'create',
  entityType: 'vehicle',
  entityId: 'veh_005',
  reason: 'Batch 1 dry-run master-data foundation test',
  after: {
    vehicleId: 'veh_005',
    status: 'active',
    environmentStatus: 'test',
    productionReady: false,
    legacyAliases: ['car5'],
    liveTrackingAvailable: false
  }
};

const validPlan = adminMasterData.buildMasterDataPlan(validVehicleChange);
assert(validPlan.dryRun === true, 'master-data plan must stay dry-run');
assert(validPlan.writesEnabled === false, 'master-data plan must keep writes disabled');
assert(validPlan.readyForApply === false, 'master-data plan must not be apply-ready');
assert(validPlan.validation.readyForReview === true, 'valid vehicle change should be review-ready');
assert(validPlan.updates['data/erpDataCenter/fleet/vehicles/veh_005'], 'vehicle update path missing');
assert(Object.keys(validPlan.updates).some((path) => path.indexOf('data/erpDataCenter/meta/audit/audit_') === 0), 'append-only audit update missing');
assert(!Object.keys(validPlan.updates).some((path) => path.indexOf('operations/') === 0), 'plan must not target runtime operations');

const notOwner = adminMasterData.validateMasterDataChange(Object.assign({}, validVehicleChange, { actorId: 'other_admin' }));
assert(codes(notOwner).indexOf('owner-admin-required') !== -1, 'owner_admin guard missing');

const aliasVehicle = adminMasterData.validateMasterDataChange(Object.assign({}, validVehicleChange, {
  entityId: 'car5',
  after: { vehicleId: 'car5', status: 'active', ownerActivated: true }
}));
assert(codes(aliasVehicle).indexOf('legacy-alias-used-as-vehicle-id') !== -1, 'legacy car alias vehicle ID must be blocked');

const approvedCar5 = adminMasterData.validateMasterDataChange(validVehicleChange);
assert(codes(approvedCar5).indexOf('car5-active-without-owner-activation') === -1, 'approved car5 must not require owner activation metadata blocker');
assert(approvedCar5.readyForReview === true, 'approved car5 with productionReady=false and liveTrackingAvailable=false should validate');

const fixedLiveCar5 = adminMasterData.validateMasterDataChange(Object.assign({}, validVehicleChange, {
  after: { vehicleId: 'veh_005', status: 'active', productionReady: false, legacyAliases: ['car5'], liveTrackingAvailable: true }
}));
assert(fixedLiveCar5.readyForReview === true, 'fixed queue car5 with live tracking and productionReady=false should validate');
assert(codes(fixedLiveCar5).indexOf('veh-005-live-tracking-not-false') === -1, 'fixed queue car5 live tracking must not warn');

const car5ProductionReady = adminMasterData.validateMasterDataChange(Object.assign({}, validVehicleChange, {
  after: { vehicleId: 'veh_005', status: 'active', productionReady: true, legacyAliases: ['car5'], liveTrackingAvailable: false }
}));
assert(codes(car5ProductionReady).indexOf('veh-005-production-ready-without-login-data') !== -1, 'veh_005 productionReady must require real registration/login data');

const testAsProd = adminMasterData.validateMasterDataChange(Object.assign({}, validVehicleChange, {
  entityId: 'veh_001',
  after: { vehicleId: 'veh_001', status: 'test', environmentStatus: 'test', productionReady: true }
}));
assert(codes(testAsProd).indexOf('test-identity-marked-production-ready') !== -1, 'test identity production-ready guard missing');

const mixedServiceFee = adminMasterData.validateMasterDataChange({
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'create',
  entityType: 'serviceFee',
  entityId: 'svc_fee_001',
  after: { serviceFeeId: 'svc_fee_001', baseFare: 55, status: 'draft' }
});
assert(codes(mixedServiceFee).indexOf('fare-mixed-with-service-fee') !== -1, 'service fee/fare separation guard missing');

const validServiceFee = adminMasterData.validateMasterDataChange({
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'create',
  entityType: 'serviceFee',
  entityId: 'platform_service_fee',
  after: {
    serviceFeeId: 'platform_service_fee',
    currency: 'THB',
    standardFee: 5,
    trialEnabled: true,
    effectiveFee: 0,
    appliesTo: 'all_service_groups',
    includesExternalPayGroups: true,
    status: 'draft'
  }
});
assert(validServiceFee.readyForReview === true, 'current default standardFee THB 5 / trial effectiveFee THB 0 should validate');

const changedStandardFee = adminMasterData.validateMasterDataChange({
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'update',
  entityType: 'serviceFee',
  entityId: 'platform_service_fee',
  after: {
    serviceFeeId: 'platform_service_fee',
    currency: 'THB',
    standardFee: 7,
    trialEnabled: true,
    effectiveFee: 0,
    appliesTo: 'all_service_groups',
    includesExternalPayGroups: true,
    status: 'draft'
  }
});
assert(changedStandardFee.readyForReview === true, 'owner_admin standardFee change to another non-negative amount should validate during free trial');

const trialOffFee = adminMasterData.validateMasterDataChange({
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'update',
  entityType: 'serviceFee',
  entityId: 'platform_service_fee',
  after: {
    serviceFeeId: 'platform_service_fee',
    currency: 'THB',
    standardFee: 7,
    trialEnabled: false,
    effectiveFee: 7,
    appliesTo: 'all_service_groups',
    includesExternalPayGroups: true,
    status: 'draft'
  }
});
assert(trialOffFee.readyForReview === true, 'turning off free trial should allow effectiveFee to follow standardFee');

const wrongServiceFee = adminMasterData.validateMasterDataChange({
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'create',
  entityType: 'serviceFee',
  entityId: 'platform_service_fee',
  after: {
    serviceFeeId: 'platform_service_fee',
    currency: 'THB',
    standardFee: -1,
    trialEnabled: false,
    effectiveFee: 'bad',
    appliesTo: 'van_only',
    includesExternalPayGroups: false,
    status: 'draft'
  }
});
const wrongFeeCodes = codes(wrongServiceFee);
assert(wrongFeeCodes.indexOf('invalid-standard-service-fee') !== -1, 'negative standard fee must be blocked');
assert(wrongFeeCodes.indexOf('invalid-effective-service-fee') !== -1, 'malformed effective fee must be blocked');
assert(wrongFeeCodes.indexOf('service-fee-not-all-groups') !== -1, 'service fee must apply to every service group');
assert(wrongFeeCodes.indexOf('service-fee-excludes-train') !== -1, 'service fee must include train/external_pay groups');

const nanServiceFee = adminMasterData.validateMasterDataChange({
  actorId: 'owner_admin',
  actorRole: 'owner_admin',
  action: 'create',
  entityType: 'serviceFee',
  entityId: 'platform_service_fee',
  after: {
    serviceFeeId: 'platform_service_fee',
    currency: 'THB',
    standardFee: 'NaN',
    trialEnabled: false,
    effectiveFee: NaN,
    appliesTo: 'all_service_groups',
    includesExternalPayGroups: true,
    status: 'draft'
  }
});
const nanFeeCodes = codes(nanServiceFee);
assert(nanFeeCodes.indexOf('invalid-standard-service-fee') !== -1, 'NaN standard fee must be blocked');
assert(nanFeeCodes.indexOf('invalid-effective-service-fee') !== -1, 'NaN effective fee must be blocked');

const privateData = adminMasterData.validateMasterDataChange(Object.assign({}, validVehicleChange, {
  entityId: 'veh_002',
  after: { vehicleId: 'veh_002', passengerName: 'Do Not Store', status: 'draft' }
}));
assert(codes(privateData).indexOf('forbidden-master-data-field') !== -1, 'private/operational field guard missing');

const snapshot = {
  data: {
    erpDataCenter: {
      settings: {},
      destinations: {
        dest_001: { destinationId: 'dest_001', displayNameTh: 'Destination A', status: 'draft' }
      },
      stops: {
        stop_001: { stopKey: 'stop_001', displayNameTh: 'Stop A', status: 'draft' }
      },
      serviceFees: {
        platform_service_fee: { serviceFeeId: 'platform_service_fee', currency: 'THB', standardFee: 5, trialEnabled: true, effectiveFee: 0, appliesTo: 'all_service_groups', includesExternalPayGroups: true, status: 'draft' }
      },
      fares: {
        stop_001: {
          stop_002: { amount: 55, currency: 'THB', paymentOwnership: 'sl_transit', serviceFeeAmount: 10 }
        }
      },
      fleet: {
        vehicles: {
          veh_005: { vehicleId: 'veh_005', status: 'provisional', legacyAliases: ['car5'], liveTrackingAvailable: false }
        },
        queues: {}
      }
    }
  }
};
const snapshotValidation = schema.validateSnapshot(snapshot);
assert(snapshotValidation.blockers.some((item) => item.code === 'service-fee-mixed-with-fare'), 'schema must block service fee mixed into OD fare');

const trainSnapshot = schema.buildSeedSkeleton();
trainSnapshot.data.erpDataCenter.settings = { schemaVersion: 'test' };
trainSnapshot.data.erpDataCenter.catalog.stops = {
  stop_001: { stopKey: 'stop_001', nameTh: 'A', order: 1 },
  train_stop: { stopKey: 'train_stop', nameTh: 'Train', order: 2 }
};
trainSnapshot.data.erpDataCenter.catalog.routes = { route_001: { id: 'route_001', fromStopKey: 'stop_001', toStopKey: 'train_stop' } };
trainSnapshot.data.erpDataCenter.catalog.trips = { trip_001: { id: 'trip_001', routeId: 'route_001', departTime: '09:40' } };
trainSnapshot.data.erpDataCenter.catalog.fares = { stop_001: { train_stop: { amount: 0, paymentOwnership: 'external_pay' } } };
trainSnapshot.data.erpDataCenter.fleet.vehicles = { veh_005: { vehicleId: 'veh_005', status: 'active', productionReady: false, legacyAliases: ['car5'], liveTrackingAvailable: false } };
trainSnapshot.data.erpDataCenter.fleet.queues = { queue_001: { queueId: 'queue_001', groupId: 'group_001' } };
trainSnapshot.data.erpDataCenter.providerRegistry = { train: { providerId: 'train', status: 'draft' } };
trainSnapshot.data.erpDataCenter.fares = { stop_001: { train_stop: { amount: 0, paymentOwnership: 'external_pay', serviceGroupId: 'group_005', providerId: 'train' } } };
trainSnapshot.data.erpDataCenter.serviceFees = { platform_service_fee: { serviceFeeId: 'platform_service_fee', currency: 'THB', standardFee: 7, trialEnabled: false, effectiveFee: 7, appliesTo: 'all_service_groups', includesExternalPayGroups: true, status: 'draft' } };
const trainValidation = schema.validateSnapshot(trainSnapshot);
assert(!trainValidation.blockers.some((item) => item.code === 'veh-005-production-ready-without-login-data'), 'veh_005 productionReady=false should not block');
assert(!trainValidation.blockers.some((item) => item.code === 'train-platform-fare-not-zero'), 'external_pay train fare amount 0 should validate');
assert(!trainValidation.blockers.some((item) => item.code === 'service-fee-mixed-with-fare'), 'service fee must remain separate and valid');

const skeleton = schema.buildSeedSkeleton();
assert(skeleton.data.erpDataCenter.destinations, 'seed skeleton missing destinations');
assert(skeleton.data.erpDataCenter.fleet.assignmentRules, 'seed skeleton missing assignmentRules');
assert(skeleton.data.erpDataCenter.meta.audit, 'seed skeleton missing append-only audit root');

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin-erp.html'), 'utf8');
const adminUi = fs.readFileSync(path.join(__dirname, '..', 'admin-master-data-ui.js'), 'utf8');
assert(adminHtml.indexOf('erp-admin-master-data.js') !== -1, 'admin page must load master-data guard');
assert(adminHtml.indexOf('admin-master-data-ui.js') !== -1, 'admin page must load master-data dry-run UI');
assert(adminUi.indexOf('DRY-RUN / NO WRITE / NOT PRODUCTION READY') !== -1, 'admin UI dry-run label missing');
assert(adminUi.indexOf('no Save, Apply, Seed, Publish, or Firebase-write action') !== -1, 'admin UI no-write warning missing');
assert(adminUi.indexOf('readOnly = true') !== -1, 'existing record stable ID lock missing');
assert(adminUi.indexOf('masterdataPage') !== -1, 'admin UI must align with existing tab hide/show naming');

console.log('erp-admin-master-data guard ok');
