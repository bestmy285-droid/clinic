'use strict';

// Mirrors the local JSON store to Firestore after every save().
// Firestore is a copy, not the source of truth: if it is offline or not
// configured, the app keeps working on the local file.
//
// Enabled when secrets/serviceAccountKey.json exists (or FIRESTORE_KEY points
// at a key file). Disabled for tests and when FIRESTORE_MIRROR=off.

const fs = require('fs');
const path = require('path');

const DEFAULT_KEY = path.join(__dirname, '..', 'secrets', 'serviceAccountKey.json');
const COLLECTION = 'clinics';
const DOC = 'clinic-desk';

let admin = null;
let db = null;
let enabled = false;
let reason = 'not initialised';
let projectId = null;
let queue = Promise.resolve();
let lastWriteAt = null;
let lastError = null;
let settingsApplied = false;

function keyFile() {
  return process.env.FIRESTORE_KEY
    ? path.resolve(process.env.FIRESTORE_KEY)
    : DEFAULT_KEY;
}

function init() {
  if (enabled) return true;
  if (process.env.TEST_MODE === '1') {
    reason = 'TEST_MODE=1 (mirror disabled)';
    return false;
  }
  if (String(process.env.FIRESTORE_MIRROR || '').toLowerCase() === 'off') {
    reason = 'FIRESTORE_MIRROR=off';
    return false;
  }

  const file = keyFile();
  const hasKey = fs.existsSync(file);
  // Cloud Functions / Cloud Run provide credentials automatically.
  const onGoogleCloud = !!(process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FIREBASE_CONFIG);
  if (!hasKey && !onGoogleCloud) {
    reason = 'key file not found: ' + file;
    return false;
  }

  try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      if (hasKey) {
        const credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
        projectId = credentials.project_id || null;
        admin.initializeApp({ credential: admin.credential.cert(credentials) });
      } else {
        admin.initializeApp();
      }
    }
    if (!projectId) {
      projectId = (admin.app().options && admin.app().options.projectId)
        || process.env.GCLOUD_PROJECT
        || process.env.GOOGLE_CLOUD_PROJECT
        || null;
    }
    db = admin.firestore();
    if (!settingsApplied) {
      db.settings({ ignoreUndefinedProperties: true, preferRest: true });
      settingsApplied = true;
    }
    enabled = true;
    reason = 'on';
    console.log('[firestore] mirror ON -> ' + COLLECTION + '/' + DOC + ' (' + projectId + ')');
    return true;
  } catch (err) {
    reason = err.message;
    console.error('[firestore] init failed:', err.message);
    return false;
  }
}

function mirror(data) {
  if (!enabled || !db) return;

  let payload;
  try {
    // Deep copy so later in-memory edits cannot change what gets written.
    payload = JSON.parse(JSON.stringify(data));
  } catch (err) {
    lastError = 'serialize failed: ' + err.message;
    console.error('[firestore]', lastError);
    return;
  }
  payload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  queue = queue
    .then(() => db.collection(COLLECTION).doc(DOC).set(payload))
    .then(() => {
      lastWriteAt = new Date().toISOString();
      lastError = null;
    })
    .catch(err => {
      lastError = err.message;
      console.error('[firestore] write failed:', err.message);
    });
}

async function read() {
  if (!enabled || !db) return null;
  const snap = await db.collection(COLLECTION).doc(DOC).get();
  if (!snap.exists) return null;
  const data = snap.data();
  // serverTimestamp is a Firestore type, not part of the store.
  delete data.updatedAt;
  return data;
}

async function writeNow(data) {
  if (!enabled || !db) return false;
  const payload = JSON.parse(JSON.stringify(data));
  payload.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection(COLLECTION).doc(DOC).set(payload);
  lastWriteAt = new Date().toISOString();
  return true;
}

async function ping() {
  if (!enabled) return { ok: false, reason };
  const snap = await db.collection(COLLECTION).doc(DOC).get();
  return {
    ok: true,
    exists: snap.exists,
    writeTime: snap.updateTime ? snap.updateTime.toDate().toISOString() : null
  };
}

// Wait for queued writes, used on shutdown and by the check script.
async function flush() {
  try {
    await queue;
  } catch (err) {
    // Errors are already logged by mirror().
  }
}

function status() {
  return { enabled, reason, projectId, lastWriteAt, lastError, keyFile: keyFile() };
}

module.exports = { init, mirror, read, writeNow, ping, flush, status };
