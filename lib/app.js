'use strict';

const crypto = require('crypto');
const querystring = require('querystring');
const db = require('./db');
const c = require('./clinic');
const passwords = require('./passwords');
const importer = require('./importer');
const { esc, fmtDate, fmtDateTime, fmtTime, badge, layout } = require('./html');

const sessions = new Map();
const logs = [];
const importJobs = new Map();
const loginAttempts = new Map();
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// Firebase Hosting only forwards this cookie name to the backend.
const SESSION_COOKIE = '__session';

const CANCEL_REASONS = ['Patient request', 'Doctor unavailable', 'Emergency', 'Rescheduled elsewhere', 'Other'];

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers || {}));
  res.end(body);
}

function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function redirect(res, location, msg) {
  let target = location;
  if (msg) target += (target.includes('?') ? '&' : '?') + 'msg=' + encodeURIComponent(msg);
  res.writeHead(303, { Location: target });
  res.end();
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  const idleMs = db.data.settings.sessionIdleMinutes * 60000;
  if (Date.now() - s.lastSeen > idleMs) {
    sessions.delete(sid);
    return null;
  }
  s.lastSeen = Date.now();
  return c.user(s.userId) || null;
}

function page(res, status, title, user, body, opts) {
  const o = opts || {};
  send(res, status, layout({
    title, user, body,
    msg: o.msg, error: o.error
  }));
}

function forbid(res, user) {
  page(res, 403, 'No access', user,
    `<section class="card" data-testid="forbidden">
      <h1>No access</h1>
      <p>Your role does not allow this action.</p>
    </section>`, {});
}

function readBody(req) {
  // Firebase Functions may hand over an already parsed body.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (req.rawBody) return Promise.resolve(querystring.parse(req.rawBody.toString('utf8')));
  if (req.bodyBuffer) return Promise.resolve(querystring.parse(req.bodyBuffer.toString('utf8')));
  return new Promise(resolve => {
    if (req.readableEnded) return resolve({});
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 25e6) req.destroy(); });
    req.on('end', () => resolve(querystring.parse(raw)));
    req.on('error', () => resolve({}));
  });
}

function readRaw(req) {
  if (req.rawBody) return Promise.resolve(req.rawBody.toString('utf8'));
  if (req.bodyBuffer && req.bodyBuffer.length) return Promise.resolve(req.bodyBuffer.toString('utf8'));
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise(resolve => {
    if (req.readableEnded) return resolve('');
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 20e6) { raw = ''; req.destroy(); }
    });
    req.on('end', () => resolve(raw));
    req.on('error', () => resolve(''));
  });
}

function patientName(id) {
  const p = c.patient(id);
  return p ? p.name : 'Unknown';
}

function doctorName(id) {
  const d = c.doctor(id);
  return d ? d.name : 'Unknown';
}

function parseDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : c.today();
}

function statusOptions(selected) {
  return ['', 'Booked', 'Confirmed', 'Checked-in', 'Completed', 'No-show', 'Cancelled']
    .map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s || 'Any status'}</option>`)
    .join('');
}

function doctorOptions(list, selected, testid) {
  return `<select name="doctorId" data-testid="${testid}">
    ${list.map(d => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.name)} · ${esc(d.specialty)}</option>`).join('')}
  </select>`;
}

// ---------- pages ----------

function loginPage(user, error) {
  return layout({
    title: 'Sign in',
    user: null,
    error,
    body: `
    <section class="card narrow">
      <h1>Clinic Desk sign in</h1>
      <form method="post" action="/login" data-testid="login-form">
        <label>Email <input name="email" type="email" data-testid="login-email" required autofocus></label>
        <label>Password <input name="password" type="password" data-testid="login-password" required></label>
        <button data-testid="login-submit">Sign in</button>
      </form>
      <p class="hint">Reception: receptionist@clinic.test · Doctor: doctor@clinic.test · Admin: admin@clinic.test · Password: Clinic@2026</p>
    </section>`
  });
}

function loginState(email) {
  const rec = loginAttempts.get(email);
  if (!rec) return { count: 0, blockedUntil: 0, firstAt: 0 };
  if (Date.now() - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(email);
    return { count: 0, blockedUntil: 0, firstAt: 0 };
  }
  return rec;
}

function noteLoginFailure(email) {
  const rec = loginState(email);
  rec.count += 1;
  rec.firstAt = rec.firstAt || Date.now();
  if (rec.count >= MAX_LOGIN_FAILURES) rec.blockedUntil = Date.now() + LOGIN_WINDOW_MS;
  loginAttempts.set(email, rec);
}

function dashboard(user) {
  const today = c.today();
  const mine = db.data.appointments.filter(a => c.dateOf(a.slotStart) === today);
  const callRows = c.callList(c.addDays(today, 1), null);
  const stats = `
    <div class="stats">
      <div class="stat"><b>${mine.length}</b><span>appointments today</span></div>
      <div class="stat"><b>${callRows.length}</b><span>calls for tomorrow</span></div>
      <div class="stat"><b>${db.data.patients.length}</b><span>patients</span></div>
    </div>`;
  return `
    <h1>Good day, ${esc(user.name.split(' ')[0])}</h1>
    <p class="muted">Today is ${fmtDate(today)} · clock ${esc(c.now().replace('T', ' '))}</p>
    ${stats}
    <section class="card">
      <h2>Quick actions</h2>
      <p><a class="btn" href="/book" data-testid="quick-book">Book an appointment</a>
      <a class="btn ghost" href="/schedule" data-testid="quick-schedule">Open schedule</a>
      ${user.role !== 'doctor' ? '<a class="btn ghost" href="/call-list" data-testid="quick-calllist">Next-day call list</a>' : ''}</p>
    </section>`;
}

