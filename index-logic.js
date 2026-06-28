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
var mapObj        = null;
var mapReady      = false;
var stopsReady    = false;  /* Firebase โหลดเสร็จหรือยัง */
var pendingPos    = null;   /* GPS มาก่อน Firebase → รอ */
var stopMarkers       = [];
var nearestPinOverlay = null;
var userMarkerOverlay = null;

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
function waitLongdo(cb){
  if(window.longdo&&typeof longdo.Map==='function'){cb();return;}
  var t=setInterval(function(){
    if(window.longdo&&typeof longdo.Map==='function'){clearInterval(t);cb();}
  },150);
}
waitLongdo(function(){
  mapObj=new longdo.Map({
    placeholder:document.getElementById('longdo-map'),
    zoom:9,
    location:{lon:101.437482,lat:13.659022}   /* ศูนย์กลางเส้นทาง */
  });
  mapObj.Event.bind('ready',function(){
    mapReady=true;
    renderStopMarkers();
    if(selectedStop) highlightStop(selectedStop);
    if(userPos)      placeUserMarker(userPos);
  });
});

function renderStopMarkers(){
  // Keep nearest-stop calculation, but keep the homepage map clean.
  return;
}

function highlightStop(stop){
  if(!mapReady||!mapObj||!stop) return;
  if(nearestPinOverlay){try{mapObj.Overlays.remove(nearestPinOverlay);}catch(e){} nearestPinOverlay=null;}
  nearestPinOverlay = new longdo.Marker(
    {lon:stop.lng, lat:stop.lat},
    {
      weight: longdo.OverlayWeight ? longdo.OverlayWeight.Top : undefined,
      icon:{
        html:'<div class="map-nearest-pin">'+
               '<div class="map-nearest-bubble">'+escHtml(stop.name)+'</div>'+
               '<div class="map-nearest-icon-pin">'+
                 '<img src="assets/icon-bus-pin-blue.png" width="22" height="22" style="object-fit:contain" alt=""> <!-- (icon-111: w=22px, h=22px, object-fit:contain) -->'+
               '</div>'+
               '<div style="font-size:10px;color:#fff;font-weight:700;text-align:center;margin-top:1px;text-shadow:0 1px 3px rgba(0,0,0,0.6);letter-spacing:0.3px">ป้ายใกล้ฉัน</div>'+
             '</div>',
        offset:{x:55,y:72}
      }
    }
  );
  mapObj.Overlays.add(nearestPinOverlay);
  mapObj.location({lon:stop.lng,lat:stop.lat},true);
  mapObj.zoom(13,true);
}

/* ── focusMap (ตาม passenger.html) ───────────── */
function focusMap(point, zoomLevel, animate, lockInteraction){
  if(!mapObj||!point) return;
  try{
    var shouldAnimate = animate===true;
    if(lockInteraction) _progMapUntil = Date.now()+900;
    mapObj.location({lon:point.lng||point.lon, lat:point.lat}, shouldAnimate);
    if(zoomLevel) setTimeout(function(){ mapObj.zoom(zoomLevel, shouldAnimate); }, 80);
  }catch(e){ console.warn('focusMap error:',e); }
}
var _progMapUntil = 0;

/* ── placeUserMarker (สร้างครั้งเดียว แล้ว move) ─ */
function placeUserMarker(pos){
  if(!mapReady||!mapObj||!pos) return;
  var p = {lon: pos.lng||pos.lon, lat: pos.lat};
  if(!userMarkerOverlay){
    userMarkerOverlay = new longdo.Marker(p,{
      weight: longdo.OverlayWeight ? longdo.OverlayWeight.Top : undefined,
      icon:{ html:'<div class="map-user-dot"></div>', offset:{x:9,y:9} }
    });
    mapObj.Overlays.add(userMarkerOverlay);
  } else {
    try{ userMarkerOverlay.move(p); }
    catch(e){
      try{ userMarkerOverlay.location(p); }
      catch(e2){
        try{ mapObj.Overlays.remove(userMarkerOverlay); }catch(e3){}
        userMarkerOverlay = new longdo.Marker(p,{
          icon:{ html:'<div class="map-user-dot"></div>', offset:{x:9,y:9} }
        });
        mapObj.Overlays.add(userMarkerOverlay);
      }
    }
  }
}

