const assert = require('assert');
const fs = require('fs');

const build = fs.readFileSync('driver-android/build.gradle', 'utf8');
const main = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/MainActivity.java', 'utf8');
const gps = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/GpsService.java', 'utf8');

const driverSources = `${main}\n${gps}`;

[
  'SL_TRANSIT_FIREBASE_API_KEY',
  'SL_TRANSIT_FIREBASE_APP_ID',
  'SL_TRANSIT_FIREBASE_MESSAGING_SENDER_ID',
  'SL_TRANSIT_FIREBASE_PROJECT_ID',
  'SL_TRANSIT_FIREBASE_DATABASE_URL'
].forEach((field) => {
  assert(build.includes(`buildConfigField "String", "${field}"`), `build.gradle must expose ${field}`);
});

assert(build.includes('sl-transit-9464e'), 'Driver app build config must default to the new Firebase project');
assert(
  build.includes('https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app'),
  'Driver app build config must default to the new Firebase Realtime Database URL'
);

[
  'bus-booking-1d68c',
  'bus-booking-1d68c-default-rtdb',
  'AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw'
].forEach((oldValue) => {
  assert(!driverSources.includes(oldValue), `Driver Java sources must not keep old Firebase value: ${oldValue}`);
});

assert(main.includes('BuildConfig.SL_TRANSIT_FIREBASE_DATABASE_URL'), 'MainActivity must read Firebase DB URL from BuildConfig');
assert(main.includes('BuildConfig.SL_TRANSIT_FIREBASE_API_KEY'), 'MainActivity must read Firebase API key from BuildConfig');
assert(main.includes('BuildConfig.SL_TRANSIT_FIREBASE_APP_ID'), 'MainActivity must read Firebase app id from BuildConfig');
assert(main.includes('hasFirebaseConfig()'), 'MainActivity must guard missing Firebase config before opening driver work');

assert(gps.includes('BuildConfig.SL_TRANSIT_FIREBASE_DATABASE_URL'), 'GpsService must read Firebase DB URL from BuildConfig');
assert(gps.includes('BuildConfig.SL_TRANSIT_FIREBASE_API_KEY'), 'GpsService must read Firebase API key from BuildConfig');
assert(gps.includes('BuildConfig.SL_TRANSIT_FIREBASE_APP_ID'), 'GpsService must read Firebase app id from BuildConfig');
assert(gps.includes('driver firebase config required'), 'GpsService must stop instead of sending GPS when config is missing');
assert(gps.includes('operations/liveVehicles/'), 'GpsService must write runtime GPS through operations/liveVehicles');
assert(!gps.includes('getReference("bus/'), 'GpsService must not write legacy bus path');
assert(!gps.includes('getReference("liveVehicles/'), 'GpsService must not write legacy top-level liveVehicles path');
assert(!gps.includes('settings/queueRotation'), 'GpsService must not read legacy queue rotation settings');
assert(!gps.includes('routeData/queues/'), 'GpsService must not read legacy routeData queue trips');
assert(!gps.includes('queueBaseMap'), 'GpsService must not keep hard-coded vehicle-to-queue fallback rules');
assert(!gps.includes('QUEUE_SCHEDULE'), 'GpsService must not keep hard-coded queue schedules');
assert(gps.includes('centralQueueNo = prefs.getInt(MainActivity.KEY_DRIVER_QUEUE_NO, -1)'), 'GpsService must take queue number from central driver work state only');
assert(main.includes('operations/liveVehicles/" + vehicleId + "/serviceStatus'), 'Driver service status must write through operations/liveVehicles');
assert(!main.includes('getReference("liveVehicles/" + vehicleId + "/serviceStatus")'), 'Driver service status must not write legacy liveVehicles');
assert(gps.includes('MOVING_INTERVAL_MS  = 5000'), 'Driver moving GPS interval must stay at 5 seconds');
assert(gps.includes('SLOW_INTERVAL_MS    = 4000'), 'Driver slow/starting GPS interval must follow the old 4 second cadence');
assert(gps.includes('MAX_ACCURATE_METERS = 40f'), 'Driver GPS accuracy filter must follow the old stricter 40m threshold');

console.log('driver firebase cutover checks passed');
