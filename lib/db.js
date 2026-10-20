'use strict';

const fs = require('fs');
const path = require('path');
const passwords = require('./passwords');
const firestore = require('./firestore');

const ACTIVE = new Set(['Booked', 'Confirmed', 'Checked-in']);

const DEFAULT_NOW = '2026-10-20T08:00';
const SEED_PASSWORD = 'Clinic@2026';

function seed() {
  return {
    testNow: DEFAULT_NOW,
    seq: 20,
    refSeq: {},
    users: [
      { id: 'U-1', name: 'Rita Front Desk', email: 'receptionist@clinic.test', password: passwords.hash(SEED_PASSWORD), role: 'receptionist' },
      { id: 'U-2', name: 'Dr. Asha Rao', email: 'doctor@clinic.test', password: passwords.hash(SEED_PASSWORD), role: 'doctor', doctorId: 'D-01' },
      { id: 'U-3', name: 'Clinic Manager', email: 'admin@clinic.test', password: passwords.hash(SEED_PASSWORD), role: 'admin' }
    ],
    doctors: [
      { id: 'D-01', name: 'Dr. Asha Rao', specialty: 'Dermatology', slotMinutes: 15, active: true },
      { id: 'D-02', name: 'Dr. Vikram Shah', specialty: 'General Medicine', slotMinutes: 20, active: true },
      { id: 'D-03', name: 'Dr. Meera Iyer', specialty: 'Pediatrics', slotMinutes: 30, active: true }
    ],
    patients: [
      { id: 'P-1001', name: 'Rohan Mehta', mobile: '9876543210', dob: '1985-04-12', gender: 'Male', email: '' },
      { id: 'P-1002', name: 'Sana Khan', mobile: '9812345678', dob: '1992-11-30', gender: 'Female', email: '' },
      { id: 'P-1003', name: 'Aarav Mehta', mobile: '9876543210', dob: '2016-09-03', gender: 'Male', email: '' },
      { id: 'P-1004', name: 'Neha Verma', mobile: '9922334455', dob: '1990-01-15', gender: 'Female', email: '' },
      { id: 'P-1005', name: 'Imran Sheikh', mobile: '9765432109', dob: '1978-06-21', gender: 'Male', email: '' }
    ],
    availability: [
      { id: 'AV-1', doctorId: 'D-01', weekday: 1, start: '09:00', end: '13:00', slotMinutes: 15 },
      { id: 'AV-2', doctorId: 'D-01', weekday: 2, start: '09:00', end: '13:00', slotMinutes: 15 },
      { id: 'AV-3', doctorId: 'D-01', weekday: 3, start: '09:00', end: '13:00', slotMinutes: 15 },
      { id: 'AV-4', doctorId: 'D-01', weekday: 4, start: '09:00', end: '13:00', slotMinutes: 15 },
      { id: 'AV-5', doctorId: 'D-01', weekday: 5, start: '09:00', end: '13:00', slotMinutes: 15 },
      { id: 'AV-6', doctorId: 'D-01', weekday: 1, start: '16:00', end: '19:00', slotMinutes: 15 },
      { id: 'AV-7', doctorId: 'D-01', weekday: 2, start: '16:00', end: '19:00', slotMinutes: 15 },
      { id: 'AV-8', doctorId: 'D-01', weekday: 3, start: '16:00', end: '19:00', slotMinutes: 15 },
      { id: 'AV-9', doctorId: 'D-01', weekday: 4, start: '16:00', end: '19:00', slotMinutes: 15 },
      { id: 'AV-10', doctorId: 'D-01', weekday: 5, start: '16:00', end: '19:00', slotMinutes: 15 },
      { id: 'AV-11', doctorId: 'D-02', weekday: 1, start: '10:00', end: '14:00', slotMinutes: 20 },
      { id: 'AV-12', doctorId: 'D-02', weekday: 2, start: '10:00', end: '14:00', slotMinutes: 20 },
      { id: 'AV-13', doctorId: 'D-02', weekday: 3, start: '10:00', end: '14:00', slotMinutes: 20 },
      { id: 'AV-14', doctorId: 'D-02', weekday: 4, start: '10:00', end: '14:00', slotMinutes: 20 },
      { id: 'AV-15', doctorId: 'D-02', weekday: 5, start: '10:00', end: '14:00', slotMinutes: 20 },
      { id: 'AV-16', doctorId: 'D-02', weekday: 6, start: '10:00', end: '14:00', slotMinutes: 20 },
      { id: 'AV-17', doctorId: 'D-03', weekday: 2, start: '09:30', end: '12:30', slotMinutes: 30 },
      { id: 'AV-18', doctorId: 'D-03', weekday: 3, start: '09:30', end: '12:30', slotMinutes: 30 },
      { id: 'AV-19', doctorId: 'D-03', weekday: 4, start: '09:30', end: '12:30', slotMinutes: 30 },
      { id: 'AV-20', doctorId: 'D-03', weekday: 5, start: '09:30', end: '12:30', slotMinutes: 30 },
      { id: 'AV-21', doctorId: 'D-03', weekday: 6, start: '09:30', end: '12:30', slotMinutes: 30 }
    ],
    timeOff: [],
    settings: {
      horizonDays: 60,
      callListLeadHours: 24,
      defaultSlotMinutes: 15,
      openTime: '07:00',
      closeTime: '22:00',
      holidays: ['2026-10-22'],
      sessionIdleMinutes: 15
    },
    appointments: [
      { id: 'A-1', reference: 'APT-20261020-0001', patientId: 'P-1002', doctorId: 'D-01', slotStart: '2026-10-20T09:00', slotEnd: '2026-10-20T09:15', status: 'Booked', channel: 'staff', rescheduleCount: 0, cancelReason: '', cancelNote: '', createdBy: 'U-1', createdAt: '2026-10-19T10:00' },
      { id: 'A-2', reference: 'APT-20261020-0002', patientId: 'P-1001', doctorId: 'D-01', slotStart: '2026-10-20T10:00', slotEnd: '2026-10-20T10:15', status: 'Cancelled', channel: 'staff', rescheduleCount: 0, cancelReason: 'Patient request', cancelNote: 'Travel plan', createdBy: 'U-1', createdAt: '2026-10-18T12:00' },
      { id: 'A-3', reference: 'APT-20261020-0003', patientId: 'P-1004', doctorId: 'D-03', slotStart: '2026-10-20T11:00', slotEnd: '2026-10-20T11:30', status: 'Completed', channel: 'staff', rescheduleCount: 0, cancelReason: '', cancelNote: '', createdBy: 'U-1', createdAt: '2026-10-18T09:00' },
      { id: 'A-4', reference: 'APT-20261019-0001', patientId: 'P-1005', doctorId: 'D-02', slotStart: '2026-10-19T10:00', slotEnd: '2026-10-19T10:20', status: 'No-show', channel: 'staff', rescheduleCount: 0, cancelReason: '', cancelNote: '', createdBy: 'U-1', createdAt: '2026-10-17T09:00' },
      { id: 'A-5', reference: 'APT-20261021-0001', patientId: 'P-1004', doctorId: 'D-01', slotStart: '2026-10-21T10:00', slotEnd: '2026-10-21T10:15', status: 'Booked', channel: 'staff', rescheduleCount: 0, cancelReason: '', cancelNote: '', createdBy: 'U-1', createdAt: '2026-10-19T11:00' },
      { id: 'A-6', reference: 'APT-20261021-0002', patientId: 'P-1005', doctorId: 'D-01', slotStart: '2026-10-21T11:00', slotEnd: '2026-10-21T11:15', status: 'Booked', channel: 'staff', rescheduleCount: 0, cancelReason: '', cancelNote: '', createdBy: 'U-1', createdAt: '2026-10-19T11:05' },
      { id: 'A-7', reference: 'APT-20261023-0001', patientId: 'P-1003', doctorId: 'D-02', slotStart: '2026-10-23T09:00', slotEnd: '2026-10-23T09:20', status: 'Booked', channel: 'staff', rescheduleCount: 0, cancelReason: '', cancelNote: '', createdBy: 'U-1', createdAt: '2026-10-19T11:10' }
    ],
    audit: []
  };
}

