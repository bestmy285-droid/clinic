'use strict';

const crypto = require('crypto');

const KEYLEN = 64;

function hash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function isHashed(value) {
  return typeof value === 'string' && value.startsWith('scrypt$');
}

function verify(password, stored) {
  if (!stored) return false;
  if (!isHashed(stored)) {
    const a = Buffer.from(String(password));
    const b = Buffer.from(String(stored));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const [, salt, key] = stored.split('$');
  if (!salt || !key) return false;
  const candidate = crypto.scryptSync(String(password), salt, KEYLEN);
  const expected = Buffer.from(key, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function needsRehash(stored) {
  return !isHashed(stored);
}

module.exports = { hash, verify, isHashed, needsRehash };
