const assert = require('assert');
const fs = require('fs');

const main = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/MainActivity.java', 'utf8');
const gps = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/GpsService.java', 'utf8');
const identity = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/DriverIdentityCenter.java', 'utf8');

[
  'uid',
  'driverId',
  'erpVehicleId',
  'runtimeVehicleId',
  'accountStatus',
  'sessionStatus'
].forEach((field) => {
  assert(identity.includes(`"${field}"`) || main.includes(`"${field}"`), `identity contract must include ${field}`);
});

assert(main.includes('signInWithEmailAndPassword'), 'Driver app must use Firebase Authentication email/password login');
assert(main.includes('resolveDriverAuthEmail(account)'), 'Driver app must accept central driver IDs before Firebase Auth login');
assert(main.includes('DRIVER_AUTH_EMAIL_DOMAIN'), 'Driver app must use a deterministic Auth email domain for driver IDs');
assert(main.includes('DriverIdentityCenter.PROFILE_ROOT'), 'Driver app must load the central identity profile after Auth login');
assert(main.includes('KEY_ERP_VEHICLE_ID'), 'Driver app must keep ERP vehicle id separate from runtime vehicle id');
assert(main.includes('KEY_VEHICLE_ID'), 'Driver app must still expose the runtime vehicle id for legacy GPS paths');
assert(main.includes('signOutDriver()'), 'Driver app must provide a sign-out path');
assert(main.includes('showLoginScreen'), 'Driver app must have a login-only screen before work opens');
assert(main.includes('FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT'), 'Login form must be vertically centered on screen');
assert(main.includes('rootLp.gravity = Gravity.CENTER'), 'Login form must stay centered instead of sticking to the top');
assert(main.includes('Context.RECEIVER_NOT_EXPORTED'), 'Driver app must register runtime receivers with Android 13+ safety flags');
assert(main.includes('screen receiver unavailable'), 'Driver app must not crash when screen receiver registration is blocked');
assert(main.includes('driver screen failed'), 'Driver app must return to login instead of closing when driver screen startup fails');
assert(main.includes('private void stopDriverWorkLoops()'), 'Driver app must stop active work loops before returning to login');
assert(main.includes('uiHandler.removeCallbacks(uiTick)'), 'Driver app must stop the UI refresh loop on logout');
assert(main.includes('stopDriverWorkLoops();\n        clearDriverIdentity();'), 'Driver app must stop stale listeners before clearing identity');

assert(!main.includes('autoSelectAvailableVehicle'), 'Driver app must not auto-select a vehicle from liveVehicles');
assert(!main.includes('VEHICLE_IDS'), 'Driver app must not offer a hard-coded car1-car5 picker');
assert(!main.includes('putString(KEY_VEHICLE_ID, selectedId)'), 'Driver app must not change vehicle from an in-app picker');

assert(!gps.includes('signInAnonymously'), 'GpsService must not use anonymous login as driver identity');
assert(gps.includes('getCurrentUser()'), 'GpsService must require an existing Firebase Auth user');
assert(gps.includes('DriverIdentityCenter.isAuthorizedProfile'), 'GpsService must bind writes to the verified driver profile');
assert(gps.includes('driver auth required'), 'GpsService must stop instead of writing when driver auth is missing');

assert(main.includes('operations/driverWorkByServiceDate'), 'Driver app must read work through the Driver Work Center contract');
assert(main.includes('DriverIdentityCenter.isSelfOnlyWorkPath'), 'Driver work reads must be gated to the assigned runtime vehicle');

console.log('driver identity center checks passed');