const dataFile = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, '..', 'data', 'clinic.json');

let data;

// Cloud mode: Firestore is the store and no local file is written.
// Local mode keeps data/clinic.json and mirrors it to Firestore when configured.
const CLOUD = String(process.env.STORAGE || '').toLowerCase() === 'firestore';

function migratePasswords() {
  let migrated = false;
  (data.users || []).forEach(u => {
    if (passwords.needsRehash(u.password)) {
      u.password = passwords.hash(u.password);
      migrated = true;
    }
  });
  if (migrated) save();
}

function load() {
  if (process.env.TEST_MODE === '1') {
    data = seed();
    save();
    return;
  }
  if (fs.existsSync(dataFile)) {
    data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    migratePasswords();
  } else {
    data = seed();
    save();
  }
}

function save() {
  if (!CLOUD) {
    const dir = path.dirname(dataFile);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  // Firestore receives a copy after every change, in both modes.
  firestore.mirror(data);
}

function reset() {
  data = seed();
  save();
}

let bootPromise = null;

// Entry points call boot() before serving: it initialises Firestore and,
// in cloud mode, loads the snapshot from Firestore instead of the file.
function boot() {
  if (!bootPromise) {
    bootPromise = (async () => {
      firestore.init();
      if (!CLOUD) {
        load();
        return;
      }
      const snapshot = await firestore.read();
      if (snapshot) {
        data = snapshot;
        migratePasswords();
      } else {
        data = seed();
        await firestore.writeNow(data);
      }
    })();
  }
  return bootPromise;
}

module.exports = {
  get data() { return data; },
  ACTIVE,
  CLOUD,
  boot,
  load,
  save,
  reset,
  seed,
  dataFile
};
