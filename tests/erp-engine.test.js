const erp = require('../erp-engine.js');

const catalog = {
  version: 'test-v1',
  stops: {
    a: { nameTh: 'A', lat: 13.1, lng: 101.1, order: 1 },
    b: { nameTh: 'B', lat: 13.2, lng: 101.2, order: 2 }
  },
  routeGroups: {
    main: { id: 'main', name: 'Main', connectionType: 'direct' }
  },
  routes: {
    route_a_b: { id: 'route_a_b', groupId: 'main', fromStopKey: 'a', toStopKey: 'b', isActive: true },
    route_b_c: { id: 'route_b_c', groupId: 'main', from: 'B', to: 'C', isActive: true }
  },
  trips: {
    trip_0800: { id: 'trip_0800', routeId: 'route_a_b', departTime: '08:00', bookingEnabled: true },
    trip_0900: { id: 'trip_0900', routeId: 'route_a_b', departTime: '09:00', bookingEnabled: false },
    trip_1000: { id: 'trip_1000', routeId: 'route_a_b', departTime: '10:00', bookingEnabled: true },
    trip_1020: { id: 'trip_1020', routeId: 'route_b_c', departTime: '10:20', bookingEnabled: true },
    trip_1120: { id: 'trip_1120', routeId: 'route_b_c', departTime: '11:20', bookingEnabled: false }
  },
  stopTimes: {
    trip_0800: {
      id: 'trip_0800',
      queueNo: 1,
      tripNo: '1',
      routeKey: 'a_b',
      routeNameTh: 'A-B',
      departTime: '08:00',
      stops: [
        { stopKey: 'a', stopTh: 'A', time: '08:00' },
        { stopKey: 'b', stopTh: 'B', time: '08:30' }
      ]
    }
  },
  fares: {
    route_a_b: { routeId: 'route_a_b', amount: 55, currency: 'THB' }
  },
  capacities: {
    trip_0800: { tripId: 'trip_0800', seats: 12 }
  },
  closures: {
    trip_0900: { tripId: 'trip_0900', closedStops: ['__route__'] },
    trip_1000: { tripId: 'trip_1000', closedStops: ['__route__'] }
  }
};

const view = erp.catalogView(catalog);
if (view.version !== 'test-v1') throw new Error('version not preserved');

const routes = view.settingsRoutes;
if (!routes.main || routes.main.routes.length !== 2) throw new Error('route group missing');
const route = routes.main.routes[0];
if (route.from !== 'A' || route.to !== 'B') throw new Error('stop labels not resolved');
if (route.price !== 55) throw new Error('fare not mapped');
if (route.times.join(',') !== '08:00,09:00,10:00') throw new Error('times not mapped');
if (route.disabledTimes.indexOf('09:00') === -1) throw new Error('closed trip not disabled');
if (route.disabledTimes.indexOf('10:00') === -1) throw new Error('closure trip not disabled');
if (route.capacityByTime['08:00'] !== 12) throw new Error('capacity not mapped');
if (!route.scheduleMeta['08:00'] || route.scheduleMeta['08:00'].tripId !== 'trip_0800') throw new Error('trip identity missing');

const routeData = view.routeData;
if (!routeData.stops.a || routeData.stops.a.name !== 'A') throw new Error('stops not mapped');
if (!routeData.queues['1'] || !routeData.queues['1'].trips['1']) throw new Error('queue stopTimes not mapped');

const bookingContext = erp.bookingContext(catalog, 'A', 'B', '08:00');
if (!bookingContext) throw new Error('booking context missing');
if (bookingContext.routeId !== 'route_a_b') throw new Error('booking routeId missing');
if (bookingContext.tripId !== 'trip_0800') throw new Error('booking tripId missing');
if (bookingContext.fare !== 55) throw new Error('booking fare missing');
if (bookingContext.capacity !== 12) throw new Error('booking capacity missing');
if (bookingContext.closed) throw new Error('open trip marked closed');

const closedContext = erp.bookingContext(catalog, 'A', 'B', '09:00');
if (!closedContext || !closedContext.closed) throw new Error('closed booking context missing');

const byIds = erp.routeTripContext(catalog, 'route_a_b', 'trip_0800', '08:00');
if (!byIds || byIds.routeId !== 'route_a_b' || byIds.tripId !== 'trip_0800') throw new Error('route/trip context missing');
if (byIds.fare !== 55 || byIds.capacity !== 12) throw new Error('route/trip context fare or capacity missing');

const activeTimes = erp.routeTimes(catalog, 'A', 'B');
if (!activeTimes || activeTimes.join(',') !== '08:00') throw new Error('active route times missing');
const allTimes = erp.routeTimes(catalog, 'A', 'B', true);
if (!allTimes || allTimes.join(',') !== '08:00,09:00,10:00') throw new Error('all route times missing');
const disabledTimes = erp.routeDisabledTimes(catalog, 'A', 'B');
if (!disabledTimes || disabledTimes.join(',') !== '09:00,10:00') throw new Error('disabled route times missing');

const destTimes = erp.routeTimesByDestination(catalog, 'C', 'B');
if (!destTimes || destTimes.join(',') !== '10:20') throw new Error('destination route times missing');
const destAllTimes = erp.routeTimesByDestination(catalog, 'C', '', true);
if (!destAllTimes || destAllTimes.join(',') !== '10:20,11:20') throw new Error('all destination route times missing');

const canonicalStops = [
  '\u0e09\u0e30\u0e40\u0e0a\u0e34\u0e07\u0e40\u0e17\u0e23\u0e32',
  '\u0e1e\u0e19\u0e21\u0e2a\u0e32\u0e23\u0e04\u0e32\u0e21',
  '\u0e17\u0e48\u0e32\u0e23\u0e16\u0e2a\u0e19\u0e32\u0e21\u0e0a\u0e31\u0e22\u0e40\u0e02\u0e15',
  '\u0e01\u0e21.1',
  '\u0e01\u0e21.7',
  '\u0e2b\u0e49\u0e27\u0e22\u0e42\u0e2a\u0e21',
  '\u0e17\u0e48\u0e32\u0e15\u0e30\u0e40\u0e01\u0e35\u0e22\u0e1a',
  '\u0e2b\u0e19\u0e2d\u0e07\u0e04\u0e2d\u0e01',
  '\u0e04\u0e25\u0e2d\u0e07\u0e15\u0e30\u0e40\u0e04\u0e35\u0e22\u0e19',
  '\u0e2b\u0e19\u0e2d\u0e07\u0e40\u0e23\u0e37\u0e2d',
  '\u0e44\u0e1e\u0e23\u0e08\u0e34\u0e15',
  '\u0e17\u0e38\u0e48\u0e07\u0e01\u0e1a\u0e34\u0e19\u0e17\u0e23\u0e4c',
  '\u0e2a\u0e35\u0e48\u0e41\u0e22\u0e01\u0e42\u0e04\u0e19\u0e21',
  '\u0e27\u0e31\u0e07\u0e19\u0e49\u0e33\u0e40\u0e22\u0e47\u0e19',
  '\u0e04\u0e25\u0e2d\u0e07\u0e2b\u0e32\u0e14'
];
const canonicalOrder = canonicalStops.map((name) => erp.stopOrderValue(name));
if (canonicalOrder.join(',') !== '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15') throw new Error('canonical stop order mismatch');
if (erp.stopOrderValue('\u0e01\u0e21.10', 999) !== 999) throw new Error('km10 must not match km1');

console.log('erp-engine catalog adapter ok');
