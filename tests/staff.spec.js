'use strict';

const { test, expect, resetDb, setClock, login, logout, apiBook } = require('./helpers');

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('TC-01 register a new patient', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/patients');
  await page.getByTestId('patient-name').fill('Test Patient');
  await page.getByTestId('patient-mobile').fill('9000000001');
  await page.getByTestId('patient-save').click();
  await expect(page.getByTestId('flash')).toContainText('Patient created');
  await expect(page).toHaveURL(/\/patients\/P-\d+/);
  await expect(page.getByTestId('patient-detail-mobile')).toHaveText('9000000001');
  await expect(page.getByText('not recorded')).toBeVisible();
});

test('TC-02 find patient by mobile and by name', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/patients?q=9922334455');
  await expect(page.getByTestId('patient-row')).toHaveCount(1);
  await expect(page.getByTestId('patient-row')).toContainText('Neha Verma');
  await expect(page.getByTestId('patient-row')).not.toContainText('—');

  await page.goto('/patients?q=Neha');
  await expect(page.getByTestId('patient-row')).toHaveCount(1);
  await expect(page.getByTestId('patient-row')).toContainText('Neha Verma');
});

test('TC-03 reject invalid mobile and warn on duplicate', async ({ page, request }) => {
  const before = (await (await request.get('/test/state')).json()).patients.length;
  await login(page, 'receptionist');
  await page.goto('/patients');

  await page.getByTestId('patient-name').fill('Bad Mobile');
  await page.getByTestId('patient-mobile').fill('12345');
  await page.getByTestId('patient-save').click();
  await expect(page.getByTestId('error')).toContainText('valid 10-digit mobile');

  await page.getByTestId('patient-name').fill('Rohan Copy');
  await page.getByTestId('patient-mobile').fill('9876543210');
  await page.getByTestId('patient-save').click();
  await expect(page.getByTestId('duplicate-warning')).toContainText('Rohan Mehta');

  await page.getByTestId('patient-confirm-duplicate').click();
  await expect(page.getByTestId('flash')).toContainText('Patient created');
  const state = await (await request.get('/test/state')).json();
  expect(state.patients.length).toBe(before + 1);
});

test('TC-04 define weekly availability', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/availability?doctorId=D-01');
  await page.getByTestId('avail-form-doctor').selectOption('D-01');
  await page.getByTestId('avail-weekday').selectOption('6');
  await page.getByTestId('avail-start').fill('09:00');
  await page.getByTestId('avail-end').fill('10:00');
  await page.getByTestId('avail-slot').selectOption('15');
  await page.getByTestId('avail-save').click();
  await expect(page.getByTestId('flash')).toContainText('Availability saved');
  await expect(page.getByTestId('avail-list')).toContainText('Saturday');

  await page.goto('/book?doctorId=D-01&date=2026-10-24');
  await expect(page.getByTestId('slot-09:00')).toBeVisible();
  await expect(page.getByTestId('slot-09:45')).toBeVisible();
  await expect(page.locator('a.slot')).toHaveCount(4);
});

test('TC-05 reject overlapping blocks and bad slot duration', async ({ page }) => {
  await login(page, 'admin');

  const overlap = await page.request.post('/availability', {
    form: { doctorId: 'D-01', weekday: '1', start: '12:00', end: '15:00', slotMinutes: '15' }
  });
  expect(overlap.status()).toBe(409);
  expect(await overlap.text()).toContain('overlaps an existing block');

  const bad = await page.request.post('/availability', {
    form: { doctorId: 'D-01', weekday: '1', start: '20:00', end: '21:00', slotMinutes: '25' }
  });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).toContain('Unsupported slot duration');
});

test('TC-06 slots generated from availability', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-01&date=2026-10-26');
  await expect(page.locator('a.slot')).toHaveCount(28);
  await expect(page.getByTestId('slot-09:00')).toBeVisible();
  await expect(page.getByTestId('slot-12:45')).toBeVisible();
  await expect(page.getByTestId('slot-13:00')).toHaveCount(0);
  await expect(page.getByTestId('slot-16:00')).toBeVisible();
});

test('TC-07 slots exclude booked, time off and holidays', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-01&date=2026-10-21');
  await expect(page.getByTestId('slot-10:00')).toHaveCount(0);
  await expect(page.getByTestId('slot-11:00')).toHaveCount(0);
  await expect(page.getByTestId('slot-12:00')).toBeVisible();

  await logout(page);
  await login(page, 'admin');
  await page.goto('/timeoff');
  await page.getByTestId('timeoff-doctor').selectOption('D-03');
  await page.getByTestId('timeoff-start').fill('2026-10-21');
  await page.getByTestId('timeoff-end').fill('2026-10-21');
  await page.getByTestId('timeoff-reason').fill('Conference');
  await page.getByTestId('timeoff-save').click();
  await expect(page.getByTestId('flash')).toContainText('Time off saved');

  await logout(page);
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-03&date=2026-10-21');
  await expect(page.getByTestId('no-slots')).toBeVisible();

  await page.goto('/book?doctorId=D-01&date=2026-10-22');
  await expect(page.getByTestId('no-slots')).toBeVisible();
});

