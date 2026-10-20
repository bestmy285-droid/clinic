'use strict';

const db = require('./db');

const ACTIVE = db.ACTIVE;

function now() { return db.data.testNow; }
function today() { return now().slice(0, 10); }
function pad(n) { return String(n).padStart(2, '0'); }
function dateOf(iso) { return iso.slice(0, 10); }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hhmmOf(mins) {
  return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
}

function doctor(id) { return db.data.doctors.find(d => d.id === id); }
function patient(id) { return db.data.patients.find(p => p.id === id); }
function appointment(id) { return db.data.appointments.find(a => a.id === id); }
function user(id) { return db.data.users.find(u => u.id === id); }

function isOff(doctorId, date) {
  return db.data.timeOff.some(t =>
    t.doctorId === doctorId && t.startDate <= date && date <= t.endDate);
}

function activeAt(doctorId, start) {
  return db.data.appointments.find(a =>
    a.doctorId === doctorId && a.slotStart === start && ACTIVE.has(a.status));
}

function activeFutureCount(patientId, from) {
  return db.data.appointments.filter(a =>
    a.patientId === patientId && ACTIVE.has(a.status) && a.slotStart >= from).length;
}

function slotsFor(doctorId, date) {
  const doc = doctor(doctorId);
  if (!doc || !doc.active) return [];
  if (db.data.settings.holidays.includes(date)) return [];
  if (date > addDays(today(), db.data.settings.horizonDays)) return [];
  if (isOff(doctorId, date)) return [];

  const blocks = db.data.availability.filter(a =>
    a.doctorId === doctorId && a.weekday === weekdayOf(date));
  const out = [];

  for (const block of blocks) {
    const step = block.slotMinutes;
    for (let m = minutesOf(block.start); m + step <= minutesOf(block.end); m += step) {
      const time = hhmmOf(m);
      const start = `${date}T${time}`;
      if (start < now()) continue;
      if (activeAt(doctorId, start)) continue;
      out.push({
        start,
        end: `${date}T${hhmmOf(m + step)}`,
        time
      });
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

function gridSlots(doctorId, date) {
  const doc = doctor(doctorId);
  if (!doc || !doc.active) return [];
  if (db.data.settings.holidays.includes(date)) return [];
  if (isOff(doctorId, date)) return [];

  const blocks = db.data.availability.filter(a =>
    a.doctorId === doctorId && a.weekday === weekdayOf(date));
  const out = [];

  for (const block of blocks) {
    const step = block.slotMinutes;
    for (let m = minutesOf(block.start); m + step <= minutesOf(block.end); m += step) {
      const time = hhmmOf(m);
      out.push({
        start: `${date}T${time}`,
        end: `${date}T${hhmmOf(m + step)}`,
        time
      });
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

function reference(date) {
  const key = date.replace(/-/g, '');
  let ref;
  do {
    db.data.refSeq[key] = (db.data.refSeq[key] || 0) + 1;
    ref = `APT-${key}-${String(db.data.refSeq[key]).padStart(4, '0')}`;
  } while (db.data.appointments.some(a => a.reference === ref));
  return ref;
}

function audit(actor, action, entity, entityId, detail) {
  db.data.audit.push({
    id: 'AU-' + (++db.data.seq),
    actor: actor ? actor.email : 'system',
    role: actor ? actor.role : 'system',
    action,
    entity,
    entityId,
    detail: detail || '',
    at: now()
  });
}

function createAppointment({ patientId, doctorId, start, channel, actor, reference: forcedRef }) {
  if (!patient(patientId)) fail(400, 'Select a patient');
  if (!doctor(doctorId)) fail(400, 'Select a doctor');
  if (!start || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) {
    fail(400, 'Select a slot');
  }

  const date = dateOf(start);
  if (activeAt(doctorId, start)) fail(409, 'This slot is already booked');
  const slot = slotsFor(doctorId, date).find(s => s.start === start);
  if (!slot) fail(409, 'This slot is not available');
  if (activeFutureCount(patientId, now()) >= 3) {
    fail(409, 'Patient already has 3 upcoming appointments');
  }

  const appt = {
    id: 'A-' + (++db.data.seq),
    reference: forcedRef || reference(date),
    patientId,
    doctorId,
    slotStart: slot.start,
    slotEnd: slot.end,
    status: 'Booked',
    channel: channel || 'staff',
    rescheduleCount: 0,
    cancelReason: '',
    cancelNote: '',
    createdBy: actor ? actor.id : 'system',
    createdAt: now()
  };
  db.data.appointments.push(appt);
  db.save();
  audit(actor, 'create', 'appointment', appt.id, `${appt.reference} ${start}`);
  return appt;
}

function reschedule(id, newStart, actor) {
  const appt = appointment(id);
  if (!appt) fail(404, 'Appointment not found');
  if (!ACTIVE.has(appt.status)) fail(409, 'Only active appointments can be rescheduled');
  if (appt.rescheduleCount >= 2) fail(409, 'Reschedule limit reached for this appointment');
  if (newStart < now()) fail(400, 'Selected time has already passed');

  const slot = slotsFor(appt.doctorId, dateOf(newStart)).find(s => s.start === newStart);
  if (!slot) fail(409, 'This slot is not available');

  const old = appt.slotStart;
  appt.slotStart = slot.start;
  appt.slotEnd = slot.end;
  appt.rescheduleCount += 1;
  db.save();
  audit(actor, 'reschedule', 'appointment', appt.id, `${old} -> ${slot.start}`);
  return appt;
}

function cancel(id, reason, note, actor) {
  const appt = appointment(id);
  if (!appt) fail(404, 'Appointment not found');
  if (!ACTIVE.has(appt.status)) fail(409, 'Only active appointments can be cancelled');
  if (!reason) fail(400, 'Select a cancellation reason');

  const hours = (new Date(appt.slotStart).getTime() - new Date(now()).getTime()) / 36e5;
  if (actor && actor.role === 'receptionist' && hours < 2) {
    fail(403, 'Cut-off passed - ask the clinic manager');
  }

  appt.status = 'Cancelled';
  appt.cancelReason = reason;
  appt.cancelNote = note || '';
  db.save();
  audit(actor, 'cancel', 'appointment', appt.id, `reason category: ${reason}`);
  return appt;
}

const TRANSITIONS = {
  Booked: ['Confirmed', 'Checked-in', 'Cancelled', 'No-show'],
  Confirmed: ['Checked-in', 'Cancelled', 'No-show'],
  'Checked-in': ['Completed']
};

function setStatus(id, status, actor) {
  const appt = appointment(id);
  if (!appt) fail(404, 'Appointment not found');
  const allowed = TRANSITIONS[appt.status] || [];
  if (!allowed.includes(status)) {
    fail(409, `Cannot change status from ${appt.status} to ${status}`);
  }
  if ((status === 'Completed' || status === 'No-show') && appt.slotStart > now()) {
    fail(409, 'Cannot complete an appointment that has not started');
  }
  if (actor && actor.role === 'doctor' && actor.doctorId !== appt.doctorId) {
    fail(403, 'You can only update your own appointments');
  }
  const old = appt.status;
  appt.status = status;
  db.save();
  audit(actor, 'status', 'appointment', appt.id, `${old} -> ${status}`);
  return appt;
}

function walkIn(doctorId, actor) {
  if (!doctor(doctorId)) fail(400, 'Select a doctor');
  const date = today();
  const slots = slotsFor(doctorId, date);
  if (!slots.length) fail(409, 'No free slot available today for this doctor');
  return createAppointment({
    patientId: db.data.patients[0].id,
    doctorId,
    start: slots[0].start,
    channel: 'walk-in',
    actor
  });
}

function callList(date, doctorId) {
  return db.data.appointments
    .filter(a => dateOf(a.slotStart) === date && ACTIVE.has(a.status))
    .filter(a => !doctorId || a.doctorId === doctorId)
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
}

function dailyReport(date) {
  const rows = db.data.doctors.map(doc => {
    const list = db.data.appointments.filter(a =>
      a.doctorId === doc.id && dateOf(a.slotStart) === date);
    return {
      doctor: doc,
      total: list.length,
      booked: list.filter(a => a.status === 'Booked').length,
      confirmed: list.filter(a => a.status === 'Confirmed').length,
      checkedIn: list.filter(a => a.status === 'Checked-in').length,
      completed: list.filter(a => a.status === 'Completed').length,
      noShow: list.filter(a => a.status === 'No-show').length,
      cancelled: list.filter(a => a.status === 'Cancelled').length
    };
  });
  return rows;
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

module.exports = {
  ACTIVE,
  now, today, addDays, weekdayOf, minutesOf, hhmmOf, dateOf,
  doctor, patient, appointment, user,
  slotsFor, gridSlots, createAppointment, reschedule, cancel, setStatus, walkIn,
  callList, dailyReport, audit, fail, activeAt
};
