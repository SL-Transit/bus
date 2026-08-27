const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCenter(navigatorValue) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'user-location-center.js'), 'utf8');
  const sandbox = {
    navigator: navigatorValue || {},
    Promise,
    Number,
    isFinite,
    module: { exports: null }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'user-location-center.js' });
  return sandbox.SLTransitUserLocation;
}

(async function run() {
  const unsupported = loadCenter({});
  const unsupportedResult = await unsupported.requestCurrentPosition();
  assert.strictEqual(unsupportedResult.ok, false, 'missing navigator geolocation must fail closed');
  assert.strictEqual(unsupportedResult.reason, 'unsupported', 'unsupported result must be explicit');

  let receivedOptions = null;
  const success = loadCenter({
    geolocation: {
      getCurrentPosition(resolve, reject, options) {
        receivedOptions = options;
        resolve({ coords: { latitude: 13.6123, longitude: 101.3123 } });
      }
    }
  });
  const successResult = await success.requestCurrentPosition({ timeout: 8000, maximumAge: 0 });
  assert.strictEqual(successResult.ok, true, 'browser position success must resolve ok');
  assert.strictEqual(JSON.stringify(successResult.point), JSON.stringify({ lat: 13.6123, lng: 101.3123, lon: 101.3123 }), 'center must normalize lng and Longdo lon');
  assert.strictEqual(receivedOptions.timeout, 8000, 'timeout must pass through');
  assert.strictEqual(receivedOptions.maximumAge, 0, 'maximumAge must pass through');

  const failure = loadCenter({
    geolocation: {
      getCurrentPosition(resolve, reject) {
        reject({ code: 1, message: 'denied' });
      }
    }
  });
  const failureResult = await failure.requestCurrentPosition();
  assert.strictEqual(failureResult.ok, false, 'browser error must resolve as a failed result');
  assert.strictEqual(failureResult.reason, 'error', 'browser error reason must be explicit');

  const calls = [];
  const focused = await success.focusCurrentUser({
    setBusy(value) { calls.push(['busy', value]); },
    mapAdapter: {
      focusUserLocation(point) { calls.push(['focus', point]); }
    },
    onSuccess(point) { calls.push(['success', point]); }
  });
  assert.strictEqual(focused.ok, true, 'focusCurrentUser must return the geolocation result');
  assert.deepStrictEqual(calls[0], ['busy', true], 'focusCurrentUser must set busy before requesting');
  assert.deepStrictEqual(calls[1], ['busy', false], 'focusCurrentUser must clear busy after requesting');
  assert.strictEqual(calls[2][0], 'focus', 'focusCurrentUser must call the page map adapter');
  assert.strictEqual(calls[3][0], 'success', 'focusCurrentUser must call success handler');

  const passengerHtml = fs.readFileSync(path.join(__dirname, '..', 'passenger.html'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const indexLogic = fs.readFileSync(path.join(__dirname, '..', 'index-logic.js'), 'utf8');
  const checkTicketHtml = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

  assert(passengerHtml.includes('user-location-center.js'), 'Passenger must load user-location-center');
  assert(indexHtml.includes('user-location-center.js'), 'Index must load user-location-center');
  assert(checkTicketHtml.includes('user-location-center.js'), 'Check Ticket must load user-location-center');
  assert(indexLogic.includes('SLTransitUserLocation.requestCurrentPosition'), 'Index GPS should use shared center');
  assert(checkTicketHtml.includes('SLTransitUserLocation.requestCurrentPosition'), 'Check Ticket locate button should use shared center');
  assert(!passengerHtml.includes('navigator.geolocation.getCurrentPosition'), 'Passenger must not call geolocation directly');
  assert(!indexLogic.includes('navigator.geolocation.getCurrentPosition'), 'Index one-shot location must not call geolocation directly');
  assert(!checkTicketHtml.includes('navigator.geolocation.getCurrentPosition'), 'Check Ticket locate button must not call geolocation directly');
  assert(checkTicketHtml.includes('navigator.geolocation.watchPosition'), 'Check Ticket tracking flow must keep watchPosition');

  console.log('user-location-center tests passed');
})();