test('TC-08 book an available slot', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-01&date=2026-10-21&time=12:00');
  await page.getByTestId('book-patient-search').fill('Rohan');
  await page.getByTestId('book-patient-search-submit').click();
  await page.getByTestId('book-patient-P-1001').click();
  await expect(page.getByTestId('selected-patient')).toContainText('Rohan Mehta');
  await page.getByTestId('book-confirm').click();

  await expect(page).toHaveURL(/\/appointments\/A-\d+/);
  await expect(page.getByTestId('appt-reference')).toContainText(/^APT-\d{8}-\d{4}$/);
  await expect(page.getByTestId('status')).toHaveText('Booked');
  await expect(page.getByTestId('appt-when')).toContainText('Oct 2026');
  await expect(page.getByTestId('appt-when')).toContainText('12:00 PM');

  await page.goto('/schedule?doctorId=D-01&date=2026-10-21');
  await expect(page.locator('tr[data-time="12:00"]')).toContainText('Rohan Mehta');
});

test('TC-09 reject past date and time', async ({ page }) => {
  await setClock(page.request, '2026-10-20T15:00');
  await login(page, 'receptionist');
  const sameDay = await apiBook(page.request, 'P-1001', 'D-01', '2026-10-20T14:30');
  expect(sameDay.status()).toBe(409);
  const pastDay = await apiBook(page.request, 'P-1001', 'D-01', '2026-10-19T10:00');
  expect(pastDay.status()).toBe(409);
  const state = await (await page.request.get('/test/state')).json();
  expect(state.appointments.some(a => a.slotStart === '2026-10-20T14:30')).toBeFalsy();
});

test('TC-10 reject double booking of the same slot', async ({ page }) => {
  await login(page, 'receptionist');
  const first = await apiBook(page.request, 'P-1004', 'D-01', '2026-10-21T12:00');
  expect(first.status()).toBe(201);
  const second = await apiBook(page.request, 'P-1005', 'D-01', '2026-10-21T12:00');
  expect(second.status()).toBe(409);
  expect(await second.text()).toContain('already booked');
});

test('TC-11 concurrent booking race', async ({ page, browser, request }) => {
  await setClock(request, '2026-10-20T08:00');
  const baseURL = test.info().project.use.baseURL;
  const make = async () => {
    const ctx = await browser.newContext({ baseURL });
    const res = await ctx.request.post('/login', {
      form: { email: 'receptionist@clinic.test', password: 'Clinic@2026' }
    });
    expect(res.ok()).toBeTruthy();
    return ctx;
  };
  const ctxA = await make();
  const ctxB = await make();
  const [a, b] = await Promise.all([
    ctxA.request.post('/api/book', { form: { patientId: 'P-1001', doctorId: 'D-02', start: '2026-10-21T10:00' } }),
    ctxB.request.post('/api/book', { form: { patientId: 'P-1002', doctorId: 'D-02', start: '2026-10-21T10:00' } })
  ]);
  const codes = [a.status(), b.status()].sort();
  expect(codes).toEqual([201, 409]);

  const state = await (await request.get('/test/state')).json();
  const active = state.appointments.filter(x =>
    x.doctorId === 'D-02' && x.slotStart === '2026-10-21T10:00' && ['Booked', 'Confirmed', 'Checked-in'].includes(x.status));
  expect(active.length).toBe(1);

  await login(page, 'receptionist');
  await page.goto('/schedule?doctorId=D-02&date=2026-10-21');
  await expect(page.locator('tr[data-time="10:00"]')).toContainText('Booked');
  await expect(page.locator('tr[data-time="10:00"]')).not.toContainText('Free');

  await ctxA.close();
  await ctxB.close();
});

test('TC-12 reject booking beyond horizon', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/settings');
  await page.getByTestId('set-horizon').fill('30');
  await page.getByTestId('set-save').click();
  await expect(page.getByTestId('flash')).toContainText('Settings saved');

  await logout(page);
  await login(page, 'receptionist');
  const beyond = await apiBook(page.request, 'P-1004', 'D-02', '2026-11-20T10:00');
  expect(beyond.status()).toBe(409);
  const inside = await apiBook(page.request, 'P-1004', 'D-02', '2026-11-19T10:00');
  expect(inside.status()).toBe(201);
});

