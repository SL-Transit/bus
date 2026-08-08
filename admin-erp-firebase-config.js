(function (global) {
  'use strict';

  var FIREBASE_PROJECT_ID = 'sl-transit-9464e';
  var FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyCuWN1RhTSnKjbg5vliTEXa8HtgY7j2spM',
    authDomain: 'sl-transit-9464e.firebaseapp.com',
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: 'sl-transit-9464e.firebasestorage.app',
    messagingSenderId: '480076551107',
    appId: '1:480076551107:web:0548531ec69327a2bfe376'
  });
  var ENDPOINT = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readAdminErpDataCenter';

  function getAuth() {
    try { return global.firebase && typeof global.firebase.auth === 'function' ? global.firebase.auth() : null; } catch (error) { return null; }
  }
  function getIdToken() {
    var auth = getAuth();
    return auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function'
      ? auth.currentUser.getIdToken(false)
      : Promise.resolve('');
  }
  function notify() { global.dispatchEvent(new Event('admin-erp:refresh')); }

  if (global.firebase && typeof global.firebase.initializeApp === 'function') {
    if (!global.firebase.apps.length) global.firebase.initializeApp(FIREBASE_CONFIG);
    var auth = getAuth();
    if (auth && typeof auth.onAuthStateChanged === 'function') auth.onAuthStateChanged(notify);
  }

  global.SLTransitAdminErpConfig = Object.freeze({
    projectId: FIREBASE_PROJECT_ID,
    endpoint: ENDPOINT,
    getIdToken: getIdToken,
    fetchImpl: typeof fetch === 'function' ? fetch.bind(global) : null
  });
}(typeof window !== 'undefined' ? window : globalThis));