/* ══════════════════════════════════════════
   SELECT STOP + RENDER ROUTES
══════════════════════════════════════════ */
function selectStop(stop,distKmVal,outOfZone){
  selectedStop=stop;

  /* nearest card */
  var nameEl=document.getElementById('nearest-name');
  var subEl=document.getElementById('nearest-sub');
  if(nameEl) nameEl.textContent=stop.name;
  if(subEl){
    if(outOfZone){
      subEl.textContent='ท่านอยู่นอกพื้นที่ · แสดงเส้นทางจากฉะเชิงเทรา';
    } else if(distKmVal!=null){
      subEl.textContent='ป้ายใกล้คุณที่สุด · '+
        (distKmVal<1?Math.round(distKmVal*1000)+'ม.':distKmVal.toFixed(1)+'กม.');
    } else {
      subEl.textContent='แตะเพื่อเปลี่ยนป้าย';
    }
  }

  /* locate btn → แสดงว่ากำลังใช้ตำแหน่ง */
  var btn=document.getElementById('locate-btn');
  if(btn&&distKmVal!=null){
    btn.innerHTML=SVG_LOCATE+' ตำแหน่งของฉัน ✓';
    btn.style.borderColor='var(--teal)';
  }

  highlightStop(stop);
  renderRouteList(stop);
}


/* ──────────────────────────────────────────
   ดึง routes จาก catalog (ERP) สำหรับป้ายที่เลือก
   ดึง routes จาก catalog กลาง (ERP) เท่านั้น — ห้ามใช้ hardcode
   ────────────────────────────────────────── */
function getCatalogRoutesForStop(stop){
  if(!_catalog || !window.SLTransitERP) return null;
  var stopNameTh = stop.name||'';
  var out = [];
  var routes = _catalog.routes||{};
  var seen = {};
  Object.keys(routes).forEach(function(rId){
    var route = routes[rId];
    if(!route||route.isActive===false) return;
    var from = route.from||route.fromStopKey||'';
    var fromClean = String(from).replace(/\s+/g,'').toLowerCase();
    var nameClean = String(stopNameTh).replace(/\s+/g,'').toLowerCase();
    if(!fromClean||!nameClean) return;
    if(fromClean.indexOf(nameClean)===-1&&nameClean.indexOf(fromClean)===-1) return;
    var to = route.to||route.toStopKey||'';
    var dest = stopNameTh+' - '+to;
    if(seen[dest]) return;
    seen[dest]=true;
    var times = SLTransitERP.routeTimes(_catalog,from,to)||[];
    out.push({dest:dest,times:times,routeId:rId});
  });
  out.sort(function(a,b){
    var fn = SLTransitERP.stopOrderValue||function(){return 0;};
    return fn(a.dest.split(' - ')[1]||'') - fn(b.dest.split(' - ')[1]||'');
  });
  return out.length?out:null;
}

