'use strict';

const db = require('./db');
const csv = require('./csv');

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nextPatientId() {
  const max = db.data.patients.reduce((acc, p) => {
    const n = Number(String(p.id).replace(/\D/g, ''));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 1000);
  return 'P-' + (max + 1);
}

function analyze(text) {
  const parsed = csv.parse(text);
  if (parsed.error) {
    return { error: parsed.error, rows: [], summary: { total: 0, importable: 0, duplicates: 0, invalid: 0, warnings: 0 } };
  }

  const existing = db.data.patients;
  const seen = new Set();
  const rows = parsed.records.map(rec => {
    const errors = [];
    const warnings = [];

    if (rec.name.length < 2) errors.push('Name is required');
    if (!MOBILE.test(rec.mobile)) errors.push('Mobile must be 10 digits starting 6-9');

    const dob = csv.normalizeDate(rec.dob);
    if (dob.error) errors.push(dob.error);

    if (rec.email && !EMAIL.test(rec.email)) errors.push('Email is not valid');

    let status = 'import';
    if (!errors.length) {
      const key = `${rec.name.toLowerCase()}|${rec.mobile}`;
      const sameRecord = existing.find(p =>
        p.name.toLowerCase() === rec.name.toLowerCase() && p.mobile === rec.mobile);
      const sameMobile = existing.find(p => p.mobile === rec.mobile);

      if (sameRecord) {
        status = 'duplicate';
        warnings.push('Already exists with this name and mobile');
      } else if (seen.has(key)) {
        status = 'duplicate';
        warnings.push('Duplicate row in this file');
      } else if (sameMobile) {
        warnings.push(`Mobile already used by ${sameMobile.name} (family member?)`);
      }
      seen.add(key);
    } else {
      status = 'invalid';
    }

    return {
      line: rec.line,
      name: rec.name,
      mobile: rec.mobile,
      dob: dob.value,
      gender: csv.normalizeGender(rec.gender),
      email: rec.email,
      status,
      problems: errors.concat(warnings),
      errors
    };
  });

  const summary = {
    total: rows.length,
    importable: rows.filter(r => r.status === 'import').length,
    duplicates: rows.filter(r => r.status === 'duplicate').length,
    invalid: rows.filter(r => r.status === 'invalid').length,
    warnings: rows.filter(r => r.status === 'import' && r.problems.length).length
  };

  return { error: null, rows, summary };
}

function commit(analysis) {
  const toAdd = analysis.rows.filter(r => r.status === 'import');
  const created = [];
  for (const row of toAdd) {
    const patient = {
      id: nextPatientId(),
      name: row.name,
      mobile: row.mobile,
      dob: row.dob,
      gender: row.gender,
      email: row.email
    };
    db.data.patients.push(patient);
    created.push(patient);
  }
  db.save();
  return created;
}

module.exports = { analyze, commit, nextPatientId };