function patientsPage(user, q, warning, error, draft) {
  const d = draft || {};
  const query = (q || '').trim().toLowerCase();
  let list = db.data.patients;
  if (query) {
    list = list.filter(p => p.name.toLowerCase().includes(query) || p.mobile.includes(query));
  }
  const rows = list.map(p => {
    const next = db.data.appointments
      .filter(a => a.patientId === p.id && c.ACTIVE.has(a.status) && a.slotStart >= c.now())
      .sort((a, b) => a.slotStart.localeCompare(b.slotStart))[0];
    return `<tr data-testid="patient-row" data-patient="${esc(p.id)}">
      <td><a href="/patients/${esc(p.id)}">${esc(p.name)}</a></td>
      <td data-testid="patient-mobile-cell">${esc(p.mobile)}</td>
      <td>${esc(p.dob || '—')}</td>
      <td>${next ? fmtDateTime(next.slotStart) : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <h1>Patients</h1>
    <form method="get" action="/patients" class="row" data-testid="patient-search-form">
      <input name="q" value="${esc(q || '')}" placeholder="Search by name or mobile" data-testid="patient-search">
      <button data-testid="patient-search-submit">Search</button>
    </form>
    ${warning ? `<div class="flash warn" data-testid="duplicate-warning">${esc(warning)}</div>` : ''}
    <table data-testid="patient-list">
      <thead><tr><th>Name</th><th>Mobile</th><th>Date of birth</th><th>Next appointment</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No patients found</td></tr>'}</tbody>
    </table>
    <section class="card">
      <h2>New patient</h2>
      <form method="post" action="/patients" data-testid="patient-form">
        <div class="grid">
          <label>Full name <input name="name" value="${esc(d.name || '')}" data-testid="patient-name" required></label>
          <label>Mobile <input name="mobile" value="${esc(d.mobile || '')}" data-testid="patient-mobile" required></label>
          <label>Date of birth (optional) <input type="date" name="dob" value="${esc(d.dob || '')}" data-testid="patient-dob"></label>
          <label>Gender
            <select name="gender" data-testid="patient-gender">
              <option ${d.gender === 'Female' || !d.gender ? 'selected' : ''}>Female</option>
              <option ${d.gender === 'Male' ? 'selected' : ''} value="Male">Male</option>
              <option ${d.gender === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </label>
          <label>Email (optional) <input type="email" name="email" value="${esc(d.email || '')}" data-testid="patient-email"></label>
        </div>
        <input type="hidden" name="confirmDuplicate" value="">
        <button data-testid="patient-save">Save patient</button>
        ${warning ? '<button class="warnbtn" name="confirmDuplicate" value="1" data-testid="patient-confirm-duplicate">Create anyway</button>' : ''}
      </form>
    </section>`;
}

function patientDetail(user, p) {
  const appts = db.data.appointments
    .filter(a => a.patientId === p.id)
    .sort((a, b) => b.slotStart.localeCompare(a.slotStart));
  const rows = appts.map(a => `<tr data-testid="patient-appt-row">
      <td>${esc(a.reference)}</td>
      <td>${fmtDateTime(a.slotStart)}</td>
      <td>${esc(doctorName(a.doctorId))}</td>
      <td>${badge(a.status)}</td>
      <td><a href="/appointments/${esc(a.id)}">Open</a></td>
    </tr>`).join('');
  return `
    <p><a href="/patients">← Patients</a></p>
    <h1>${esc(p.name)}</h1>
    <section class="card">
      <p><b>Mobile:</b> <span data-testid="patient-detail-mobile">${esc(p.mobile)}</span> ·
         <b>DOB:</b> ${esc(p.dob || 'not recorded')} · <b>Gender:</b> ${esc(p.gender)}</p>
      <p><a class="btn" href="/book?patientId=${esc(p.id)}" data-testid="patient-book">Book appointment</a></p>
    </section>
    <h2>Appointments</h2>
    <table><thead><tr><th>Reference</th><th>When</th><th>Doctor</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No appointments yet</td></tr>'}</tbody></table>`;
}

function importPage(user, msg, error) {
  return `
    <h1>Import patients</h1>
    <p class="muted">Paste a CSV export or choose a file. Nothing is saved until you confirm the preview.</p>
    <section class="card">
      <h2>Accepted columns</h2>
      <p class="muted">Header row required. Column names are matched loosely, for example
        <code>Name</code>, <code>Mobile</code>, <code>DOB</code>, <code>Gender</code>, <code>Email</code>.
        Date of birth accepts YYYY-MM-DD or DD/MM/YYYY and is optional.</p>
      <pre class="sample">Name,Mobile,DOB,Gender,Email
Rohan Mehta,9876543210,1985-04-12,Male,rohan@example.com
Sana Khan,9812345678,30/11/1992,Female,</pre>
      <form method="post" action="/import/preview" data-testid="import-form">
        <label>CSV data
          <textarea name="text" rows="10" data-testid="import-text" placeholder="Paste CSV here"></textarea>
        </label>
        <label>Or choose a file
          <input type="file" id="import-file" accept=".csv,text/csv" data-testid="import-file">
        </label>
        <button data-testid="import-preview">Preview import</button>
      </form>
    </section>
    <script>
      document.getElementById('import-file').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        document.querySelector('[data-testid="import-text"]').value = await file.text();
      });
    </script>`;
}

function importPreviewPage(user, analysis, token) {
  const s = analysis.summary;
  const statusLabel = { import: 'Will import', duplicate: 'Duplicate', invalid: 'Invalid' };
  const rows = analysis.rows.slice(0, 200).map(r => `
    <tr data-testid="import-row" data-status="${esc(r.status)}">
      <td>${r.line}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.mobile)}</td>
      <td>${esc(r.dob || '—')}</td>
      <td>${esc(r.gender)}</td>
      <td><span class="badge badge-${r.status === 'import' ? 'confirmed' : r.status === 'duplicate' ? 'checkedin' : 'cancelled'}">${statusLabel[r.status]}</span></td>
      <td>${esc(r.problems.join('; ') || '—')}</td>
    </tr>`).join('');

  return `
    <p><a href="/import">← Import</a></p>
    <h1>Import preview</h1>
    <div class="stats">
      <div class="stat"><b data-testid="import-total">${s.total}</b><span>rows</span></div>
      <div class="stat"><b data-testid="import-ok">${s.importable}</b><span>to import</span></div>
      <div class="stat"><b data-testid="import-dupes">${s.duplicates}</b><span>duplicates</span></div>
      <div class="stat"><b data-testid="import-invalid">${s.invalid}</b><span>invalid</span></div>
      <div class="stat"><b data-testid="import-warnings">${s.warnings}</b><span>warnings</span></div>
    </div>
    <table data-testid="import-table">
      <thead><tr><th>Line</th><th>Name</th><th>Mobile</th><th>DOB</th><th>Gender</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">No data rows found</td></tr>'}</tbody>
    </table>
    <p class="muted">Showing ${Math.min(200, analysis.rows.length)} of ${analysis.rows.length} rows.</p>
    ${s.importable ? `
      <form method="post" action="/import/confirm" data-testid="import-confirm-form">
        <input type="hidden" name="token" value="${esc(token)}">
        <button data-testid="import-confirm">Confirm import of ${s.importable} patients</button>
      </form>` : '<p class="flash warn" data-testid="import-none">Nothing can be imported from this file.</p>'}`;
}

function availabilityPage(user, selectedDoctor, error) {
  const isAdmin = user.role === 'admin';
  const docId = isAdmin ? (selectedDoctor || db.data.doctors[0].id) : user.doctorId;
  const blocks = db.data.availability.filter(a => a.doctorId === docId);
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const rows = blocks.map(b => `<tr data-testid="avail-block">
      <td>${weekdays[b.weekday]}</td>
      <td>${esc(b.start)}–${esc(b.end)}</td>
      <td>${b.slotMinutes} min</td>
      <td><form method="post" action="/availability/${esc(b.id)}/delete" class="inline">
        <button class="link" data-testid="avail-delete">Remove</button></form></td>
    </tr>`).join('');

  return `
    <h1>Weekly availability</h1>
    ${isAdmin ? `<form method="get" action="/availability" class="row">
      <label>Doctor ${doctorOptions(db.data.doctors, docId, 'avail-doctor')}</label>
      <button data-testid="avail-load">Load</button>
    </form>` : `<p class="muted">Doctor: ${esc(doctorName(docId))}</p>`}
    <table data-testid="avail-list">
      <thead><tr><th>Day</th><th>Hours</th><th>Slot</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No availability yet</td></tr>'}</tbody>
    </table>
    <section class="card">
      <h2>Add block</h2>
      <form method="post" action="/availability" data-testid="avail-form">
        ${isAdmin ? `<label>Doctor ${doctorOptions(db.data.doctors, docId, 'avail-form-doctor')}</label>` : ''}
        <div class="grid">
          <label>Day
            <select name="weekday" data-testid="avail-weekday">
              ${weekdays.map((w, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${w}</option>`).join('')}
            </select>
          </label>
          <label>Start <input type="time" name="start" value="09:00" data-testid="avail-start"></label>
          <label>End <input type="time" name="end" value="13:00" data-testid="avail-end"></label>
          <label>Slot minutes
            <select name="slotMinutes" data-testid="avail-slot">
              ${[10, 15, 20, 30, 45, 60].map(n => `<option ${n === 15 ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>
        </div>
        ${isAdmin ? '' : `<input type="hidden" name="doctorId" value="${esc(docId)}">`}
        <button data-testid="avail-save">Add block</button>
      </form>
    </section>`;
}

function timeoffPage(user, message, error) {
  const isAdmin = user.role === 'admin';
  const docId = isAdmin ? (user.doctorId || db.data.doctors[0].id) : user.doctorId;
  const rows = db.data.timeOff
    .filter(t => isAdmin || t.doctorId === user.doctorId)
    .map(t => `<tr data-testid="timeoff-row">
      <td>${esc(doctorName(t.doctorId))}</td>
      <td>${esc(t.startDate)} → ${esc(t.endDate)}</td>
      <td>${esc(t.reason)}</td>
    </tr>`).join('');
  return `
    <h1>Time off</h1>
    ${message ? `<div class="flash warn" data-testid="timeoff-blocked">${message}</div>` : ''}
    <section class="card">
      <form method="post" action="/timeoff" data-testid="timeoff-form">
        ${isAdmin ? `<label>Doctor ${doctorOptions(db.data.doctors, docId, 'timeoff-doctor')}</label>` : ''}
        <div class="grid">
          <label>From <input type="date" name="startDate" value="${esc(c.today())}" data-testid="timeoff-start"></label>
          <label>To <input type="date" name="endDate" value="${esc(c.today())}" data-testid="timeoff-end"></label>
          <label>Reason <input name="reason" data-testid="timeoff-reason" placeholder="Conference"></label>
        </div>
        <button data-testid="timeoff-save">Save time off</button>
      </form>
    </section>
    <h2>Registered time off</h2>
    <table><thead><tr><th>Doctor</th><th>Dates</th><th>Reason</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">None</td></tr>'}</tbody></table>`;
}

function bookPage(user, q) {
  const doctors = db.data.doctors;
  const doctorId = doctors.some(d => d.id === q.doctorId) ? q.doctorId : doctors[0].id;
  const date = parseDate(q.date);
  const time = q.time || '';
  const slots = c.slotsFor(doctorId, date);

  const slotHtml = slots.length
    ? `<div class="slots" data-testid="slot-grid">${slots.map(s =>
        `<a class="slot ${s.time === time ? 'selected' : ''}" data-testid="slot-${s.time}"
            href="/book?doctorId=${encodeURIComponent(doctorId)}&date=${date}&time=${encodeURIComponent(s.time)}">${esc(fmtTime(s.start))}</a>`
      ).join('')}</div>`
    : '<p class="flash warn" data-testid="no-slots">No bookable slots for this doctor and date.</p>';

  let patientPicker = '';
  if (time) {
    const query = (q.q || '').trim().toLowerCase();
    const results = query
      ? db.data.patients.filter(p => p.name.toLowerCase().includes(query) || p.mobile.includes(query))
      : [];
    const selected = q.patientId ? c.patient(q.patientId) : null;
    patientPicker = `
      <section class="card" data-testid="booking-panel">
        <h2>Confirm booking</h2>
        <p>Slot: <b data-testid="selected-slot">${esc(fmtDate(date))} at ${esc(fmtTime(date + 'T' + time))}</b></p>
        <form method="get" action="/book" class="row">
          <input type="hidden" name="doctorId" value="${esc(doctorId)}">
          <input type="hidden" name="date" value="${date}">
          <input type="hidden" name="time" value="${esc(time)}">
          <input name="q" value="${esc(q.q || '')}" placeholder="Find patient by name or mobile" data-testid="book-patient-search">
          <button data-testid="book-patient-search-submit">Find</button>
        </form>
        ${results.length ? `<ul class="picker" data-testid="book-patient-results">${results.map(p =>
          `<li><a data-testid="book-patient-${esc(p.id)}"
             href="/book?doctorId=${encodeURIComponent(doctorId)}&date=${date}&time=${encodeURIComponent(time)}&patientId=${esc(p.id)}">
             ${esc(p.name)} · ${esc(p.mobile)} · ${esc(p.dob || 'no DOB')}</a></li>`).join('')}</ul>` : ''}
        ${selected ? `<p data-testid="selected-patient">Selected: <b>${esc(selected.name)}</b> (${esc(selected.mobile)})</p>
          <form method="post" action="/book" data-testid="book-form">
            <input type="hidden" name="doctorId" value="${esc(doctorId)}">
            <input type="hidden" name="date" value="${date}">
            <input type="hidden" name="time" value="${esc(time)}">
            <input type="hidden" name="patientId" value="${esc(selected.id)}">
            <button data-testid="book-confirm">Confirm appointment</button>
          </form>`
        : '<p class="muted">Search and select a patient to continue.</p>'}
      </section>`;
  }

  return `
    <h1>Book an appointment</h1>
    <form method="get" action="/book" class="row" data-testid="book-filter">
      <label>Doctor ${doctorOptions(doctors, doctorId, 'book-doctor')}</label>
      <label>Date <input type="date" name="date" value="${date}" data-testid="book-date"></label>
      <button data-testid="book-load">Load slots</button>
    </form>
    ${slotHtml}
    ${patientPicker}`;
}

function schedulePage(user, q) {
  const isDoctor = user.role === 'doctor';
  const doctors = db.data.doctors.filter(d => !isDoctor || d.id === user.doctorId);
  const doctorId = isDoctor ? user.doctorId : (doctors.some(d => d.id === q.doctorId) ? q.doctorId : doctors[0].id);
  const date = parseDate(q.date);
  const slots = c.gridSlots(doctorId, date);
  const appts = db.data.appointments.filter(a => a.doctorId === doctorId && c.dateOf(a.slotStart) === date);

  const rows = slots.map(s => {
    const a = appts.find(x => x.slotStart === s.start && x.status !== 'Cancelled');
    return `<tr data-testid="schedule-row" data-time="${s.time}">
      <td>${esc(fmtTime(s.start))}</td>
      <td>${a ? `<a href="/appointments/${esc(a.id)}" data-testid="schedule-patient">${esc(patientName(a.patientId))}</a>` : '<span class="muted">Free</span>'}</td>
      <td>${a ? badge(a.status) : ''}</td>
      <td>${a ? `<a href="/appointments/${esc(a.id)}">Open</a>` : `<a href="/book?doctorId=${esc(doctorId)}&date=${date}&time=${encodeURIComponent(s.time)}">Book</a>`}</td>
    </tr>`;
  }).join('');

  const walkIn = (!isDoctor && date === c.today())
    ? `<form method="post" action="/walkin" class="row" data-testid="walkin-form">
         <input type="hidden" name="doctorId" value="${esc(doctorId)}">
         <button data-testid="walkin-create">Register walk-in</button>
       </form>` : '';

  return `
    <h1>Day schedule</h1>
    <form method="get" action="/schedule" class="row" data-testid="schedule-filter">
      ${isDoctor ? '' : `<label>Doctor ${doctorOptions(doctors, doctorId, 'schedule-doctor')}</label>`}
      <label>Date <input type="date" name="date" value="${date}" data-testid="schedule-date"></label>
      <button data-testid="schedule-load">Load</button>
    </form>
    ${walkIn}
    <table data-testid="schedule-table">
      <thead><tr><th>Time</th><th>Patient</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No slots</td></tr>'}</tbody>
    </table>`;
}

function appointmentPage(user, a, msg) {
  const p = c.patient(a.patientId);
  const active = c.ACTIVE.has(a.status);
  const canCancel = active && (user.role === 'admin' || user.role === 'receptionist');
  const canReschedule = active && (user.role === 'admin' || user.role === 'receptionist');
  const isDoctorOwner = user.role === 'doctor' && user.doctorId === a.doctorId;

  const statusButtons = [];
  if (active) {
    if (a.status === 'Booked' && (user.role !== 'doctor' || isDoctorOwner)) {
      statusButtons.push(`<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="Confirmed"><button data-testid="btn-confirm">Confirm</button></form>`);
    }
    if ((a.status === 'Booked' || a.status === 'Confirmed') && (user.role !== 'doctor' || isDoctorOwner)) {
      statusButtons.push(`<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="Checked-in"><button data-testid="btn-checkin">Check in</button></form>`);
    }
    if ((a.status === 'Checked-in' || a.status === 'Confirmed') && (user.role !== 'doctor' || isDoctorOwner)) {
      statusButtons.push(`<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="Completed"><button data-testid="btn-complete">Complete</button></form>`);
      statusButtons.push(`<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="No-show"><button data-testid="btn-noshow">No-show</button></form>`);
    }
  }

  return `
    <p><a href="/schedule?doctorId=${esc(a.doctorId)}&date=${c.dateOf(a.slotStart)}">← Back to schedule</a></p>
    <h1>Appointment <span data-testid="appt-reference">${esc(a.reference)}</span></h1>
    <section class="card" data-testid="readback">
      <p><b>Patient:</b> <span data-testid="appt-patient">${esc(p ? p.name : 'Unknown')}</span> · ${esc(p ? p.mobile : '')}</p>
      <p><b>Doctor:</b> <span data-testid="appt-doctor">${esc(doctorName(a.doctorId))}</span></p>
      <p><b>When:</b> <span data-testid="appt-when">${fmtDateTime(a.slotStart)}</span></p>
      <p><b>Status:</b> <span data-testid="appt-status-wrap">${badge(a.status)}</span></p>
      ${a.channel === 'walk-in' ? '<p><span class="badge">Walk-in</span></p>' : ''}
      ${a.status === 'Cancelled' ? `<p><b>Cancel reason:</b> <span data-testid="appt-cancel-reason">${esc(a.cancelReason)}</span></p>` : ''}
      <p class="muted">Read back doctor, date, time, and reference before ending a phone call.</p>
    </section>
    ${statusButtons.length ? `<section class="card"><h2>Visit status</h2><p class="actions">${statusButtons.join('')}</p></section>` : ''}
    ${canReschedule ? `
      <section class="card">
        <h2>Reschedule</h2>
        <form method="post" action="/appointments/${a.id}/reschedule" class="row" data-testid="reschedule-form">
          <label>New date <input type="date" name="date" value="${c.dateOf(a.slotStart)}" data-testid="reschedule-date"></label>
          <label>New time <input type="time" name="time" value="${a.slotStart.split('T')[1]}" data-testid="reschedule-time"></label>
          <button data-testid="reschedule-submit">Reschedule</button>
        </form>
        <p class="muted">Reschedules used: ${a.rescheduleCount} of 2.</p>
      </section>` : ''}
    ${canCancel ? `
      <section class="card">
        <h2>Cancel</h2>
        <form method="post" action="/appointments/${a.id}/cancel" data-testid="cancel-form">
          <label>Reason
            <select name="reason" data-testid="cancel-reason">
              <option value="">Select a cancellation reason</option>
              ${CANCEL_REASONS.map(r => `<option>${esc(r)}</option>`).join('')}
            </select>
          </label>
          <label>Note (optional) <input name="note" data-testid="cancel-note"></label>
          <button data-testid="cancel-submit">Cancel appointment</button>
        </form>
      </section>` : ''}
    ${msg ? '' : ''}`;
}

function appointmentsPage(user, q) {
  const doctors = db.data.doctors;
  let list = db.data.appointments.slice();
  if (user.role === 'doctor') list = list.filter(a => a.doctorId === user.doctorId);
  if (q.q) {
    const term = q.q.toLowerCase();
    list = list.filter(a => {
      const p = c.patient(a.patientId);
      return a.reference.toLowerCase().includes(term) ||
        (p && (p.name.toLowerCase().includes(term) || p.mobile.includes(term)));
    });
  }
  if (q.doctorId) list = list.filter(a => a.doctorId === q.doctorId);
  if (q.from) list = list.filter(a => c.dateOf(a.slotStart) >= q.from);
  if (q.to) list = list.filter(a => c.dateOf(a.slotStart) <= q.to);
  if (q.status) list = list.filter(a => a.status === q.status);
  list.sort((a, b) => a.slotStart.localeCompare(b.slotStart));

  const rows = list.map(a => `<tr data-testid="appt-row">
      <td><a href="/appointments/${esc(a.id)}">${esc(a.reference)}</a></td>
      <td>${fmtDateTime(a.slotStart)}</td>
      <td>${esc(patientName(a.patientId))}</td>
      <td>${esc(doctorName(a.doctorId))}</td>
      <td>${badge(a.status)}</td>
    </tr>`).join('');

  return `
    <h1>Appointments</h1>
    <form method="get" action="/appointments" class="filters" data-testid="appt-filter">
      <input name="q" value="${esc(q.q || '')}" placeholder="Patient name, mobile, or reference" data-testid="appt-q">
      <select name="doctorId" data-testid="appt-doctor">
        <option value="">Any doctor</option>
        ${doctors.map(d => `<option value="${d.id}" ${q.doctorId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
      </select>
      <input type="date" name="from" value="${esc(q.from || '')}" data-testid="appt-from">
      <input type="date" name="to" value="${esc(q.to || '')}" data-testid="appt-to">
      <select name="status" data-testid="appt-status">${statusOptions(q.status || '')}</select>
      <button data-testid="appt-search">Search</button>
    </form>
    <p class="muted" data-testid="appt-count">${list.length} appointments</p>
    <table data-testid="appt-table">
      <thead><tr><th>Reference</th><th>When</th><th>Patient</th><th>Doctor</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No appointments found</td></tr>'}</tbody>
    </table>`;
}

function todayPage(user) {
  const list = db.data.appointments
    .filter(a => a.doctorId === user.doctorId && c.dateOf(a.slotStart) === c.today() && a.status !== 'Cancelled')
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const rows = list.map(a => `<tr data-testid="today-row">
      <td>${esc(fmtTime(a.slotStart))}</td>
      <td>${esc(patientName(a.patientId))}</td>
      <td>${badge(a.status)}</td>
      <td class="actions">
        ${(a.status === 'Booked' || a.status === 'Confirmed') ? `<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="Checked-in"><button data-testid="checkin-${esc(a.id)}">Check in</button></form>` : ''}
        ${a.status === 'Checked-in' ? `<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="Completed"><button data-testid="complete-${esc(a.id)}">Complete</button></form>` : ''}
        ${(a.status === 'Booked' || a.status === 'Confirmed' || a.status === 'Checked-in') ? `<form method="post" action="/appointments/${a.id}/status" class="inline"><input type="hidden" name="status" value="No-show"><button data-testid="noshow-${esc(a.id)}">No-show</button></form>` : ''}
        <a href="/appointments/${esc(a.id)}">Open</a>
      </td>
    </tr>`).join('');
  return `
    <h1>Today · ${esc(doctorName(user.doctorId))}</h1>
    <p class="muted">${fmtDate(c.today())}</p>
    <table data-testid="today-table">
      <thead><tr><th>Time</th><th>Patient</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No appointments today</td></tr>'}</tbody>
    </table>`;
}

function callListPage(user, q) {
  const date = parseDate(q.date || c.addDays(c.today(), 1));
  const doctorId = q.doctorId || '';
  const list = c.callList(date, doctorId);
  const rows = list.map(a => `<tr data-testid="calllist-row">
      <td>${esc(fmtTime(a.slotStart))}</td>
      <td>${esc(patientName(a.patientId))}</td>
      <td>${esc((c.patient(a.patientId) || {}).mobile || '')}</td>
      <td>${esc(doctorName(a.doctorId))}</td>
      <td>${esc(a.reference)}</td>
    </tr>`).join('');
  return `
    <h1>Next-day call list</h1>
    <form method="get" action="/call-list" class="row" data-testid="calllist-filter">
      <label>Date <input type="date" name="date" value="${date}" data-testid="calllist-date"></label>
      <label>Doctor
        <select name="doctorId" data-testid="calllist-doctor">
          <option value="">All doctors</option>
          ${db.data.doctors.map(d => `<option value="${d.id}" ${doctorId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </label>
      <button data-testid="calllist-generate">Generate</button>
      <button type="button" class="ghost" onclick="window.print()" data-testid="calllist-print">Print</button>
    </form>
    <p class="muted">${list.length} calls for ${fmtDate(date)}</p>
    <table data-testid="calllist-table">
      <thead><tr><th>Time</th><th>Patient</th><th>Mobile</th><th>Doctor</th><th>Reference</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No calls for this date</td></tr>'}</tbody>
    </table>`;
}

function reportsPage(user, q) {
  const date = parseDate(q.date);
  const rows = c.dailyReport(date).map(r => `<tr data-testid="report-row-${esc(r.doctor.id)}">
      <td>${esc(r.doctor.name)}</td>
      <td>${r.total}</td>
      <td>${r.booked}</td>
      <td>${r.confirmed}</td>
      <td>${r.checkedIn}</td>
      <td>${r.completed}</td>
      <td>${r.noShow}</td>
      <td>${r.cancelled}</td>
    </tr>`).join('');
  return `
    <h1>Daily report</h1>
    <form method="get" action="/reports" class="row" data-testid="report-filter">
      <label>Date <input type="date" name="date" value="${date}" data-testid="report-date"></label>
      <button data-testid="report-generate">Generate</button>
      <a class="btn ghost" href="/reports/daily.csv?date=${date}" data-testid="report-csv">Download CSV</a>
    </form>
    <table data-testid="report-table">
      <thead><tr><th>Doctor</th><th>Total</th><th>Booked</th><th>Confirmed</th><th>Checked in</th><th>Completed</th><th>No-show</th><th>Cancelled</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function settingsPage(user) {
  const s = db.data.settings;
  return `
    <h1>Clinic settings</h1>
    <section class="card">
      <form method="post" action="/settings" data-testid="settings-form">
        <div class="grid">
          <label>Booking horizon (days) <input type="number" name="horizonDays" value="${s.horizonDays}" data-testid="set-horizon"></label>
          <label>Call-list lead (hours) <input type="number" name="callListLeadHours" value="${s.callListLeadHours}" data-testid="set-lead"></label>
          <label>Session idle (minutes) <input type="number" step="0.01" min="0" name="sessionIdleMinutes" value="${s.sessionIdleMinutes}" data-testid="set-session"></label>
          <label>Holidays (comma separated) <input name="holidays" value="${esc(s.holidays.join(','))}" data-testid="set-holidays"></label>
        </div>
        <button data-testid="set-save">Save settings</button>
      </form>
    </section>
    <p class="muted">Slot durations, working hours, and per-doctor availability are managed on the availability page.</p>
    <section class="card">
      <h2>Backup and restore</h2>
      <p><a class="btn" href="/admin/backup.json" data-testid="backup-download">Download backup</a></p>
      <p class="muted">The file contains all clinic data. Store it encrypted.</p>
      <h3>Restore from backup</h3>
      <label>Backup file <input type="file" id="restore-file" accept="application/json" data-testid="restore-file"></label>
      <button type="button" onclick="restoreBackup()" data-testid="restore-run">Restore from file</button>
      <p class="muted">Restore replaces every patient, appointment, setting and audit entry. Use only during a planned recovery.</p>
      <p data-testid="restore-status"></p>
    </section>
    <script>
      async function restoreBackup() {
        const input = document.getElementById('restore-file');
        const status = document.querySelector('[data-testid="restore-status"]');
        if (!input.files.length) { status.textContent = 'Choose a backup file first.'; return; }
        const text = await input.files[0].text();
        const res = await fetch('/admin/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text
        });
        if (res.ok) {
          window.location.href = '/settings?msg=' + encodeURIComponent('Backup restored');
        } else {
          const data = await res.json().catch(() => ({ error: 'Restore failed' }));
          status.textContent = data.error || 'Restore failed';
        }
      }
    </script>`;
}

function auditPage(user) {
  const rows = db.data.audit.slice().reverse().slice(0, 200).map(a => `<tr data-testid="audit-row">
      <td>${esc(a.at)}</td>
      <td>${esc(a.actor)}</td>
      <td>${esc(a.action)}</td>
      <td>${esc(a.entity)} ${esc(a.entityId)}</td>
      <td>${esc(a.detail)}</td>
    </tr>`).join('');
  return `
    <h1>Audit log</h1>
    <table data-testid="audit-table">
      <thead><tr><th>At</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No entries</td></tr>'}</tbody>
    </table>`;
}

// ---------- router ----------

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  const started = Date.now();
  let statusCode = 200;

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, headers) => { statusCode = status; return originalWriteHead(status, headers); };

  res.on('finish', () => {
    logs.push({ at: new Date().toISOString(), method: req.method, path, status: statusCode, ms: Date.now() - started });
    if (logs.length > 500) logs.shift();
  });

  try {
    await route(req, res, url, path, q);
  } catch (err) {
    const status = err.status || 500;
    if (path.startsWith('/api/') || path.startsWith('/test/')) {
      json(res, status, { error: err.message });
    } else {
      const user = currentUser(req);
      page(res, status, 'Error', user,
        `<section class="card"><h1>Something went wrong</h1><p data-testid="page-error">${esc(err.message)}</p>
         <p><a href="/">Go back</a></p></section>`, {});
    }
  }
}

async function route(req, res, url, path, q) {
  if (path === '/health') return json(res, 200, { ok: true });

  if (req.method === 'POST' && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        return send(res, 403, 'Cross-origin request blocked', { 'Content-Type': 'text/plain' });
      }
    } catch (e) {
      return send(res, 403, 'Invalid origin', { 'Content-Type': 'text/plain' });
    }
  }

  if (path === '/login' && req.method === 'GET') {
    return send(res, 200, loginPage(null, null));
  }

  if (path === '/login' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').toLowerCase().trim();
    const state = loginState(email);
    if (state.blockedUntil > Date.now()) {
      return send(res, 429, loginPage(null, 'Too many attempts. Try again in 15 minutes.'));
    }

    const u = db.data.users.find(x => x.email === email);
    if (!u || !passwords.verify(body.password, u.password)) {
      noteLoginFailure(email);
      return send(res, 401, loginPage(null, 'Invalid email or password'));
    }

    if (passwords.needsRehash(u.password)) {
      u.password = passwords.hash(body.password);
      db.save();
    }
    loginAttempts.delete(email);
    const sid = crypto.randomBytes(16).toString('hex');
    sessions.set(sid, { userId: u.id, lastSeen: Date.now() });
    const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    const cookie = `${SESSION_COOKIE}=${sid}; HttpOnly; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
    return send(res, 303, '', { Location: '/dashboard', 'Set-Cookie': cookie });
  }

  if (path === '/logout' && req.method === 'POST') {
    const sid = parseCookies(req)[SESSION_COOKIE];
    if (sid) sessions.delete(sid);
    const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    return send(res, 303, '', {
      Location: '/login',
      'Set-Cookie': `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
    });
  }

  // test hooks
  if (process.env.TEST_MODE === '1' && path.startsWith('/test/')) {
    if (path === '/test/reset' && req.method === 'POST') {
      db.reset();
      sessions.clear();
      loginAttempts.clear();
      return json(res, 200, { ok: true, now: db.data.testNow });
    }
    if (path === '/test/clock' && req.method === 'POST') {
      const body = await readBody(req);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now || '')) {
        return json(res, 400, { error: 'Invalid clock value' });
      }
      db.data.testNow = body.now;
      db.save();
      return json(res, 200, { ok: true, now: db.data.testNow });
    }
    if (path === '/test/state') {
      return json(res, 200, db.data);
    }
    if (path === '/test/logs') {
      return json(res, 200, logs);
    }
  }

  if (path === '/style.css') {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'style.css'));
    return send(res, 200, css, { 'Content-Type': 'text/css; charset=utf-8' });
  }

  const user = currentUser(req);
  if (!user) {
    if (path.startsWith('/api/')) return json(res, 401, { error: 'Not signed in' });
    return send(res, 303, '', { Location: '/login' });
  }

  if (path === '/admin/backup.json') {
    if (user.role !== 'admin') return forbid(res, user);
    const payload = Object.assign({}, db.data, {
      exportedAt: new Date().toISOString(),
      formatVersion: 1
    });
    return send(res, 200, JSON.stringify(payload, null, 2), {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="clinic-backup-${c.today()}.json"`
    });
  }

  if (path === '/admin/restore' && req.method === 'POST') {
    if (user.role !== 'admin') return forbid(res, user);
    const raw = await readRaw(req);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return json(res, 400, { error: 'Backup file is not valid JSON' });
    }
    const requiredArrays = ['patients', 'doctors', 'users', 'availability', 'timeOff', 'appointments', 'audit'];
    const missing = requiredArrays.filter(k => !Array.isArray(payload[k]));
    if (missing.length || !payload.settings || typeof payload.settings !== 'object') {
      return json(res, 400, { error: 'Backup file is missing required sections: ' + missing.join(', ') });
    }
    delete payload.exportedAt;
    delete payload.formatVersion;
    if (!payload.testNow) payload.testNow = c.now();
    if (!Number.isFinite(payload.seq)) payload.seq = 100;
    if (!payload.refSeq || typeof payload.refSeq !== 'object') payload.refSeq = {};
    for (const k of Object.keys(db.data)) delete db.data[k];
    Object.assign(db.data, payload);
    db.save();
    c.audit(user, 'restore', 'clinic', 'all',
      `restored ${payload.appointments.length} appointments, ${payload.patients.length} patients`);
    return json(res, 200, { ok: true });
  }

  const isStaff = user.role === 'receptionist' || user.role === 'admin';

  // API
  if (path === '/api/book' && req.method === 'POST') {
    const body = await readBody(req);
    const a = c.createAppointment({
      patientId: body.patientId,
      doctorId: body.doctorId,
      start: body.start,
      actor: user
    });
    return json(res, 201, { id: a.id, reference: a.reference, start: a.slotStart });
  }

  if (path === '/api/reschedule' && req.method === 'POST') {
    const body = await readBody(req);
    const a = c.reschedule(body.id, body.start, user);
    return json(res, 200, { id: a.id, start: a.slotStart, rescheduleCount: a.rescheduleCount });
  }

  if (path === '/api/cancel' && req.method === 'POST') {
    const body = await readBody(req);
    const a = c.cancel(body.id, body.reason, body.note, user);
    return json(res, 200, { id: a.id, status: a.status });
  }

  if (path === '/api/status' && req.method === 'POST') {
    const body = await readBody(req);
    const a = c.setStatus(body.id, body.status, user);
    return json(res, 200, { id: a.id, status: a.status });
  }

  if (path === '/dashboard') {
    return page(res, 200, 'Dashboard', user, dashboard(user), { msg: q.msg });
  }

  if (path === '/' ) return redirect(res, '/dashboard');

  // patients
  if (path === '/patients' && req.method === 'GET') {
    if (!isStaff) return forbid(res, user);
    return page(res, 200, 'Patients', user, patientsPage(user, q.q), { msg: q.msg, error: q.error });
  }

  if (path === '/patients' && req.method === 'POST') {
    if (!isStaff) return forbid(res, user);
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const mobile = String(body.mobile || '').trim();
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return page(res, 400, 'Patients', user,
        patientsPage(user, '', null, null, { name, mobile, dob: body.dob, gender: body.gender, email: body.email }),
        { error: 'Enter a valid 10-digit mobile number' });
    }
    const existing = db.data.patients.find(p => p.mobile === mobile);
    const confirmed = Array.isArray(body.confirmDuplicate)
      ? body.confirmDuplicate.includes('1')
      : body.confirmDuplicate === '1';
    if (existing && !confirmed) {
      return page(res, 200, 'Patients', user,
        patientsPage(user, '', `This number already belongs to ${existing.name}`, null,
          { name, mobile, dob: body.dob, gender: body.gender, email: body.email }), {});
    }
    const p = {
      id: 'P-' + (1000 + db.data.patients.length + 1),
      name,
      mobile,
      dob: body.dob || '',
      gender: body.gender || 'Other',
      email: body.email || ''
    };
    db.data.patients.push(p);
    db.save();
    c.audit(user, 'create', 'patient', p.id, p.name);
    return redirect(res, '/patients/' + p.id, 'Patient created');
  }

  const patientMatch = path.match(/^\/patients\/(P-\d+)$/);
  if (patientMatch) {
    if (!isStaff) return forbid(res, user);
    const p = c.patient(patientMatch[1]);
    if (!p) return page(res, 404, 'Not found', user, '<p>Patient not found</p>', {});
    return page(res, 200, p.name, user, patientDetail(user, p), { msg: q.msg });
  }

  // patient import (admin)
  if (path === '/import' && req.method === 'GET') {
    if (user.role !== 'admin') return forbid(res, user);
    return page(res, 200, 'Import patients', user, importPage(user), { msg: q.msg, error: q.error });
  }

  if (path === '/import/preview' && req.method === 'POST') {
    if (user.role !== 'admin') return forbid(res, user);
    const body = await readBody(req);
    const analysis = importer.analyze(body.text);
    if (analysis.error) {
      return page(res, 400, 'Import patients', user, importPage(user), { error: analysis.error });
    }
    for (const [key, job] of importJobs) {
      if (Date.now() - job.at > 15 * 60000) importJobs.delete(key);
    }
    const token = crypto.randomBytes(12).toString('hex');
    importJobs.set(token, { analysis, at: Date.now() });
    return page(res, 200, 'Import preview', user, importPreviewPage(user, analysis, token), {});
  }

  if (path === '/import/confirm' && req.method === 'POST') {
    if (user.role !== 'admin') return forbid(res, user);
    const body = await readBody(req);
    const job = importJobs.get(body.token);
    if (!job || Date.now() - job.at > 15 * 60000) {
      return page(res, 410, 'Import patients', user, importPage(user),
        { error: 'This preview expired. Preview the file again.' });
    }
    const created = importer.commit(job.analysis);
    importJobs.delete(body.token);
    c.audit(user, 'patient.import', 'patient', 'batch',
      `imported ${created.length}, duplicates ${job.analysis.summary.duplicates}, invalid ${job.analysis.summary.invalid}`);
    return redirect(res, '/import', `Imported ${created.length} patients`);
  }

  // availability
  if (path === '/availability' && req.method === 'GET') {
    if (user.role === 'receptionist') return forbid(res, user);
    return page(res, 200, 'Availability', user, availabilityPage(user, q.doctorId), { msg: q.msg, error: q.error });
  }

  if (path === '/availability' && req.method === 'POST') {
    if (user.role === 'receptionist') return forbid(res, user);
    const body = await readBody(req);
    const doctorId = user.role === 'doctor' ? user.doctorId : body.doctorId;
    const weekday = Number(body.weekday);
    const start = body.start;
    const end = body.end;
    const slotMinutes = Number(body.slotMinutes);
    if (![10, 15, 20, 30, 45, 60].includes(slotMinutes)) {
      return page(res, 400, 'Availability', user, availabilityPage(user, doctorId), { error: 'Unsupported slot duration' });
    }
    if (!start || !end || c.minutesOf(start) >= c.minutesOf(end)) {
      return page(res, 400, 'Availability', user, availabilityPage(user, doctorId), { error: 'End time must be after start time' });
    }
    const overlap = db.data.availability.some(a =>
      a.doctorId === doctorId && a.weekday === weekday &&
      c.minutesOf(start) < c.minutesOf(a.end) && c.minutesOf(a.start) < c.minutesOf(end));
    if (overlap) {
      return page(res, 409, 'Availability', user, availabilityPage(user, doctorId), { error: 'This block overlaps an existing block' });
    }
    db.data.availability.push({
      id: 'AV-' + (++db.data.seq),
      doctorId, weekday, start, end, slotMinutes
    });
    db.save();
    c.audit(user, 'availability.create', 'availability', doctorId, `${weekday} ${start}-${end}`);
    return redirect(res, '/availability' + (user.role === 'admin' ? '?doctorId=' + doctorId : ''), 'Availability saved');
  }

  const availDel = path.match(/^\/availability\/(AV-\d+)\/delete$/);
  if (availDel && req.method === 'POST') {
    if (user.role === 'receptionist') return forbid(res, user);
    db.data.availability = db.data.availability.filter(a => a.id !== availDel[1]);
    db.save();
    c.audit(user, 'availability.delete', 'availability', availDel[1], '');
    return redirect(res, '/availability', 'Block removed');
  }

  // time off
  if (path === '/timeoff' && req.method === 'GET') {
    if (user.role === 'receptionist') return forbid(res, user);
    return page(res, 200, 'Time off', user, timeoffPage(user, q.blocked ? 'Time off not saved' : null), { msg: q.msg });
  }

  if (path === '/timeoff' && req.method === 'POST') {
    if (user.role === 'receptionist') return forbid(res, user);
    const body = await readBody(req);
    const doctorId = user.role === 'doctor' ? user.doctorId : body.doctorId;
    const startDate = body.startDate;
    const endDate = body.endDate || startDate;
    if (!startDate) return page(res, 400, 'Time off', user, timeoffPage(user), { error: 'Select a date' });
    const blocking = db.data.appointments.filter(a =>
      a.doctorId === doctorId && c.ACTIVE.has(a.status) &&
      c.dateOf(a.slotStart) >= startDate && c.dateOf(a.slotStart) <= endDate);
    if (blocking.length) {
      const list = blocking.map(a =>
        `<li><a href="/appointments/${esc(a.id)}">${esc(a.reference)} · ${fmtDateTime(a.slotStart)} · ${esc(patientName(a.patientId))}</a></li>`).join('');
      return send(res, 409, layout({
        title: 'Time off',
        user,
        error: `Cannot save time off - ${blocking.length} active appointments overlap this range`,
        body: `<ul data-testid="conflict-list">${list}</ul>` + timeoffPage(user, 'Time off has not been saved')
      }));
    }
    db.data.timeOff.push({
      id: 'TO-' + (++db.data.seq), doctorId, startDate, endDate,
      reason: String(body.reason || '').trim()
    });
    db.save();
    c.audit(user, 'timeoff.create', 'timeoff', doctorId, `${startDate}..${endDate}`);
    return redirect(res, '/timeoff', 'Time off saved');
  }

  // booking
  if (path === '/book' && req.method === 'GET') {
    if (!isStaff) return forbid(res, user);
    if (q.patientId) q.patientId = q.patientId;
    return page(res, 200, 'Book', user, bookPage(user, q), { msg: q.msg });
  }

  if (path === '/book' && req.method === 'POST') {
    if (!isStaff) return forbid(res, user);
    const body = await readBody(req);
    const start = `${body.date}T${body.time}`;
    const a = c.createAppointment({
      patientId: body.patientId,
      doctorId: body.doctorId,
      start,
      actor: user
    });
    return redirect(res, '/appointments/' + a.id, `Booked ${a.reference}`);
  }

  if (path === '/schedule') {
    return page(res, 200, 'Schedule', user, schedulePage(user, q), { msg: q.msg });
  }

  if (path === '/walkin' && req.method === 'POST') {
    if (!isStaff) return forbid(res, user);
    const body = await readBody(req);
    const a = c.walkIn(body.doctorId, user);
    return redirect(res, '/appointments/' + a.id, 'Walk-in registered');
  }

  if (path === '/today') {
    if (user.role !== 'doctor') return forbid(res, user);
    return page(res, 200, 'Today', user, todayPage(user), { msg: q.msg });
  }

  if (path === '/call-list') {
    if (!isStaff) return forbid(res, user);
    return page(res, 200, 'Call list', user, callListPage(user, q), {});
  }

  if (path === '/appointments') {
    return page(res, 200, 'Appointments', user, appointmentsPage(user, q), { msg: q.msg });
  }

  const apptMatch = path.match(/^\/appointments\/(A-\d+)$/);
  if (apptMatch) {
    const a = c.appointment(apptMatch[1]);
    if (!a) return page(res, 404, 'Not found', user, '<p>Appointment not found</p>', {});
    if (user.role === 'doctor' && user.doctorId !== a.doctorId) return forbid(res, user);
    return page(res, 200, a.reference, user, appointmentPage(user, a), { msg: q.msg, error: q.error });
  }

  const apptAction = path.match(/^\/appointments\/(A-\d+)\/(reschedule|cancel|status)$/);
  if (apptAction && req.method === 'POST') {
    const id = apptAction[1];
    const action = apptAction[2];
    const body = await readBody(req);
    const a = c.appointment(id);
    if (!a) return page(res, 404, 'Not found', user, '<p>Appointment not found</p>', {});
    if (user.role === 'doctor' && user.doctorId !== a.doctorId) return forbid(res, user);

    if (action === 'status') {
      c.setStatus(id, body.status, user);
      return redirect(res, '/appointments/' + id, `Status changed to ${body.status}`);
    }
    if (action === 'reschedule') {
      if (!isStaff) return forbid(res, user);
      c.reschedule(id, `${body.date}T${body.time}`, user);
      return redirect(res, '/appointments/' + id, 'Appointment rescheduled');
    }
    if (action === 'cancel') {
      if (!isStaff) return forbid(res, user);
      c.cancel(id, body.reason, body.note, user);
      return redirect(res, '/appointments/' + id, 'Appointment cancelled');
    }
  }

  if (path === '/reports') {
    if (!isStaff) return forbid(res, user);
    return page(res, 200, 'Reports', user, reportsPage(user, q), { msg: q.msg });
  }

  if (path === '/reports/daily.csv') {
    if (!isStaff) return forbid(res, user);
    const date = parseDate(q.date);
    const rows = c.dailyReport(date);
    const header = 'Doctor,Total,Booked,Confirmed,Checked in,Completed,No show,Cancelled\n';
    const csv = header + rows.map(r =>
      [r.doctor.name, r.total, r.booked, r.confirmed, r.checkedIn, r.completed, r.noShow, r.cancelled]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
    return send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="daily-report-${date}.csv"`
    });
  }

  if (path === '/settings' && req.method === 'GET') {
    if (user.role !== 'admin') return forbid(res, user);
    return page(res, 200, 'Settings', user, settingsPage(user), { msg: q.msg });
  }

  if (path === '/settings' && req.method === 'POST') {
    if (user.role !== 'admin') return forbid(res, user);
    const body = await readBody(req);
    const s = db.data.settings;
    s.horizonDays = Number(body.horizonDays) || s.horizonDays;
    s.callListLeadHours = Number(body.callListLeadHours) || s.callListLeadHours;
    s.sessionIdleMinutes = Number(body.sessionIdleMinutes) || s.sessionIdleMinutes;
    s.holidays = String(body.holidays || '').split(',').map(x => x.trim()).filter(Boolean);
    db.save();
    c.audit(user, 'settings.update', 'settings', 'clinic', '');
    return redirect(res, '/settings', 'Settings saved');
  }

  if (path === '/audit') {
    if (user.role !== 'admin') return forbid(res, user);
    return page(res, 200, 'Audit log', user, auditPage(user), {});
  }

  return page(res, 404, 'Not found', user,
    '<section class="card"><h1>Page not found</h1></section>', {});
}

module.exports = { handle, logs };
