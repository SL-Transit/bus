'use strict';

/*
 * Safe simulation only. This script requires the Firebase Realtime Database
 * Emulator and never calls LINE, the production database, or a payment system.
 */
const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const staffCenter = require('../functions/staff-notification-center.js');

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error('ต้องกำหนด FIREBASE_DATABASE_EMULATOR_HOST ก่อนเริ่มระบบจำลอง');
}

const projectId = process.env.GCLOUD_PROJECT || 'sl-transit-9464e';
const runId = String(process.env.SIMULATION_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
const rootPath = `simulationRuns/booking881/${runId}`;
const serviceDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const tripCount = 881;
const capacityPerTrip = 3;

process.env.GCLOUD_PROJECT = projectId;
admin.initializeApp({
  projectId,
  databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=sl-transit-9464e-default-rtdb`
});

function tripId(index) {
  return `SIM-TRIP-${String(index + 1).padStart(4, '0')}`;
}

function vehicleId(index) {
  return `SIM-CAR-${String((index % 20) + 1).padStart(3, '0')}`;
}

function bookingCode(index) {
  return `SIM-BOOKING-${String(index + 1).padStart(4, '0')}`;
}

function bookingFor(index) {
  const vehicle = vehicleId(index);
  return {
    code: bookingCode(index),
    date: serviceDate,
    serviceDate,
    time: `${String(6 + (index % 12)).padStart(2, '0')}:${index % 2 ? '20' : '00'}`,
    origin: 'SIM-ต้นทาง',
    destination: 'SIM-ปลายทาง',
    seats: 1,
    pax: 1,
    fare: 55,
    price: 55,
    paymentStatus: 'pay_on_site',
    status: 'awaiting_payment',
    assignment: { plannedVehicleId: vehicle, queueId: `SIM-QUEUE-${String((index % 20) + 1).padStart(3, '0')}` }
  };
}

async function reserve(db, index) {
  const id = tripId(index);
  const booking = bookingFor(index);
  const ref = db.ref(`${rootPath}/capacities/${id}`);
  const result = await ref.transaction((current) => {
    const state = current || { capacityLimit: capacityPerTrip, bookedSeats: 0, seatsAvailable: capacityPerTrip, bookings: {} };
    if (state.bookings && state.bookings[booking.code]) return state;
    if (Number(state.bookedSeats) + booking.seats > Number(state.capacityLimit)) return;
    const bookedSeats = Number(state.bookedSeats) + booking.seats;
    return {
      ...state,
      bookedSeats,
      seatsAvailable: Number(state.capacityLimit) - bookedSeats,
      bookings: { ...(state.bookings || {}), [booking.code]: { seats: booking.seats, status: 'reserved' } }
    };
  });
  assert.equal(result.committed, true, `กันที่นั่งไม่สำเร็จ ${id}`);
  await db.ref(`${rootPath}/bookings/${booking.code}`).set(booking);
  return booking;
}

async function main() {
  const db = admin.database();
  const bookings = await Promise.all(Array.from({ length: tripCount }, (_, index) => reserve(db, index)));
  const config = {
    schemaVersion: 'simulation_only_v1',
    active: true,
    admins: { 'sim-admin': { staffId: 'sim-admin', lineUserId: 'SIM-LINE-ADMIN', active: true } },
    driversByVehicleId: {}
  };
  for (let index = 0; index < tripCount; index += 1) {
    const car = vehicleId(index);
    config.driversByVehicleId[car] = [{ staffId: car, lineUserId: `SIM-LINE-${car}`, active: true }];
  }

  const notifications = [];
  for (const booking of bookings) {
    const alerts = staffCenter.bookingCreatedStaffAlerts({ booking, staffConfig: config });
    assert.equal(alerts.filter((alert) => alert.recipientRole === 'admin').length, 1);
    assert.equal(alerts.filter((alert) => alert.recipientRole === 'driver').length, 1);
    const driver = alerts.find((alert) => alert.recipientRole === 'driver');
    assert.equal(driver.lineTo, `SIM-LINE-${booking.assignment.plannedVehicleId}`);
    notifications.push(...alerts.map((alert) => ({ code: booking.code, role: alert.recipientRole, lineTo: alert.lineTo, vehicleId: booking.assignment.plannedVehicleId })));
  }
  await db.ref(`${rootPath}/mockNotifications`).set(notifications);

  const capacitySnapshot = await db.ref(`${rootPath}/capacities`).get();
  const capacityValues = Object.values(capacitySnapshot.val() || {});
  assert.equal(capacityValues.length, tripCount);
  assert.equal(capacityValues.filter((value) => value.bookedSeats === 1 && value.seatsAvailable === 2).length, tripCount);
  const bookingSnapshot = await db.ref(`${rootPath}/bookings`).get();
  const bookingValues = Object.values(bookingSnapshot.val() || {});
  assert.equal(bookingValues.length, tripCount);
  assert.equal(bookingValues.filter((value) => value.serviceDate === serviceDate && value.seats === 1 && value.price === 55).length, tripCount);
  assert.equal(notifications.length, tripCount * 2);
  assert.equal(notifications.filter((value) => value.role === 'driver' && value.lineTo === `SIM-LINE-${value.vehicleId}`).length, tripCount);

  const duplicate = await db.ref(`${rootPath}/capacities/${tripId(0)}`).transaction((current) => current);
  assert.equal(duplicate.committed, true);
  const duplicateState = (await db.ref(`${rootPath}/capacities/${tripId(0)}`).get()).val();
  assert.equal(duplicateState.bookedSeats, 1, 'การเรียกซ้ำต้องไม่หักที่นั่งซ้ำ');

  console.log(JSON.stringify({
    status: 'passed',
    mode: 'emulator_mock_only',
    lineSent: false,
    paymentSent: false,
    trips: tripCount,
    serviceDate,
    bookings: bookingValues.length,
    capacityChecked: capacityValues.length,
    duplicateBookingChecked: true,
    notificationRecords: notifications.length,
    expectedRecipientsPerBooking: ['admin', 'driver_by_vehicle'],
    allDriversMatchedVehicle: true
  }));
}

main()
  .finally(async () => {
    await admin.database().ref(rootPath).remove();
    await admin.app().delete();
  })
  .catch((error) => {
    console.error(JSON.stringify({ status: 'failed', error: error.message }));
    process.exitCode = 1;
  });
