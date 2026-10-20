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
  if (!fs.existsSync(file)) {
    reason = 'key file not found: ' + file;
    return false;
  }

  try {
    admin = require('firebase-admin');
    const credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
    projectId = credentials.project_id || null;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(credentials) });
    }
    db = admin.firestore();
    if (!settingsApplied) {
      db.settings({ ignoreUndefinedProperties: true });
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

module.exports = { init, mirror, ping, flush, status };
