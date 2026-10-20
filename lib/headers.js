'use strict';

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

function applySecurityHeaders(req, res) {
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, headers) => {
    const merged = Object.assign({}, SECURITY_HEADERS, headers || {});
    if (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) {
      merged['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return originalWriteHead(status, merged);
  };
}

module.exports = { SECURITY_HEADERS, applySecurityHeaders };
