const fs = require('fs');
const tracker = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/DriverUptimeTracker.java', 'utf8');
const gps = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/GpsService.java', 'utf8');
const workflow = fs.readFileSync('.github/workflows/build-driver-apk.yml', 'utf8');
for (const required of [
  'HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L',
  'OFFLINE_AFTER_MS = 3 * HEARTBEAT_INTERVAL_MS',
  'Asia/Bangkok',
  'lastSeenAt',
  'gapCount',
  'maxGapSeconds'
]) if (!tracker.includes(required)) throw new Error(`missing uptime rule: ${required}`);
for (const required of [
  'DriverUptimeTracker',
  'driverUptimeByServiceDate',
  'uptimeWriteInFlight',
  'writeUptimeSnapshot',
  'onDisconnect().updateChildren'
]) if (!gps.includes(required)) throw new Error(`missing GPS uptime wiring: ${required}`);
if (!workflow.includes('driver-uptime-history.test.js')) throw new Error('workflow does not run uptime test');
console.log('driver uptime history checks passed');