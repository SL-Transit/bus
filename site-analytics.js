(function(){
  'use strict';
  var ADMIN_KEY='slTransitAdminDevice';
  var DEVICE_KEY='slTransitAnalyticsDeviceId';
  try{if(localStorage.getItem(ADMIN_KEY)==='1')return;}catch(e){}
  function start(){
    if(!window.firebase||!firebase.apps||!firebase.apps.length||!firebase.database){setTimeout(start,300);return;}
    var id='';
    try{id=localStorage.getItem(DEVICE_KEY)||'';if(!id){id='web_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);localStorage.setItem(DEVICE_KEY,id);}}catch(e){id='session_'+Math.random().toString(36).slice(2,12);}
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p={};parts.forEach(function(x){p[x.type]=x.value;});
    var day=p.year+'-'+p.month+'-'+p.day,page=(location.pathname.split('/').pop()||'index.html').replace(/[.#$\[\]/]/g,'_'),root=firebase.database().ref('analytics/mainWeb/'+day),device=root.child('devices/'+id),now=firebase.database.ServerValue.TIMESTAMP;
    device.transaction(function(current){var v=current||{firstSeenAt:now,pageViews:0,pages:{}};v.lastSeenAt=now;v.pageViews=Number(v.pageViews||0)+1;v.pages=v.pages||{};v.pages[page]=Number(v.pages[page]||0)+1;return v;},function(err,committed,snap){if(err||!committed)return;if(Number(snap.child('pageViews').val()||0)===1)root.child('count').transaction(function(n){return Number(n||0)+1;});root.child('pageViews').transaction(function(n){return Number(n||0)+1;});});
  }
  start();
})();