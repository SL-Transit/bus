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
    route_a_b: { id: 'route_a_b', groupId: 'main', fromStopKey: 'a', toStopKey: 'b', isActive: true }
  },
  trips: {
    trip_0800: { id: 'trip_0800', routeId: 'route_a_b', departTime: '08:00', bookingEnabled: true },
    trip_0900: { id: 'trip_0900', routeId: 'route_a_b', departTime: '09:00', bookingEnabled: false }
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
    trip_0900: { tripId: 'trip_0900', closedStops: ['__route__'] }
  }
};

const view = erp.catalogView(catalog);
if (view.version !== 'test-v1') throw new Error('version not preserved');

const routes = view.settingsRoutes;
if (!routes.main || routes.main.routes.length !== 1) throw new Error('route group missing');
const route = routes.main.routes[0];
if (route.from !== 'A' || route.to !== 'B') throw new Error('stop labels not resolved');
if (route.price !== 55) throw new Error('fare not mapped');
if (route.times.join(',') !== '08:00,09:00') throw new Error('times not mapped');
if (route.disabledTimes.indexOf('09:00') === -1) throw new Error('closed trip not disabled');
if (route.capacityByTime['08:00'] !== 12) throw new Error('capacity not mapped');
if (!route.scheduleMeta['08:00'] || route.scheduleMeta['08:00'].tripId !== 'trip_0800') throw new Error('trip identity missing');

const routeData = view.routeData;
if (!routeData.stops.a || routeData.stops.a.name !== 'A') throw new Error('stops not mapped');
if (!routeData.queues['1'] || !routeData.queues['1'].trips['1']) throw new Error('queue stopTimes not mapped');

console.log('erp-engine catalog adapter ok');
