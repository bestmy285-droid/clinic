'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const [d, t] = iso.split('T');
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${fmtDate(d)}, ${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const [h, m] = iso.split('T')[1].split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function badge(status) {
  const cls = status.toLowerCase().replace(/[^a-z]/g, '');
  return `<span class="badge badge-${cls}" data-testid="status">${esc(status)}</span>`;
}

function navFor(user) {
  const items = [];
  const add = (href, label, testid) => items.push(
    `<a href="${href}" data-testid="${testid}">${label}</a>`);

  if (user.role === 'doctor') {
    add('/today', 'Today', 'nav-today');
    add('/availability', 'My availability', 'nav-availability');
    add('/timeoff', 'Time off', 'nav-timeoff');
    add('/schedule', 'My schedule', 'nav-schedule');
  } else {
    add('/patients', 'Patients', 'nav-patients');
    add('/book', 'Book', 'nav-book');
    add('/schedule', 'Schedule', 'nav-schedule');
    add('/appointments', 'Appointments', 'nav-appointments');
    add('/call-list', 'Call list', 'nav-calllist');
    add('/reports', 'Reports', 'nav-reports');
  }
  if (user.role === 'admin') {
    add('/import', 'Import', 'nav-import');
    add('/settings', 'Settings', 'nav-settings');
    add('/audit', 'Audit log', 'nav-audit');
  }
  return items.join('');
}

function layout({ title, user, body, msg, error }) {
  const nav = user ? navFor(user) : '';
  const who = user
    ? `<span class="who" data-testid="user-role" data-role="${esc(user.role)}">${esc(user.name)} · ${esc(user.role)}</span>
       <form method="post" action="/logout" class="inline"><button class="link" data-testid="nav-logout">Sign out</button></form>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · Clinic Desk</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body data-role="${user ? esc(user.role) : 'anonymous'}">
  <header class="topbar">
    <div class="brand">Clinic Desk</div>
    <nav data-testid="nav">${nav}</nav>
    <div class="userbox">${who}</div>
  </header>
  <main>
    ${msg ? `<div class="flash ok" data-testid="flash">${esc(msg)}</div>` : ''}
    ${error ? `<div class="flash err" data-testid="error">${esc(error)}</div>` : ''}
    ${body}
  </main>
</body>
</html>`;
}

module.exports = { esc, fmtDate, fmtDateTime, fmtTime, badge, layout };
