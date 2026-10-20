'use strict';

const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const USERS = {
  receptionist: 'receptionist@clinic.test',
  doctor: 'doctor@clinic.test',
  admin: 'admin@clinic.test'
};

const test = base.test.extend({
  evidence: [async ({ page }, use, testInfo) => {
    await use();
    if (testInfo.status === 'skipped') return;
    const match = testInfo.title.match(/TC-\d{2}/);
    if (!match) return;
    const dir = path.join(process.cwd(), 'evidence');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${match[0]}.png`), fullPage: true }).catch(() => {});
  }, { auto: true }]
});

async function resetDb(request) {
  const res = await request.post('/test/reset');
  if (!res.ok()) throw new Error('Reset failed: ' + res.status());
}

async function setClock(request, now) {
  const res = await request.post('/test/clock', { form: { now } });
  if (!res.ok()) throw new Error('Clock failed: ' + res.status());
}

async function login(page, role) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(USERS[role]);
  await page.getByTestId('login-password').fill('Clinic@2026');
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/dashboard');
}

async function logout(page) {
  await page.getByTestId('nav-logout').click();
  await page.waitForURL('**/login');
}

async function apiBook(request, patientId, doctorId, start) {
  return request.post('/api/book', { form: { patientId, doctorId, start } });
}

module.exports = { test, expect: base.expect, resetDb, setClock, login, logout, apiBook, USERS };
