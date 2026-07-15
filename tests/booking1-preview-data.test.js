const assert = require('assert');
const fs = require('fs');
const path = require('path');

const booking1 = fs.readFileSync(path.join(__dirname, '..', 'booking1.html'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '..', 'booking1-preview-adapter.js'), 'utf8');
const bridge = fs.readFileSync(path.join(__dirname, '..', 'booking-bridge.js'), 'utf8');
const pos = fs.readFileSync(path.join(__dirname, '..', 'booking-pos.js'), 'utf8');
const calculator = fs.readFileSync(path.join(__dirname, '..', 'erp-calculator-center.js'), 'utf8');

assert(bridge.includes("var PREVIEW_BASE_PATH = 'publishedSchedule'"), 'Booking1 bridge must use publishedSchedule');
assert(bridge.includes(".child('originOptions').once('value')"), 'Booking1 must read originOptions as lightweight initial data');
assert(bridge.includes(".child('destinationOptionsByOrigin').once('value')"), 'Booking1 must read destinationOptionsByOrigin as lightweight initial data');
assert(bridge.includes(".child('pairs').child(storageKey).once('value')"), 'Booking1 must lazy-load only the selected pair');
assert(!/db\.ref\(['"]publishedSchedule['"]\)\.once\s*\(/.test(bridge + booking1), 'Booking1 must not once-read full publishedSchedule');
assert(!/db\.ref\(['"]publishedSchedule['"]\)\.on\s*\(/.test(bridge + booking1), 'Booking1 must not subscribe to full publishedSchedule');
assert(!bridge.includes("db.ref('routeData')"), 'Booking1 bridge must not read legacy routeData');
assert(!bridge.includes('SLTransitCatalog.loadPublished'), 'Booking1 bridge must not load legacy publishedCatalog');
assert(!bridge.includes('LEG2_DEST'), 'Booking1 bridge must not use static leg2 destination/fare table');
assert(!bridge.includes('TRANSFER_BUFFER'), 'Booking1 bridge must not use static transfer buffers');
assert(!bridge.includes('|| 55'), 'Booking1 bridge must not hardcode 55-baht fare fallback');
assert(booking1.includes('booking-availability-center.js'), 'Booking1 must load Booking Availability Center');
assert(booking1.includes('fare-decision-center.js'), 'Booking1 must load Fare Decision Center');
assert(booking1.includes('erp-calculator-center.js'), 'Booking1 must load ERP Calculator Center for trip recommendation ordering');
assert(bridge.includes('SLTransitBookingAvailabilityCenter'), 'Booking1 bridge must ask Booking Availability Center for eligibility');
assert(bridge.includes('SLTransitFareDecisionCenter'), 'Booking1 bridge must ask Fare Decision Center for fares');
assert(bridge.includes('SLTransitCalculatorCenter.recommendedBookingTrips'), 'Booking1 bridge must ask ERP Calculator Center for recommended trip ordering');
assert(calculator.includes('function recommendedBookingTrips'), 'ERP Calculator Center must own Booking1 trip recommendation logic');
assert(bridge.includes('selectionAllowed: availabilityDecision.selectionAllowed === true'), 'Booking1 bridge must expose selectionAllowed separately from bookingAllowed');
assert(!bridge.includes('function _extractFare'), 'Booking1 bridge must not calculate fare locally');
assert(!bridge.includes('function _pairIsExternal'), 'Booking1 bridge must not decide external/reference status locally');

assert(booking1.includes('booking1-preview-adapter.js'), 'Booking1 must load the preview adapter');
assert(adapter.includes('SLBookingBridge.getBookableStops()'), 'Origin picker must use bridge originOptions');
assert(adapter.includes('SLBookingBridge.getDestinationOptions(state.originKey)'), 'Destination picker must use origin-scoped destinationOptionsByOrigin');
assert(adapter.includes('s.group || null'), 'Destination picker must render ERP-provided destination option groups');
assert(adapter.includes('stopPickerItemsHtml'), 'Destination picker must use grouped picker rendering');
assert(adapter.includes('esc(group)'), 'Destination group labels must come from ERP option.group');
assert(adapter.includes('SLBookingBridge.loadAvailableTrips'), 'Trip cards must lazy-load selected pair data');
assert(bridge.includes('Array.isArray(pair.connectionOptions)'), 'Booking1 bridge must read ERP connectionOptions for transfer-reference timetable rows');
assert(!adapter.includes('recommendedBookingTrips'), 'Booking1 adapter must not own recommendation logic');
assert(!adapter.includes('minutesFromTime'), 'Booking1 adapter must not compare trip times locally');
assert(adapter.includes('!trip.selectionAllowed'), 'Booking1 adapter must use selectionAllowed for the trip select button');
assert(adapter.includes('selected.bookingAllowed'), 'Booking1 adapter must still use bookingAllowed before payment/ticket creation');
assert(adapter.includes('selected.fareMissing'), 'Booking1 adapter must block/report missing fare contract');
assert(adapter.includes('selected.externalPaymentRequired'), 'Booking1 adapter must block external-pay fare collection');
assert(adapter.includes('No live vehicle tracking'), 'Booking1 adapter must expose schedule-only/no-live-tracking behavior');
assert(!adapter.includes('SLBookingCapacity.requestRouteContinue'), 'Booking1 adapter trip selection must not use legacy capacity continuation');
assert(!adapter.includes('= 55'), 'Booking1 adapter must not fabricate 55-baht fare');
assert(!adapter.includes("= '09:00'"), 'Booking1 adapter must not fabricate default 09:00 trips');
assert(!bridge.includes('.sort(function'), 'Booking1 bridge must preserve ERP option order instead of sorting locally');

assert(pos.includes('!global.SLBookingBridge.canCreateProductionBookings()'), 'POS must block production writes until preview is apply-ready');
assert(pos.includes('return Number(selected.fareAmount) || 0'), 'POS pricing must use selected ERP fareAmount');
assert(!pos.includes('SEGMENT_PRICE'), 'POS must not price Booking1 from legacy SEGMENT_PRICE');
assert(!pos.includes('bridge.getFare(originKey'), 'POS must not price Booking1 from legacy bridge fare');

console.log('booking1 preview data contract ok');