test('TC-13 limit three active future appointments', async ({ page }) => {
  await login(page, 'receptionist');
  expect((await apiBook(page.request, 'P-1005', 'D-02', '2026-10-21T10:00')).status()).toBe(201);
  expect((await apiBook(page.request, 'P-1005', 'D-02', '2026-10-21T10:20')).status()).toBe(201);
  const third = await apiBook(page.request, 'P-1005', 'D-02', '2026-10-21T10:40');
  expect(third.status()).toBe(409);
  expect(await third.text()).toContain('3 upcoming appointments');
});

test('TC-14 reschedule to another slot', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/appointments/A-5');
  await page.getByTestId('reschedule-date').fill('2026-10-21');
  await page.getByTestId('reschedule-time').fill('12:00');
  await page.getByTestId('reschedule-submit').click();
  await expect(page.getByTestId('flash')).toContainText('rescheduled');
  await expect(page.getByTestId('appt-when')).toContainText('12:00 PM');

  await page.goto('/schedule?doctorId=D-01&date=2026-10-21');
  await expect(page.locator('tr[data-time="10:00"]')).toContainText('Free');
  await expect(page.locator('tr[data-time="12:00"]')).toContainText('Neha Verma');
});

test('TC-15 reject a third reschedule', async ({ page }) => {
  await login(page, 'receptionist');
  const one = await page.request.post('/api/reschedule', { form: { id: 'A-5', start: '2026-10-21T11:30' } });
  expect(one.status()).toBe(200);
  const two = await page.request.post('/api/reschedule', { form: { id: 'A-5', start: '2026-10-21T12:00' } });
  expect(two.status()).toBe(200);

  await page.goto('/appointments/A-5');
  await page.getByTestId('reschedule-time').fill('12:15');
  await page.getByTestId('reschedule-submit').click();
  await expect(page.getByTestId('page-error')).toContainText('Reschedule limit reached');
});

test('TC-16 cancel with reason', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/appointments/A-5');
  await page.getByTestId('cancel-reason').selectOption('Patient request');
  await page.getByTestId('cancel-submit').click();
  await expect(page.getByTestId('flash')).toContainText('cancelled');
  await expect(page.getByTestId('status')).toHaveText('Cancelled');
  await expect(page.getByTestId('appt-cancel-reason')).toHaveText('Patient request');

  await page.goto('/schedule?doctorId=D-01&date=2026-10-21');
  await expect(page.locator('tr[data-time="10:00"]')).toContainText('Free');
});

test('TC-17 cancellation cut-off by role', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/appointments/A-1');
  await page.getByTestId('cancel-reason').selectOption('Patient request');
  await page.getByTestId('cancel-submit').click();
  await expect(page.getByTestId('page-error')).toContainText('Cut-off passed');

  await logout(page);
  await login(page, 'admin');
  await page.goto('/appointments/A-1');
  await page.getByTestId('cancel-reason').selectOption('Doctor unavailable');
  await page.getByTestId('cancel-submit').click();
  await expect(page.getByTestId('flash')).toContainText('cancelled');
  await expect(page.getByTestId('status')).toHaveText('Cancelled');
});

test('TC-18 cancellation reason is mandatory', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/appointments/A-5');
  await page.getByTestId('cancel-submit').click();
  await expect(page.getByTestId('page-error')).toContainText('Select a cancellation reason');
  await page.goto('/appointments/A-5');
  await expect(page.getByTestId('status')).toHaveText('Booked');
});

test('TC-19 appointment lifecycle happy path', async ({ page }) => {
  await setClock(page.request, '2026-10-20T09:05');
  await login(page, 'doctor');
  await page.goto('/today');
  await page.getByTestId('checkin-A-1').click();
  await expect(page.getByTestId('status')).toHaveText('Checked-in');
  await page.getByTestId('btn-complete').click();
  await expect(page.getByTestId('status')).toHaveText('Completed');
});

test('TC-20 reject invalid status transitions', async ({ page }) => {
  await login(page, 'receptionist');
  const checkin = await page.request.post('/api/status', { form: { id: 'A-1', status: 'Checked-in' } });
  expect(checkin.status()).toBe(200);
  const early = await page.request.post('/api/status', { form: { id: 'A-1', status: 'Completed' } });
  expect(early.status()).toBe(409);
  expect(await early.text()).toContain('has not started');

  const cancelled = await page.request.post('/api/status', { form: { id: 'A-2', status: 'Completed' } });
  expect(cancelled.status()).toBe(409);
});

test('TC-24 day schedule view and filters', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/schedule?doctorId=D-01&date=2026-10-21');
  await expect(page.getByTestId('schedule-row')).toHaveCount(28);
  await expect(page.locator('tr[data-time="09:00"]')).toContainText('Free');
  await expect(page.locator('tr[data-time="10:00"]')).toContainText('Neha Verma');
  await expect(page.locator('tr[data-time="10:00"]')).toContainText('Booked');

  await page.getByTestId('schedule-doctor').selectOption('D-03');
  await page.getByTestId('schedule-date').fill('2026-10-20');
  await page.getByTestId('schedule-load').click();
  await expect(page.locator('tr[data-time="11:00"]')).toContainText('Completed');
});

