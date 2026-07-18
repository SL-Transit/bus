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
assert(driver.includes('snap.child("allTrips")'), 'Driver app must read the full daily trip list');
assert(driver.includes('selectTripsForCurrentBangkokTime'), 'Driver app must select the current trip from real Bangkok time');
assert(driver.includes('Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Bangkok"))'), 'Driver app must use Bangkok time for daily trip selection');
assert(driver.includes('putInt(KEY_DRIVER_QUEUE_NO, queueNo.intValue())'), 'Driver app must store the central queue number for GPS runtime data');

assert(!driver.includes('settings/queueRotation'), 'Driver app must not read rotation settings and calculate its own queue');
assert(!driver.includes('settings/currentCatalogVersion'), 'Driver app must not assemble work from a catalog version');
assert(!driver.includes('routeData/stops'), 'Driver app must not load legacy stop coordinates');
assert(!driver.includes('fallbackBaseQueue'), 'Driver app must not keep vehicle-to-queue fallback rules');
assert(!driver.includes('calculateTodayQueue'), 'Driver app must not rotate queues from a local date calculation');
assert(!driver.includes('loadLegacyTodayScheduleForQueue'), 'Driver app must not load a legacy schedule fallback');
assert(!driver.includes('routeData/queues/'), 'Driver app must not read raw queue trips');
assert(!driver.includes('computeActiveTripAndUpdateCard'), 'Driver app must not use the old legacy active-trip selector');

console.log('driver work center wiring ok');
