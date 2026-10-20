'use strict';

const http = require('http');
const { handle } = require('./lib/app');
const db = require('./lib/db');
const firestore = require('./lib/firestore');
const { applySecurityHeaders } = require('./lib/headers');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const server = http.createServer((req, res) => {
  applySecurityHeaders(req, res);

  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal error');
  });
});

db.boot()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`Clinic Desk listening on http://${host}:${port}`);
    });
  })
  .catch(err => {
    console.error('startup failed:', err);
    process.exit(1);
  });

// Give queued Firestore writes a moment to finish before exiting.
function shutdown() {
  server.close();
  Promise.race([
    firestore.flush(),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]).finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
