'use strict';

const { test, expect, resetDb, setClock, login, logout } = require('./helpers');

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('TC-30 daily CSV export', async ({ page }) => {
  await setClock(page.request, '2026-10-20T18:00');
  await login(page, 'receptionist');
  await page.goto('/reports?date=2026-10-20');

  const d01 = page.getByTestId('report-row-D-01');
  await expect(d01).toContainText('Dr. Asha Rao');
  await expect(d01.locator('td').nth(1)).toHaveText('2');
  await expect(d01.locator('td').nth(7)).toHaveText('1');
  await expect(page.getByTestId('report-row-D-03').locator('td').nth(5)).toHaveText('1');

  const csv = await page.request.get('/reports/daily.csv?date=2026-10-20');
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text.split('\n')[0]).toContain('Doctor,Total,Booked');
  expect(text).toContain('"Dr. Asha Rao","2"');
  expect(text).not.toContain('Travel plan');
});

test('TC-32 clinic settings update', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/settings');
  await page.getByTestId('set-horizon').fill('30');
  await page.getByTestId('set-lead').fill('12');
  await page.getByTestId('set-holidays').fill('2026-10-22,2026-12-25');
  await page.getByTestId('set-save').click();
  await expect(page.getByTestId('flash')).toContainText('Settings saved');

  await page.reload();
  await expect(page.getByTestId('set-horizon')).toHaveValue('30');
  await expect(page.getByTestId('set-lead')).toHaveValue('12');
  await expect(page.getByTestId('set-holidays')).toHaveValue('2026-10-22,2026-12-25');
});

test('TC-34 schedule view performance', async ({ page }) => {
  await login(page, 'receptionist');
  const times = [];
  for (let i = 0; i < 20; i++) {
    const t = Date.now();
    const res = await page.request.get('/schedule?doctorId=D-01&date=2026-10-21');
    expect(res.status()).toBe(200);
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1];
  console.log('TC-34 p95 schedule ms:', p95, times);
  expect(p95).toBeLessThan(2000);
});

test('TC-35 booking API performance', async ({ page }) => {
  await login(page, 'receptionist');
  const slots = ['10:00', '10:20', '10:40', '11:00', '11:20', '11:40', '12:00', '12:20', '12:40', '13:00'];
  const patients = ['P-1001', 'P-1002', 'P-1004', 'P-1005', 'P-1003'];
  const times = [];
  for (let i = 0; i < slots.length; i++) {
    const t = Date.now();
    const res = await page.request.post('/api/book', {
      form: { patientId: patients[i % patients.length], doctorId: 'D-02', start: `2026-10-21T${slots[i]}` }
    });
    expect(res.status()).toBe(201);
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1];
  console.log('TC-35 p95 booking ms:', p95, times);
  expect(p95).toBeLessThan(800);
});

test('TC-37 idle session timeout', async ({ page }) => {
  await login(page, 'admin');

  const res = await page.request.get('/dashboard');
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
  const cookie = (await page.context().cookies()).find(x => x.name === '__session');
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe('Lax');

  await page.goto('/settings');
  await page.getByTestId('set-session').fill('0.02');
  await page.getByTestId('set-save').click();
  await expect(page.getByTestId('flash')).toContainText('Settings saved');

  await page.waitForTimeout(1700);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('TC-38 keyboard-only booking flow', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-01&date=2026-10-21');

  const labelled = await page.locator('label:has(input), label:has(select)').count();
  expect(labelled).toBeGreaterThanOrEqual(2);

  const seen = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el ? el.tagName : '',
        testid: el ? el.getAttribute('data-testid') || '' : '',
        outline: el ? getComputedStyle(el).outlineStyle : ''
      };
    });
    if (info.tag !== 'BODY') seen.push(info);
  }
  expect(seen.length).toBeGreaterThanOrEqual(4);
  expect(seen.some(x => x.outline !== 'none')).toBeTruthy();
  await expect(page.getByTestId('book-doctor')).toBeVisible();
});

test('TC-40 timezone and 12-hour display', async ({ page }) => {
  await login(page, 'receptionist');
  const res = await page.request.post('/api/book', {
    form: { patientId: 'P-1001', doctorId: 'D-01', start: '2026-10-21T18:00' }
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  await page.goto('/appointments/' + id);
  await expect(page.getByTestId('appt-when')).toContainText('06:00 PM');
  await expect(page.getByTestId('appt-when')).toContainText('Oct 2026');
  await expect(page.getByTestId('appt-when')).not.toContainText('18:00');
});

test('TC-41 browser and viewport compatibility', async ({ page }) => {
  await login(page, 'receptionist');
  for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.goto('/book?doctorId=D-01&date=2026-10-21');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('slot-12:00')).toBeVisible();
  }
});

test('TC-57 no PHI in logs, URLs and exports', async ({ page, request }) => {
  await login(page, 'receptionist');
  await page.goto('/appointments/A-5');
  await page.getByTestId('cancel-reason').selectOption('Patient request');
  await page.getByTestId('cancel-note').fill('ZZSECRETNOTE');
  await page.getByTestId('cancel-submit').click();
  await expect(page.getByTestId('flash')).toContainText('cancelled');

  expect(page.url()).not.toContain('ZZSECRETNOTE');
  const logs = await (await request.get('/test/logs')).text();
  expect(logs).not.toContain('ZZSECRETNOTE');
  expect(logs).not.toContain('Travel plan');
  expect(logs).not.toContain('Patient request');

  const csv = await (await page.request.get('/reports/daily.csv?date=2026-10-20')).text();
  expect(csv).not.toContain('ZZSECRETNOTE');
  expect(csv).not.toContain('Patient request');
  expect(csv).not.toContain('Travel plan');

  const state = await (await request.get('/test/state')).text();
  expect(state).toContain('ZZSECRETNOTE');
});