function renderRouteList(stop){
  var list=document.getElementById('route-list');
  if(!list) return;

  /* ดึงข้อมูลจาก catalog กลางเท่านั้น (ห้าม hardcode) */
  var routes=getCatalogRoutesForStop(stop)||[];

  if(!routes.length){
    list.innerHTML=
      '<div class="routes-empty">'+
        '<div class="empty-icon">🔎</div>'+
        'ไม่พบเส้นทางในระบบ<br>'+
        '<small>กรุณารอข้อมูลโหลด หรือเลือกป้ายใหม่</small>'+
      '</div>';
    return;
  }

  list.innerHTML=routes.map(function(r){
    return '<a href="booking.html" class="route-row">'+
      '<div class="route-bus-icon"><img src="assets/icon-bus-pin-teal.png" width="28" height="28" style="object-fit:contain" alt=""> <!-- (icon-107: w=28px, h=28px, object-fit:contain) --></div>'+
      '<div style="flex:1;min-width:0">'+
        '<div class="route-name">'+escHtml(r.dest||r.name||'')+'</div>'+
        (r.sub?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+escHtml(r.sub)+'</div>':'')+
      '</div>'+
      '<div class="route-cta">เลือกเที่ยว ›</div>'+
    '</a>';
  }).join('');
}

/* ══════════════════════════════════════════
   FALLBACK ROUTE DATA (ถ้า Firebase ไม่มี routes)
══════════════════════════════════════════ */

/* SVG locate icon ใช้ซ้ำได้ */
var SVG_LOCATE='<img src="assets/icon-location.png" width="18" height="18" style="object-fit:contain;flex-shrink:0" alt=""> <!-- (icon-102: w=18px, h=18px, object-fit:contain) -->';;

/* ══════════════════════════════════════════
   GPS → on position resolved, find nearest
══════════════════════════════════════════ */
function onPositionResolved(lat,lng,source){
  userPos={lat:lat,lng:lng};
  placeUserMarker(userPos);

  /* pan + zoom smooth ไปหาผู้ใช้ทันที (ตาม passenger.html) */
  if(mapReady&&mapObj){
    focusMap({lat:lat,lng:lng}, 14, true, true);
  }

  if(!stopsReady){
    pendingPos={lat:lat,lng:lng};
    return;
  }

  var res=findNearest(userPos);
  if(res.stop) selectStop(res.stop,res.dist,res.outOfZone);
}

/* ══════════════════════════════════════════
   GPS — ขอทันทีตอนโหลดหน้า
══════════════════════════════════════════ */
setNearestLoading();

var _gpsSettled=false;

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
      /* ปฏิเสธ หรือ timeout → ลอง IP */
      tryIPGeo();
    },
    {timeout:8000,enableHighAccuracy:true,maximumAge:60000}
  );
}

/* ── IP Geolocation fallback ── */
function tryIPGeo(){
  fetch('https://ipapi.co/json/',{signal:AbortSignal.timeout(6000)})
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d||!d.latitude||!d.longitude){throw new Error('no data');}
      /* ตรวจว่า IP อยู่ในไทย และใกล้เส้นทางพอสมควร (< 300 กม.) */
      var lat=Number(d.latitude),lng=Number(d.longitude);
      var centerLat=13.5,centerLng=101.5;
      var roughDist=Math.sqrt(Math.pow(lat-centerLat,2)+Math.pow(lng-centerLng,2));
      if(roughDist>3){
        /* IP อยู่ไกลมาก (ต่างประเทศ ฯลฯ) → error */
        setNearestError('ไม่พบตำแหน่งในพื้นที่ให้บริการ');
        return;
      }
      onPositionResolved(lat,lng,'ip');
      /* แจ้งว่าใช้ IP เพื่อความโปร่งใส */
      var subEl=document.getElementById('nearest-sub');
      if(subEl&&selectedStop){
        subEl.textContent+=' (ประมาณจาก IP)';
      }
    })
    .catch(function(){
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

/* โหลดประกาศ */
loadAnnouncements();
loadCatalog();

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
      if(mapReady){
        stopMarkers.forEach(function(m){try{mapObj.Overlays.remove(m);}catch(e){}});
        stopMarkers=[];
        renderStopMarkers();
      }
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
  /* Firebase โหลดไม่ได้ — ใช้ STOPS พิกัดที่ฝังไว้ใน index2 (ตำแหน่งป้าย ไม่ใช่ข้อมูลเส้นทาง) */
  stopsReady=true;
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
tryGPS();

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
