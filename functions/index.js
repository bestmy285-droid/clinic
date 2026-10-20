'use strict';

// Cloud entry point. Firestore is the store here; no local JSON file is written.
process.env.STORAGE = 'firestore';

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { handle } = require('./lib/app');
const db = require('./lib/db');
const firestore = require('./lib/firestore');
const { applySecurityHeaders } = require('./lib/headers');

// One instance keeps the in-memory sessions and the in-memory copy consistent.
setGlobalOptions({ region: 'asia-south1', maxInstances: 1, memory: '256MiB' });

let ready = null;

// The body must be consumed before boot(): a slow cold start would otherwise
// let the request stream end before the router attaches its listeners.
function bufferBody(req) {
  if (req.bodyBuffer) return Promise.resolve();
  if (req.method === 'GET' || req.method === 'HEAD') {
    req.bodyBuffer = Buffer.alloc(0);
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      req.bodyBuffer = Buffer.concat(chunks);
      resolve();
    };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 25e6) { req.destroy(); finish(); return; }
      chunks.push(chunk);
    });
    req.on('end', finish);
    req.on('error', finish);
    if (req.readableEnded) finish();
  });
}

exports.clinic = onRequest(async (req, res) => {
  const body = bufferBody(req);

  if (!ready) {
    const started = Date.now();
    ready = db.boot().then(() => console.log('boot ms:', Date.now() - started));
  }

  try {
    await Promise.all([body, ready]);
    applySecurityHeaders(req, res);
    await handle(req, res);
  } catch (err) {
    console.error('request failed:', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal error');
  } finally {
    // The response is already sent, but the instance may be frozen right after
    // this handler resolves, so let the queued Firestore write finish first.
    await Promise.race([firestore.flush(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
});
