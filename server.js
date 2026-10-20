'use strict';

const http = require('http');
const { handle } = require('./lib/app');
const firestore = require('./lib/firestore');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'"
  ].join('; ')
};

const server = http.createServer((req, res) => {
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, headers) => {
    const merged = Object.assign({}, SECURITY_HEADERS, headers || {});
    if (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) {
      merged['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return originalWriteHead(status, merged);
  };

  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal error');
  });
});

server.listen(port, host, () => {
  console.log(`Clinic Desk listening on http://${host}:${port}`);
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