test('TC-58 generate next-day call list', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/call-list?date=2026-10-21');
  await expect(page.getByTestId('calllist-row')).toHaveCount(2);
  await expect(page.getByTestId('calllist-table')).toContainText('Neha Verma');
  await expect(page.getByTestId('calllist-table')).toContainText('9922334455');
  await expect(page.getByTestId('calllist-table')).toContainText('APT-20261021-0001');

  await page.getByTestId('calllist-doctor').selectOption('D-01');
  await page.getByTestId('calllist-generate').click();
  await expect(page.getByTestId('calllist-row')).toHaveCount(2);

  await page.getByTestId('calllist-doctor').selectOption('D-02');
  await page.getByTestId('calllist-generate').click();
  await expect(page.getByTestId('calllist-row')).toHaveCount(0);
  await expect(page.getByTestId('calllist-print')).toBeVisible();
});

test('TC-60 import patients from CSV', async ({ page, request }) => {
  await login(page, 'admin');
  await page.goto('/import');

  const csv = [
    'Name,Mobile,DOB,Gender,Email',
    'Import One,9000000101,1990-01-01,Female,one@example.com',
    'Import Two,9000000102,31/12/1988,Male,',
    'Rohan Mehta,9876543210,1985-04-12,Male,',
    'New Mehta,9876543210,2010-05-05,Male,',
    'Bad Mobile,12345,1990-01-01,Male,',
    'Bad Dob,9000000103,31/02/1990,Male,',
    'Import One,9000000101,1990-01-01,Female,'
  ].join('\n');

  await page.getByTestId('import-text').fill(csv);
  await page.getByTestId('import-preview').click();

  await expect(page.getByTestId('import-total')).toHaveText('7');
  await expect(page.getByTestId('import-ok')).toHaveText('3');
  await expect(page.getByTestId('import-dupes')).toHaveText('2');
  await expect(page.getByTestId('import-invalid')).toHaveText('2');
  await expect(page.getByTestId('import-warnings')).toHaveText('1');
  await expect(page.locator('[data-testid="import-row"][data-status="invalid"]')).toHaveCount(2);

  const before = (await (await request.get('/test/state')).json()).patients.length;
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('flash')).toContainText('Imported 3 patients');

  const state = await (await request.get('/test/state')).json();
  expect(state.patients.length).toBe(before + 3);
  const imported = state.patients.find(p => p.mobile === '9000000102');
  expect(imported.name).toBe('Import Two');
  expect(imported.dob).toBe('1988-12-31');
  expect(state.patients.some(p => p.mobile === '12345')).toBeFalsy();
  expect(state.audit.some(a => a.action === 'patient.import')).toBeTruthy();

  await page.goto('/patients?q=Import');
  await expect(page.getByTestId('patient-row')).toHaveCount(2);
});

test('TC-59 phone booking read-back', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-01&date=2026-10-21&time=12:00&patientId=P-1001');
  await page.getByTestId('book-confirm').click();
  const readback = page.getByTestId('readback');
  await expect(readback).toContainText('Dr. Asha Rao');
  await expect(readback).toContainText('Oct 2026');
  await expect(readback).toContainText('12:00 PM');
  await expect(page.getByTestId('appt-reference')).toContainText(/APT-\d{8}-\d{4}/);
  await expect(readback).toContainText('Read back doctor, date, time, and reference');
});

test('TC-39 backup and restore', async ({ page, request }) => {
  await login(page, 'admin');
  await page.goto('/settings');

  const before = await (await request.get('/test/state')).json();
  const backupRes = await page.request.get('/admin/backup.json');
  expect(backupRes.status()).toBe(200);
  expect(backupRes.headers()['content-disposition']).toContain('clinic-backup');
  const backup = await backupRes.text();

  await page.request.post('/api/book', {
    form: { patientId: 'P-1001', doctorId: 'D-01', start: '2026-10-21T12:00' }
  });
  const mutated = await (await request.get('/test/state')).json();
  expect(mutated.appointments.length).toBe(before.appointments.length + 1);

  await page.goto('/settings');
  await page.getByTestId('restore-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup)
  });
  const started = Date.now();
  await page.getByTestId('restore-run').click();
  await page.waitForURL(/\/settings\?msg=/);
  const restoreMs = Date.now() - started;

  const after = await (await request.get('/test/state')).json();
  expect(after.appointments.length).toBe(before.appointments.length);
  expect(after.patients.length).toBe(before.patients.length);
  expect(after.settings.horizonDays).toBe(before.settings.horizonDays);
  expect(after.audit.some(a => a.action === 'restore')).toBeTruthy();
  expect(restoreMs).toBeLessThan(4 * 60 * 60 * 1000);
  console.log('TC-39 restore ms:', restoreMs);
  await expect(page.getByTestId('flash')).toContainText('Backup restored');
});
