(function (global) {
  'use strict';

  var FIREBASE_PROJECT_ID = 'sl-transit-9464e';
  var FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyCuWN1RhTSnKjbg5vliTEXa8HtgY7j2spM',
    authDomain: 'sl-transit-9464e.firebaseapp.com',
    databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app',
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
      ? auth.currentUser.getIdToken(true)
      : Promise.resolve('');
  }
  function authError(code, message) { var error = new Error(message || code); error.code = code; return error; }
  function signIn(email, password) {
    var auth = getAuth();
    if (!auth || typeof auth.signInWithEmailAndPassword !== 'function') return Promise.reject(authError('auth_not_configured', 'ยังไม่ได้ตั้งค่าระบบยืนยันตัวตน'));
    return setSessionPersistence().then(function() {
      return auth.signInWithEmailAndPassword(String(email || '').trim(), String(password || ''));
    });
  }
  function signOut() {
    var auth = getAuth();
    return auth && typeof auth.signOut === 'function' ? auth.signOut() : Promise.resolve();
  }
  function onAuthStateChanged(callback) {
    var auth = getAuth();
    return auth && typeof auth.onAuthStateChanged === 'function' ? auth.onAuthStateChanged(callback) : function () {};
  }
  function setSessionPersistence() {
    var auth = getAuth();
    var persistence = global.firebase && global.firebase.auth && global.firebase.auth.Auth && global.firebase.auth.Auth.Persistence;
    return auth && persistence && typeof auth.setPersistence === 'function'
      ? auth.setPersistence(persistence.LOCAL)
      : Promise.resolve();
  }
  function notify() { global.dispatchEvent(new Event('admin-erp:refresh')); }

  if (global.firebase && typeof global.firebase.initializeApp === 'function') {
    if (!global.firebase.apps.length) global.firebase.initializeApp(FIREBASE_CONFIG);
    var auth = getAuth();
    if (auth && typeof auth.setPersistence === 'function' && global.firebase.auth.Auth && global.firebase.auth.Auth.Persistence) {
      auth.setPersistence(global.firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
    }
    if (auth && typeof auth.onAuthStateChanged === 'function') auth.onAuthStateChanged(notify);
  }

  global.SLTransitAdminErpConfig = Object.freeze({
    projectId: FIREBASE_PROJECT_ID,
    endpoint: ENDPOINT,
    getIdToken: getIdToken,
    signIn: signIn,
    signOut: signOut,
    onAuthStateChanged: onAuthStateChanged,
    setSessionPersistence: setSessionPersistence,
    fetchImpl: typeof fetch === 'function' ? fetch.bind(global) : null
  });
}(typeof window !== 'undefined' ? window : globalThis));
