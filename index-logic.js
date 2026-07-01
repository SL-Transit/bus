/* ════════════════════════════════════════════════════════
   index-logic.js  —  POS Logic สำหรับหน้า index2.html
   ────────────────────────────────────────────────────────
   Flow:
     index2.html (UI)
       → index-logic.js  (logic หน้า POS นี้)
         → catalog-engine.js + erp-engine.js  (ข้อมูลกลาง)
           → Firebase  (database)
   ════════════════════════════════════════════════════════ */
(function(){
'use strict';


/* ══════════════════════════════════════════
   STOPS DATA — fallback, Firebase overrides
══════════════════════════════════════════ */
var STOPS = [
  {name:'คลองหาด',       lat:13.453565, lng:102.299330, terminal:true,  key:'klonghat'},
  {name:'วังน้ำเย็น',     lat:13.460000, lng:102.170000,                 key:'wangnamyen'},
  {name:'สี่แยกโคนม',    lat:13.436666, lng:102.200895,                 key:'siyaekkhonom'},
  {name:'ทุ่งกบินทร์',    lat:13.439877, lng:102.083043,                 key:'thoengkabintr'},
  {name:'ไพรจิต',        lat:13.416310, lng:102.020767,                 key:'phaijit'},
  {name:'หนองเรือ',      lat:13.420494, lng:101.995365,                 key:'nongruea'},
  {name:'คลองตะเคียน',   lat:13.420264, lng:101.765445,                 key:'khlongtakien'},
  {name:'หนองคอก',      lat:13.381579, lng:101.708016,                 key:'nongkhok'},
  {name:'ท่าตะเกียบ',    lat:13.443342, lng:101.610222,                 key:'tatakiab'},
  {name:'ห้วยโสม',       lat:13.580000, lng:101.520000,                 key:'huaisom'},
  {name:'กม.7',          lat:13.620000, lng:101.480000,                 key:'km_7'},
  {name:'กม.1',          lat:13.648000, lng:101.447000,                 key:'km_1'},
  {name:'สนามชัยเขต',   lat:13.659022, lng:101.437482, terminal:true,  key:'sanamchai'},
  {name:'พนมสารคาม',    lat:13.745082, lng:101.355993,                 key:'phanom'},
  {name:'ฉะเชิงเทรา',   lat:13.692477, lng:101.054105, terminal:true,  key:'chachoengsao'},
];

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
var selectedStop  = null;   /* ไม่มี default — รอ GPS */
var userPos       = null;
var mapReady      = false;
var stopsReady    = false;  /* Firebase โหลดเสร็จหรือยัง */
var pendingPos    = null;   /* GPS มาก่อน Firebase → รอ */
var nearestPinOverlay = null;
var userMarkerOverlay = null;

/* ── SVG_LOCATE icon ── */
var SVG_LOCATE = '<img src="assets/icon-location.png" width="18" height="18" style="object-fit:contain;flex-shrink:0" alt=""> <!-- (icon-102) -->';

/* ══════════════════════════════════════════
   STOP_ROUTES — 5 ตัวเลือกต่อป้าย
   catalog/ERP จะ override เมื่อโหลดเสร็จ
══════════════════════════════════════════ */
function _commonRoutes(from){
  return [
    {dest:from+' - เอกมัย / หมอชิต / มีนบุรี / รังสิต',                    tag:'กรุงเทพฯ'},
    {dest:from+' - ชลบุรี / อ่าวอุดม / แหลมฉบัง / พัทยา / สัตหีบ / ระยอง', tag:'ตะวันออก'},
    {dest:from+' - รถไฟ', sub:'(รถบางเที่ยวอาจจะไม่ได้เข้าสถานีรถไฟ)'},
  ];
}
var STOP_ROUTES=(function(){
  var R={};
  R['คลองหาด']=[{dest:'คลองหาด - หนองคอก / สนามชัยเขต',tag:'ขาไป'},{dest:'คลองหาด - พนมสารคาม / ฉะเชิงเทรา',tag:'ขาไป'}].concat(_commonRoutes('คลองหาด'));
  ['วังน้ำเย็น','สี่แยกโคนม','ทุ่งกบินทร์','ไพรจิต','หนองเรือ','คลองตะเคียน'].forEach(function(s){
    R[s]=[{dest:s+' - สนามชัยเขต / พนมสารคาม / ฉะเชิงเทรา',tag:'ขาไป'},{dest:s+' - คลองหาด',tag:'ขากลับ'}].concat(_commonRoutes(s));
  });
  R['หนองคอก']=[{dest:'หนองคอก - สนามชัยเขต / พนมสารคาม / ฉะเชิงเทรา',tag:'ขาไป'},{dest:'หนองคอก - สี่แยกโคนม / ท่าตะเกียบ / คลองหาด',tag:'ขากลับ'}].concat(_commonRoutes('หนองคอก'));
  ['ท่าตะเกียบ','ห้วยโสม','กม.7','กม.1'].forEach(function(s){
    R[s]=[{dest:s+' - สนามชัยเขต / พนมสารคาม / ฉะเชิงเทรา',tag:'ขาไป'},{dest:s+' - หนองคอก / คลองหาด',tag:'ขากลับ'}].concat(_commonRoutes(s));
  });
  R['สนามชัยเขต']=[{dest:'สนามชัยเขต - พนมสารคาม / ฉะเชิงเทรา',tag:'ขาไป'},{dest:'สนามชัยเขต - หนองคอก / คลองหาด',tag:'ขากลับ'}].concat(_commonRoutes('สนามชัยเขต'));
  R['สนามชัยเขต'][4].sub='(รถบางเที่ยวอาจจะไม่ได้เข้าสถานีรถไฟ)';
  R['พนมสารคาม']=[{dest:'พนมสารคาม - ฉะเชิงเทรา',tag:'ขาไป'},{dest:'พนมสารคาม - สนามชัยเขต / หนองคอก / คลองหาด',tag:'ขากลับ'}].concat(_commonRoutes('พนมสารคาม'));
  R['ฉะเชิงเทรา']=[{dest:'ฉะเชิงเทรา - พนมสารคาม / สนามชัยเขต',tag:'ขาไป'},{dest:'ฉะเชิงเทรา - หนองคอก / คลองหาด',tag:'ขาไป'}].concat(_commonRoutes('ฉะเชิงเทรา'));
  return R;
})();

function getFallbackRoutesForStop(stop){
  var name=(stop&&stop.name)||'';
  if(STOP_ROUTES[name]) return STOP_ROUTES[name];
  var keys=Object.keys(STOP_ROUTES);
  for(var i=0;i<keys.length;i++){
    if(name.indexOf(keys[i])!==-1||keys[i].indexOf(name)!==-1) return STOP_ROUTES[keys[i]];
  }
  return STOP_ROUTES['สนามชัยเขต']||[];
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function escHtml(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function distKm(a,b){
  var R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
  var x=Math.sin(dLat/2)*Math.sin(dLat/2)+
        Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*
        Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
/* ──────────────────────────────────────────
   ระยะสูงสุดที่ถือว่า "ในพื้นที่" (km)
   > MAX_ZONE_KM → นอกพื้นที่ → fallback ป้าย ฉะเชิงเทรา
   ────────────────────────────────────────── */
var MAX_ZONE_KM = 50; /* (ปรับระยะได้ที่นี่) */

function findNearest(pos){
  var best=null,bestD=Infinity;
  STOPS.forEach(function(s){
    var d=distKm(pos,{lat:s.lat,lng:s.lng});
    if(d<bestD){bestD=d;best=s;}
  });

  /* นอกพื้นที่ → fallback ป้ายฉะเชิงเทรา */
  if(bestD > MAX_ZONE_KM){
    var fallback=null;
    for(var i=0;i<STOPS.length;i++){
      if(STOPS[i].key==='chachoengsao'){fallback=STOPS[i];break;}
    }
    if(!fallback) fallback=STOPS[STOPS.length-1];
    return {stop:fallback,dist:bestD,outOfZone:true};
  }

  return {stop:best,dist:bestD,outOfZone:false};
}

/* ══════════════════════════════════════════
   LOADING STATE — แสดงระหว่างรอ GPS
══════════════════════════════════════════ */
function setNearestLoading(){
  var nameEl=document.getElementById('nearest-name');
  var subEl=document.getElementById('nearest-sub');
  if(nameEl) nameEl.textContent='กำลังระบุตำแหน่ง...';
  if(subEl)  subEl.textContent='รอสักครู่';
  var list=document.getElementById('route-list');
  if(list) list.innerHTML=
    '<div class="skeleton" style="height:68px;border-radius:14px"></div>'+
    '<div class="skeleton" style="height:68px;border-radius:14px;opacity:0.6;margin-top:8px"></div>'+
    '<div class="skeleton" style="height:68px;border-radius:14px;opacity:0.4;margin-top:8px"></div>';
}

function setNearestError(msg){
  var nameEl=document.getElementById('nearest-name');
  var subEl=document.getElementById('nearest-sub');
  if(nameEl) nameEl.textContent='ไม่สามารถระบุตำแหน่งได้';
  if(subEl)  subEl.textContent=msg||'กรุณาเลือกป้ายด้วยตนเอง';
  var list=document.getElementById('route-list');
  if(list) list.innerHTML=
    '<div class="routes-empty">'+
      '<div class="empty-icon">📍</div>'+
      'กรุณากด <b>"เลือกป้ายเอง"</b><br>เพื่อเลือกป้ายต้นทางของคุณ'+
    '</div>';
}

/* ══════════════════════════════════════════
   LONGDO MAP
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   OPENSTREETMAP (Leaflet.js)
   Flow: DOM ready → initMap() → renderStopMarkers()
         → onPositionResolved() → focusNearest()
══════════════════════════════════════════ */
var mapObj   = null;
var mapReady = false;
var _stopMarkers = [];
var nearestPinOverlay = null;
var userMarkerOverlay = null;

function initMap(){
  var el = document.getElementById('sl-map');
  if(!el||!window.L) return;

  /* สร้างแผนที่ OpenStreetMap */
  mapObj = L.map('sl-map', {
    center: [13.659022, 101.437482],
    zoom: 10,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(mapObj);

  mapReady = true;
  renderStopMarkers();
  if(selectedStop) highlightStop(selectedStop);
  if(userPos)      placeUserMarker(userPos);
}

/* รอ Leaflet โหลด + DOM พร้อม */
function waitLeaflet(){
  if(window.L && typeof L.map === 'function'){
    initMap(); return;
  }
  var attempt=0;
  var t=setInterval(function(){
    attempt++;
    if(window.L && typeof L.map === 'function'){
      clearInterval(t); initMap(); return;
    }
    if(attempt>=80){
      clearInterval(t);
      console.warn('[SL-Index] Leaflet timeout');
      var wrap=document.querySelector('.map-wrap');
      if(wrap) wrap.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8aa;font-size:13px">ไม่สามารถโหลดแผนที่ได้</div>';
    }
  },150);
}

function renderStopMarkers(){
  if(!mapReady||!mapObj) return;
  /* ลบ markers เก่า */
  _stopMarkers.forEach(function(m){ mapObj.removeLayer(m); });
  _stopMarkers = [];

  STOPS.forEach(function(s){
    if(!s.lat||!s.lng) return;
    var isTerminal = s.terminal;
    var icon = L.divIcon({
      className: '',
      html: '<div class="map-stop-dot'+(isTerminal?' terminal':'')+'" title="'+s.name+'"></div>',
      iconSize: [16,16], iconAnchor: [8,8]
    });
    var m = L.marker([s.lat,s.lng],{icon:icon,title:s.name});
    m.addTo(mapObj);
    _stopMarkers.push(m);
  });
}

function highlightStop(stop){
  if(!stop) return;
  /* ลบ pin เก่า */
  if(nearestPinOverlay){ mapObj&&mapObj.removeLayer(nearestPinOverlay); nearestPinOverlay=null; }
  if(!mapReady||!mapObj) return;

  var icon = L.divIcon({
    className: '',
    html: '<div class="map-nearest-pin">'+
            '<div class="map-nearest-bubble">'+escHtml(stop.name)+'</div>'+
            '<div class="map-nearest-icon-pin">'+
              '<img src="assets/icon-bus-pin-blue.png" width="22" height="22" style="object-fit:contain">'+
            '</div>'+
            '<div style="font-size:10px;color:#fff;font-weight:700;text-align:center;margin-top:1px;text-shadow:0 1px 3px rgba(0,0,0,0.6)">ป้ายใกล้ฉัน</div>'+
          '</div>',
    iconSize: [110,72], iconAnchor: [55,72]
  });
  nearestPinOverlay = L.marker([stop.lat,stop.lng],{icon:icon,zIndexOffset:1000});
  nearestPinOverlay.addTo(mapObj);

  /* pan ไปป้ายใกล้สุด */
  /* ถ้ามี userPos → fitBounds ให้เห็นทั้งคู่ */
  if(userPos){
    fitToUserAndStop([userPos.lat,userPos.lng],[stop.lat,stop.lng]);
  } else {
    focusMap({lat:stop.lat,lng:stop.lng}, 13, true);
  }
}

function focusMap(point, zoomLevel, animate){
  if(!mapObj||!point) return;
  var latlng = [point.lat, point.lng||point.lon];
  if(animate){
    mapObj.flyTo(latlng, zoomLevel||13, {duration:0.8});
  } else {
    mapObj.setView(latlng, zoomLevel||13);
  }
}

/* ── ข้อ 3: zoom ให้เห็นทั้งผู้ใช้และป้ายที่ใกล้ที่สุด ── */
function fitToUserAndStop(userLatLng, stopLatLng){
  if(!mapObj) return;
  try{
    var bounds = L.latLngBounds([userLatLng, stopLatLng]);
    mapObj.fitBounds(bounds, {padding:[60,60], maxZoom:15, animate:true});
  }catch(e){
    mapObj.flyTo(userLatLng, 14, {duration:0.8});
  }
}

var _progMapUntil = 0;

function placeUserMarker(pos){
  if(!pos) return;
  var latlng = [pos.lat, pos.lng||pos.lon];

  if(!userMarkerOverlay){
    var icon = L.divIcon({
      className: '',
      html: '<div class="map-user-dot"></div>',
      iconSize: [18,18], iconAnchor: [9,9]
    });
    if(mapReady&&mapObj){
      userMarkerOverlay = L.marker(latlng,{icon:icon,zIndexOffset:900});
      userMarkerOverlay.addTo(mapObj);
    }
  } else {
    try{ userMarkerOverlay.setLatLng(latlng); }catch(e){}
  }
}
/* ══════════════════════════════════════════
   SELECT STOP + RENDER ROUTES
══════════════════════════════════════════ */
function selectStop(stop,distKmVal,outOfZone){
  selectedStop=stop;
  var nameEl=document.getElementById('nearest-name');
  var subEl=document.getElementById('nearest-sub');
  if(nameEl) nameEl.textContent=stop.name;
  if(subEl){
    if(outOfZone){
      subEl.textContent='ท่านอยู่นอกพื้นที่ · แสดงเส้นทางจากฉะเชิงเทรา';
    } else if(distKmVal!=null){
      subEl.textContent='ป้ายใกล้คุณที่สุด · '+(distKmVal<1?Math.round(distKmVal*1000)+'ม.':distKmVal.toFixed(1)+'กม.');
    } else {
      subEl.textContent='แตะเพื่อเปลี่ยนป้าย';
    }
  }
  var btn=document.getElementById('locate-btn');
  if(btn&&distKmVal!=null){
    btn.innerHTML=SVG_LOCATE+' ตำแหน่งของฉัน ✓';
    btn.style.borderColor='var(--teal)';
  }
  highlightStop(stop);
  renderRouteList(stop);
}

function getCatalogRoutesForStop(stop){
  /* ปิดไว้ก่อน — รอ catalog format ตรงกับ logic 5 ตัวเลือก
     เมื่อ ERP พร้อม ค่อยเปิด block ด้านล่าง */
  return null;

  /* --- (reserved for future ERP integration) ---
  if(!_catalog||!window.SLTransitERP) return null;
  ... */
}

function renderRouteList(stop){
  var list=document.getElementById('route-list');
  if(!list) return;
  var routes=getCatalogRoutesForStop(stop);
  if(!routes||!routes.length) routes=getFallbackRoutesForStop(stop);
  if(!routes||!routes.length) routes=[];
  if(!routes.length){
    list.innerHTML='<div class="routes-empty"><div class="empty-icon">🔎</div>ไม่พบเส้นทางในระบบ<br><small>กรุณารอข้อมูลโหลด หรือเลือกป้ายใหม่</small></div>';
    return;
  }
  list.innerHTML=routes.map(function(r){
    return '<a href="booking.html" class="route-row">'+
      '<div class="route-bus-icon"><img src="assets/icon-bus-pin-teal.png" width="28" height="28" style="object-fit:contain" alt=""></div>'+
      '<div style="flex:1;min-width:0">'+
        '<div class="route-name">'+escHtml(r.dest||r.name||'')+'</div>'+
        (r.sub?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+escHtml(r.sub)+'</div>':'')+
      '</div>'+
      '<div class="route-cta">เลือกเที่ยว ›</div>'+
    '</a>';
  }).join('');
}

/* ══════════════════════════════════════════
   GPS → on position resolved, find nearest
══════════════════════════════════════════ */
function onPositionResolved(lat,lng,source){
  userPos={lat:lat,lng:lng};
  placeUserMarker(userPos);

  /* ถ้ามีป้ายอยู่แล้ว → fitBounds ให้เห็นทั้งผู้ใช้และป้าย */
  if(mapReady&&mapObj){
    if(selectedStop){
      fitToUserAndStop([lat,lng],[selectedStop.lat,selectedStop.lng]);
    } else {
      focusMap({lat:lat,lng:lng}, 14, true);
    }
  }

  if(!stopsReady){
    pendingPos={lat:lat,lng:lng};
    return;
  }

  var res=findNearest(userPos);
  if(res.stop) selectStop(res.stop,res.dist,res.outOfZone);
}

/* GPS state */
var _gpsSettled=false;

/* ── เซ็ต stopsReady หลัง 3 วินาที ถ้า Firebase ยังไม่โหลด ──
   ป้องกัน pendingPos ค้างรอตลอดไป */
setTimeout(function(){
  if(!stopsReady){
    stopsReady=true;
    if(pendingPos){
      var res=findNearest(pendingPos);
      pendingPos=null;
      if(res.stop) selectStop(res.stop,res.dist,res.outOfZone);
    }
    if(mapReady) renderStopMarkers();
  }
},3000);

function tryGPS(){
  if(!navigator.geolocation){
    tryIPGeo();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function(pos){
      if(_gpsSettled) return;
      _gpsSettled=true;
      onPositionResolved(pos.coords.latitude,pos.coords.longitude,'gps');
    },
    function(err){
      if(_gpsSettled) return;
      _gpsSettled=true;
      tryIPGeo();
    },
    {timeout:6000,enableHighAccuracy:false,maximumAge:30000}
  );
}

/* ── IP Geolocation fallback ── */
function tryIPGeo(){
  var ctrl = null;
  var timer = null;
  try{
    ctrl = new AbortController();
    timer = setTimeout(function(){ ctrl.abort(); }, 6000);
  }catch(e){ ctrl = null; }

  var fetchOpts = ctrl ? {signal:ctrl.signal} : {};

  fetch('https://ipapi.co/json/', fetchOpts)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(timer) clearTimeout(timer);
      if(!d||!d.latitude||!d.longitude){ throw new Error('no data'); }
      var lat=Number(d.latitude), lng=Number(d.longitude);
      var centerLat=13.5, centerLng=101.5;
      var roughDist=Math.sqrt(Math.pow(lat-centerLat,2)+Math.pow(lng-centerLng,2));
      if(roughDist>3){
        setNearestError('ไม่พบตำแหน่งในพื้นที่ให้บริการ');
        return;
      }
      onPositionResolved(lat,lng,'ip');
      var subEl=document.getElementById('nearest-sub');
      if(subEl&&selectedStop){
        subEl.textContent+=' (ประมาณจาก IP)';
      }
    })
    .catch(function(){
      if(timer) clearTimeout(timer);
      setNearestError('ไม่สามารถระบุตำแหน่งได้');
    });
}

function showLocationNotice(message){
  var subEl=document.getElementById('nearest-sub');
  if(subEl) subEl.textContent=message;
}

/* ── ปุ่ม "ใช้ตำแหน่งของฉัน" — ขอ GPS ใหม่อีกครั้ง ── */
window.locateUser=function(){
  if(!navigator.geolocation){
    showLocationNotice('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง');
    return;
  }
  var btn=document.getElementById('locate-btn');
  btn.classList.add('loading');
  btn.innerHTML=SVG_LOCATE+' กำลังระบุ...';
  _gpsSettled=false;
  navigator.geolocation.getCurrentPosition(
    function(pos){
      btn.classList.remove('loading');
      btn.innerHTML=SVG_LOCATE+' ตำแหน่งของฉัน ✓';
      btn.style.borderColor='var(--teal)';
      _gpsSettled=true;
      var lat=pos.coords.latitude, lng=pos.coords.longitude;
      /* pan smooth ไปหาผู้ใช้ทันที ก่อน findNearest */
      placeUserMarker({lat:lat,lng:lng});
      focusMap({lat:lat,lng:lng}, 14, true, true);
      onPositionResolved(lat,lng,'gps');
    },
    function(err){
      btn.classList.remove('loading');
      btn.innerHTML=SVG_LOCATE+' ใช้ตำแหน่งของฉัน';
      btn.style.borderColor='';
      var msg=(err&&err.code===1)
        ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS ในเบราว์เซอร์'
        : 'ไม่สามารถระบุตำแหน่งได้ กรุณาลองอีกครั้ง';
      showLocationNotice(msg);
    },
    {timeout:10000,enableHighAccuracy:true,maximumAge:0}
  );
};

/* ══════════════════════════════════════════
   FIREBASE — โหลดป้ายและ routes
══════════════════════════════════════════ */
if(typeof firebase!=="undefined"){
firebase.initializeApp({
  apiKey:"AIzaSyCzzJWvYLmm84anAnVKVTPTHeaUxT3X-pw",
  authDomain:"bus-booking-1d68c.firebaseapp.com",
  databaseURL:"https://bus-booking-1d68c-default-rtdb.firebaseio.com",
  projectId:"bus-booking-1d68c",storageBucket:"bus-booking-1d68c.firebasestorage.app",
  messagingSenderId:"481251007816",appId:"1:481251007816:web:d8554178d954e7de16e77d"
});
}
var db=firebase.database();

/* ══════════════════════════════════════════
   CATALOG DATA (ข้อมูลกลางจาก ERP)
   โหลดครั้งเดียว → ใช้ทั่วหน้า
══════════════════════════════════════════ */
var _catalog = null; /* เก็บ catalog ที่โหลดแล้ว */

function loadCatalog(){
  if(!window.SLTransitCatalog || typeof SLTransitCatalog.loadPublished !== 'function') return;
  SLTransitCatalog.loadPublished(db).then(function(catalog){
    if(!catalog) return;
    _catalog = catalog;
    console.log('[SL-Index] catalog loaded v'+(_catalog.version||'?'));
    /* ถ้า stop ถูก select ไปแล้วก่อน catalog โหลด → re-render routes */
    if(selectedStop) renderRouteList(selectedStop);
  }).catch(function(e){
    console.warn('[SL-Index] catalog load failed:', e&&e.message||e);
  });
}


db.ref('routeData/stops').once('value').then(function(snap){
  var val=snap.val();
  if(val){
    var fbStops=Object.keys(val).map(function(k){
      var s=val[k];
      return {
        name:s.stopNameTh||s.name||k,
        lat:Number(s.lat),lng:Number(s.lng||s.lon),
        terminal:s.stopType==='terminal'||!!s.terminal,
        routes:Array.isArray(s.routes)?s.routes:null
      };
    }).filter(function(s){return s.lat&&s.lng;});

    if(fbStops.length>=3){
      STOPS.splice(0,STOPS.length);
      fbStops.forEach(function(s){STOPS.push(s);});
      /* re-render map markers ถ้าแผนที่พร้อมแล้ว */
      if(mapReady) renderStopMarkers();
    }
  }

  stopsReady=true;

  /* ถ้า GPS มาก่อน → resolve ทันที */
  if(pendingPos){
    var res=findNearest(pendingPos);
    pendingPos=null;
    if(res.stop) selectStop(res.stop,res.dist,res.outOfZone);
  }

}).catch(function(){
  /* Firebase โหลดไม่ได้ — ใช้ STOPS พิกัดที่ฝังไว้ (ตำแหน่งป้าย) */
  stopsReady=true;
  if(mapReady) renderStopMarkers();
  if(pendingPos){
    var res=findNearest(pendingPos);
    pendingPos=null;
    if(res.stop) selectStop(res.stop,res.dist,res.outOfZone);
  }
});

/* ══════════════════════════════════════════
   ANNOUNCEMENT SLIDESHOW
══════════════════════════════════════════ */
var ANN = {
  items: [],
  cur: 0,
  timer: null,
  dur: 5000,       /* ms per slide */
  paused: false
};

var TYPE_COLOR = {
  info:   'rgba(11,29,58,0.75)',
  warn:   'rgba(120,70,0,0.80)',
  danger: 'rgba(120,10,10,0.82)',
};
var TYPE_TAG = {
  info:   'ประกาศ',
  warn:   '⚠️ แจ้งเตือน',
  danger: '🚨 ด่วน',
};

function annEscHtml(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function initSlideshow(items){
  if(!items||!items.length) return; /* ใช้ placeholder */
  ANN.items = items;
  ANN.cur   = 0;

  var slidesEl   = document.getElementById('ann-slides');
  var dotsEl     = document.getElementById('ann-dots');
  var progressEl = document.getElementById('ann-progress');
  var placeholder= document.getElementById('ann-placeholder');

  /* build slides */
  slidesEl.innerHTML = items.map(function(a, i){
    var type  = (a.type==='warn'||a.type==='danger') ? a.type : 'info';
    var color = TYPE_COLOR[type] || TYPE_COLOR.info;
    var tag   = TYPE_TAG[type]   || TYPE_TAG.info;
    var bgStyle = a.imageB64
      ? 'background-image:url('+a.imageB64+')'
      : 'background:linear-gradient(135deg,#0B1D3A,#0f2647)';
    return '<div class="ann-slide'+(i===0?' active':'')+'" id="ann-s-'+i+'">'+
      '<div class="ann-slide-bg" id="ann-bg-'+i+'" style="'+bgStyle+'"></div>'+
      '<div class="ann-slide-overlay" style="background:linear-gradient(to bottom,rgba(11,29,58,0.20) 0%,'+color+' 65%,rgba(11,29,58,0.95) 100%)"></div>'+
      '<div class="ann-slide-text">'+
        '<div class="ann-slide-tag"><span class="ann-slide-tag-dot"></span>'+annEscHtml(tag)+'</div>'+
        '<div class="ann-slide-title">'+annEscHtml(a.title||'')+'</div>'+
        (a.body?'<div class="ann-slide-body">'+annEscHtml(a.body)+'</div>':'')+
      '</div>'+
    '</div>';
  }).join('');

  /* build dots */
  dotsEl.innerHTML = items.map(function(_,i){
    return '<div class="ann-dot'+(i===0?' active':'')+'" onclick="annGoto('+i+')"></div>';
  }).join('');

  /* show */
  if(placeholder) placeholder.style.display='none';
  slidesEl.style.display   = 'flex';
  dotsEl.style.display     = 'flex';
  progressEl.style.display = 'block';

  annGoto(0);
}

function annGoto(idx){
  var items = ANN.items;
  if(!items.length) return;
  idx = ((idx % items.length) + items.length) % items.length;
  ANN.cur = idx;

  /* slides */
  var slidesEl = document.getElementById('ann-slides');
  if(slidesEl) slidesEl.style.transform = 'translateX(-'+idx*100+'%)';

  /* activate bg zoom on active slide */
  items.forEach(function(_,i){
    var el = document.getElementById('ann-s-'+i);
    if(el) el.classList.toggle('active', i===idx);
  });

  /* dots */
  var dots = document.querySelectorAll('.ann-dot');
  dots.forEach(function(d,i){ d.classList.toggle('active',i===idx); });

  /* progress bar restart */
  var fill = document.getElementById('ann-progress-fill');
  if(fill){
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth; /* reflow */
    fill.style.transition = 'width '+ANN.dur+'ms linear';
    fill.style.width = '100%';
  }

  /* auto advance */
  clearTimeout(ANN.timer);
  if(!ANN.paused){
    ANN.timer = setTimeout(function(){ annStep(1); }, ANN.dur);
  }
}

window.annStep = function(dir){
  annGoto(ANN.cur + dir);
};
window.annGoto = function(idx){
  annGoto(idx);
};

/* pause on touch hold */
(function(){
  var hero = document.getElementById('hero-section');
  if(!hero) return;
  var _pt = null;
  hero.addEventListener('pointerdown', function(){
    _pt = setTimeout(function(){
      ANN.paused = true;
      clearTimeout(ANN.timer);
      var fill=document.getElementById('ann-progress-fill');
      if(fill) fill.style.transitionDuration='0ms';
    }, 200);
  });
  hero.addEventListener('pointerup', function(){
    clearTimeout(_pt);
    if(ANN.paused){ ANN.paused=false; annGoto(ANN.cur); }
  });
  hero.addEventListener('pointerleave', function(){
    clearTimeout(_pt);
    if(ANN.paused){ ANN.paused=false; annGoto(ANN.cur); }
  });
})();

/* load from Firebase */
function loadAnnouncements(){
  var now = Date.now();
  db.ref('announcements').once('value').then(function(snap){
    var val = snap.val() || {};
    var list = Object.keys(val).map(function(k){
      var a = val[k] || {};
      return {
        id: k,
        title:    a.title   || '',
        body:     a.body    || '',
        type:     a.type    || 'info',
        active:   a.active  !== false,
        ts:       a.ts      || 0,
        imageB64: a.imageB64|| null,
        expiresAt:a.expiresAt||null
      };
    }).filter(function(a){
      return a.active && a.title && !(a.expiresAt && a.expiresAt < now);
    }).sort(function(a,b){ return b.ts - a.ts; });

    if(list.length) initSlideshow(list);
  }).catch(function(){ /* ใช้ placeholder */ });
}

/* ══════════════════════════════════════════
   เริ่ม GPS ทันที
══════════════════════════════════════════ */
function _startup(){
  setNearestLoading();
  loadAnnouncements();
  loadCatalog();
  waitLeaflet();
  tryGPS();
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', _startup);
} else {
  _startup();
}


/* ══════════════════════════════════════════
   DRAWER — เลือกป้ายเอง
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   DRAWER — เมนูหลัก
══════════════════════════════════════════ */
window.openMainMenuDrawer=function(){
  document.getElementById('main-menu-backdrop').classList.add('open');
  document.getElementById('main-menu-drawer').classList.add('open');
  document.body.style.overflow='hidden';
};
window.closeMainMenuDrawer=function(){
  document.getElementById('main-menu-backdrop').classList.remove('open');
  document.getElementById('main-menu-drawer').classList.remove('open');
  document.body.style.overflow='';
};
window.openStopDrawerFromMenu=function(e){
  if(e) e.preventDefault();
  window.closeMainMenuDrawer();
  window.openStopDrawer(null);
};

window.openStopDrawer=function(e){
  if(e) e.preventDefault();
  renderDrawerList();
  document.getElementById('stop-drawer-backdrop').classList.add('open');
  document.getElementById('stop-drawer').classList.add('open');
  document.body.style.overflow='hidden';
};
window.closeStopDrawer=function(){
  document.getElementById('stop-drawer-backdrop').classList.remove('open');
  document.getElementById('stop-drawer').classList.remove('open');
  document.body.style.overflow='';
};
window.toggleDrawer=function(){window.openMainMenuDrawer();};
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    window.closeMainMenuDrawer();
    window.closeStopDrawer();
  }
});

function renderDrawerList(){
  var list=document.getElementById('stop-drawer-list');
  if(!list) return;
  /* เรียงตามระยะห่างถ้ามี GPS */
  var sorted=STOPS.slice();
  if(userPos){
    sorted.sort(function(a,b){
      return distKm(userPos,{lat:a.lat,lng:a.lng})-distKm(userPos,{lat:b.lat,lng:b.lng});
    });
  }
  list.innerHTML=sorted.map(function(s,i){
    var isSelected=selectedStop&&s.name===selectedStop.name;
    var dist=userPos?distKm(userPos,{lat:s.lat,lng:s.lng}):null;
    var distText=dist!=null?(dist<1?Math.round(dist*1000)+'ม.':dist.toFixed(1)+'กม.'):'';
    return '<div class="drawer-stop-row'+(isSelected?' is-nearest':'')+
      '" onclick="pickStop(\''+escHtml(s.name)+'\')">'+
      '<div class="drawer-stop-dot'+(s.terminal?' terminal':'')+'"></div>'+
      '<div class="drawer-stop-name">'+escHtml(s.name)+(isSelected?' ✓':'')+'</div>'+
      (distText?'<div class="drawer-stop-dist">'+distText+'</div>':'')+
    '</div>';
  }).join('');
}

window.pickStop=function(name){
  var s=STOPS.find(function(x){return x.name===name;});
  if(!s) return;
  var dist=userPos?distKm(userPos,{lat:s.lat,lng:s.lng}):null;
  selectStop(s,dist);
  closeStopDrawer();
};

})();