test('TC-25 doctor sees only own daily list', async ({ page }) => {
  await login(page, 'doctor');
  await page.goto('/today');
  await expect(page.getByTestId('today-row')).toHaveCount(1);
  await expect(page.getByTestId('today-row')).toContainText('Sana Khan');

  const forbidden = await page.goto('/appointments/A-3');
  expect(forbidden.status()).toBe(403);
  await expect(page.getByTestId('forbidden')).toBeVisible();

  await page.goto('/schedule?doctorId=D-02&date=2026-10-21');
  await expect(page.getByTestId('schedule-doctor')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('Dr. Asha Rao');
  await expect(page.locator('body')).not.toContainText('Dr. Vikram Shah');
});

test('TC-26 walk-in registration', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/schedule?doctorId=D-01&date=2026-10-20');
  await page.getByTestId('walkin-create').click();
  await expect(page.getByTestId('flash')).toContainText('Walk-in registered');
  await expect(page.locator('body')).toContainText('Walk-in');
  await expect(page.getByTestId('status')).toHaveText('Booked');
});

test('TC-27 appointment search and filters', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/appointments?q=9922334455');
  await expect(page.getByTestId('appt-row')).toHaveCount(2);
  await expect(page.getByTestId('appt-row').first()).toContainText('Neha Verma');

  await page.goto('/appointments?status=Cancelled');
  await expect(page.getByTestId('appt-row')).toHaveCount(1);
  await expect(page.getByTestId('appt-row')).toContainText('Cancelled');

  await page.goto('/appointments?doctorId=D-03');
  await expect(page.getByTestId('appt-row')).toHaveCount(1);
  await expect(page.getByTestId('appt-row')).toContainText('Dr. Meera Iyer');

  await page.goto('/appointments?from=2026-10-21&to=2026-10-21');
  await expect(page.getByTestId('appt-row')).toHaveCount(2);
});

test('TC-28 role-based access matrix', async ({ page }) => {
  await login(page, 'receptionist');
  expect((await page.goto('/patients')).status()).toBe(200);
  expect((await page.goto('/settings')).status()).toBe(403);
  expect((await page.goto('/audit')).status()).toBe(403);

  await logout(page);
  await login(page, 'doctor');
  expect((await page.goto('/patients')).status()).toBe(403);
  expect((await page.goto('/settings')).status()).toBe(403);
  expect((await page.goto('/availability')).status()).toBe(200);

  await logout(page);
  await login(page, 'admin');
  expect((await page.goto('/settings')).status()).toBe(200);
  expect((await page.goto('/audit')).status()).toBe(200);
  expect((await page.goto('/call-list')).status()).toBe(200);

  await logout(page);
  await page.goto('/login');
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('login-email').fill('doctor@clinic.test');
    await page.getByTestId('login-password').fill('wrong-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('error')).toContainText('Invalid email or password');
  }
  await page.getByTestId('login-email').fill('doctor@clinic.test');
  await page.getByTestId('login-password').fill('Clinic@2026');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('error')).toContainText('Too many attempts');
});

test('TC-29 audit trail completeness', async ({ page }) => {
  await login(page, 'receptionist');
  await page.goto('/book?doctorId=D-01&date=2026-10-21&time=12:00&patientId=P-1001');
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('flash')).toContainText('Booked');

  await page.getByTestId('cancel-reason').selectOption('Patient request');
  await page.getByTestId('cancel-submit').click();
  await expect(page.getByTestId('flash')).toContainText('cancelled');

  await logout(page);
  await login(page, 'admin');
  await page.goto('/audit');
  const rows = page.getByTestId('audit-row');
  await expect(rows.filter({ hasText: 'receptionist@clinic.test' }).first()).toBeVisible();
  await expect(page.getByTestId('audit-table')).toContainText('create');
  await expect(page.getByTestId('audit-table')).toContainText('cancel');
  await expect(page.getByTestId('audit-table')).toContainText('A-');
});

test('TC-33 block time off that orphans appointments', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/timeoff');
  await page.getByTestId('timeoff-doctor').selectOption('D-01');
  await page.getByTestId('timeoff-start').fill('2026-10-21');
  await page.getByTestId('timeoff-end').fill('2026-10-21');
  await page.getByTestId('timeoff-reason').fill('Conference');
  await page.getByTestId('timeoff-save').click();
  await expect(page.getByTestId('error')).toContainText('active appointments overlap');
  await expect(page.getByTestId('conflict-list').locator('li')).toHaveCount(2);
});
