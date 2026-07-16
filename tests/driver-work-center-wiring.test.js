const assert = require('assert');
const fs = require('fs');
const path = require('path');

const driver = fs.readFileSync(
  path.join(__dirname, '..', 'driver-android', 'src', 'main', 'java', 'com', 'sanamchai', 'drivergps', 'MainActivity.java'),
  'utf8'
);

assert(driver.includes('operations/driverWorkByServiceDate'), 'Driver app must read the ERP Logic Center daily work contract');
assert(driver.includes('DRIVER_WORK_CONTRACT_VERSION = "driver_work_v1"'), 'Driver app must require the driver work contract version');
assert(driver.includes('applyDriverWorkContract(snap, serviceDate, vehicleId)'), 'Driver app must render the central work contract');
assert(driver.includes('snap.child("erpVehicleId")'), 'Driver app must require the stable ERP vehicle identity');
assert(driver.includes('readDriverWorkTrip(snap.child("currentTrip"))'), 'Driver app must use the centrally selected current trip');
assert(driver.includes('readDriverWorkTrip(snap.child("nextTrip"))'), 'Driver app must use the centrally selected next trip');
assert(driver.includes('putInt(KEY_DRIVER_QUEUE_NO, queueNo.intValue())'), 'Driver app must store the central queue number for GPS runtime data');

assert(!driver.includes('settings/queueRotation'), 'Driver app must not read rotation settings and calculate its own queue');
assert(!driver.includes('settings/currentCatalogVersion'), 'Driver app must not assemble work from a catalog version');
assert(!driver.includes('routeData/stops'), 'Driver app must not load legacy stop coordinates');
assert(!driver.includes('fallbackBaseQueue'), 'Driver app must not keep vehicle-to-queue fallback rules');
assert(!driver.includes('calculateTodayQueue'), 'Driver app must not rotate queues from a local date calculation');
assert(!driver.includes('loadLegacyTodayScheduleForQueue'), 'Driver app must not load a legacy schedule fallback');
assert(!driver.includes('routeData/queues/'), 'Driver app must not read raw queue trips');
assert(!driver.includes('computeActiveTripAndUpdateCard'), 'Driver app must not choose the active trip from the device clock');
assert(!driver.includes('get(java.util.Calendar.HOUR_OF_DAY)'), 'Driver app must not compare queue trips against local clock time');

console.log('driver work center wiring ok');
