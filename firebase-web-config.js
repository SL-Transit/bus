(function (global) {
  'use strict';

  if (global.SL_TRANSIT_FIREBASE_WEB_CONFIG) return;
  global.SL_TRANSIT_FIREBASE_WEB_CONFIG = {
    apiKey: 'TODO_CONFIGURE_PUBLIC_WEB_API_KEY',
    authDomain: 'sl-transit-9464e.firebaseapp.com',
    databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'sl-transit-9464e',
    storageBucket: 'sl-transit-9464e.firebasestorage.app',
    messagingSenderId: 'TODO_CONFIGURE_PUBLIC_SENDER_ID',
    appId: 'TODO_CONFIGURE_PUBLIC_APP_ID'
  };
})(typeof window !== 'undefined' ? window : global);
