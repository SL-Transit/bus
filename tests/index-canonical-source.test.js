'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const indexLogic = fs.readFileSync(path.join(__dirname, '..', 'index-logic.js'), 'utf8');

assert(indexHtml.includes('index-logic.js'), 'index page must load index logic');
assert(indexHtml.includes('assets/map-marker-styles.css'), 'index page must use shared map marker styles');
assert(indexLogic.includes("projectId:'sl-transit-9464e'"), 'index must use the current Firebase project');
assert(indexLogic.includes("db.ref('data/erpDataCenter/stops')"), 'index must read canonical ERP stops');
assert(indexLogic.includes("db.ref('data/erpDataCenter/workbookSource/routeFareRows')"), 'index must read canonical workbook fare rows');
assert(indexLogic.includes("db.ref('publishedSchedule/mapView')"), 'index must read ERP map route data');
assert(indexLogic.includes("db.ref('data/erpDataCenter/serviceGroups')"), 'index must read canonical service groups');
assert(indexLogic.includes('serviceGroupId'), 'index route cards must group fare rows by service group');
assert(indexLogic.includes('INDEX_SERVICE_GROUP_LABELS'), 'index must render the five canonical service groups');
assert((indexLogic.match(/makeRow\(/g) || []).length >= 5, 'index must construct exactly five passenger route rows');
assert(indexLogic.includes('rows.push(makeRow'), 'index must append newly added service groups as new rows');
assert(indexLogic.includes('makeMainRow'), 'index main route rows must show destination names instead of internal direction labels');
assert(indexLogic.includes('INDEX_RECOMMENDED_MAIN_STOPS'), 'index main route rows must use the recommended stop set');
assert(indexLogic.includes('mainRow1=mainRow1.slice(0,2)'), 'index first main row must cap at two stops');
assert(indexLogic.includes('mainRow2=mainRow2.slice(0,3)'), 'index second main row must cap at three stops');
assert(indexLogic.includes('var originOrder=stopOrder(stop.name)'), 'index must derive the origin order from the canonical stop list');
assert(indexLogic.includes('color:var(--navy);font-weight:600'), 'index secondary stop text must remain dark and readable');
assert(indexLogic.includes('Number(mapStop.displayOrder)+1'), 'index must normalize zero-based map stop order');
assert(indexLogic.includes('var INDEX_OWNER_STOP_ORDER'), 'index must use owner-approved stop order');
assert(indexLogic.includes('if(!mainRow1.length)'), 'index must not render an empty first main route row');
assert(indexLogic.includes('readIndexValue'), 'index Firebase reads must fail fast on network timeout');
assert(indexLogic.includes('var gpsTimeout'), 'index GPS must not remain pending forever');
assert(indexLogic.includes('workbookOrder'), 'index stop order must remain workbook-driven');
assert(indexLogic.includes('s.icon'), 'index marker icon must come from ERP stop data');
assert(indexLogic.includes('class="map-stop-icon"'), 'index must render the shared stop icon class');
assert(indexLogic.includes('class="map-stop-label"'), 'index must render the shared stop label class');
assert(!indexLogic.includes('bus-booking-1d68c'), 'index must not use the legacy Firebase project');
assert(!indexLogic.includes("db.ref('routeData/stops')"), 'index must not read legacy routeData stops');

console.log('index canonical source contract ok');
