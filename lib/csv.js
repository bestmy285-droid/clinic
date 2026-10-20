'use strict';

const HEADER_ALIASES = {
  name: ['name', 'fullname', 'patientname', 'patient', 'full name'],
  mobile: ['mobile', 'phone', 'mobilenumber', 'contact', 'contactnumber', 'phonenumber', 'mobile number'],
  dob: ['dob', 'dateofbirth', 'date of birth', 'birthdate', 'birth date', 'birth'],
  gender: ['gender', 'sex'],
  email: ['email', 'emailid', 'email id']
};

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_\-]+/g, '');
}

function keyFor(header) {
  const n = normalizeKey(header);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.map(normalizeKey).includes(n)) return key;
  }
  return null;
}

function parseRows(text) {
  const input = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch === '\r') continue;
    field += ch;
  }
  row.push(field);
  if (row.some(x => String(x).trim() !== '')) rows.push(row);
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

function parse(text) {
  const rows = parseRows(text);
  if (!rows.length) return { error: 'The file is empty', headers: [], records: [] };

  const headerRow = rows[0].map(h => String(h).trim());
  const map = {};
  headerRow.forEach((h, i) => {
    const key = keyFor(h);
    if (key && map[key] === undefined) map[key] = i;
  });

  if (map.name === undefined || map.mobile === undefined) {
    return {
      error: 'Header must include a name and a mobile column. Found: ' + headerRow.join(', '),
      headers: headerRow,
      records: []
    };
  }

  const records = rows.slice(1).map((cells, index) => ({
    line: index + 2,
    name: String(cells[map.name] || '').trim(),
    mobile: String(cells[map.mobile] || '').replace(/\s+/g, ''),
    dob: map.dob === undefined ? '' : String(cells[map.dob] || '').trim(),
    gender: map.gender === undefined ? '' : String(cells[map.gender] || '').trim(),
    email: map.email === undefined ? '' : String(cells[map.email] || '').trim()
  }));

  return { error: null, headers: headerRow, records };
}

function normalizeDate(value) {
  if (!value) return { value: '', error: null };
  let y, m, d;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(value);
    if (!match) return { value: '', error: 'Date of birth must be YYYY-MM-DD or DD/MM/YYYY' };
    d = +match[1]; m = +match[2]; y = +match[3];
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { value: '', error: 'Date of birth is not a real date' };
  }
  if (y < 1900 || date > new Date()) {
    return { value: '', error: 'Date of birth is out of range' };
  }
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { value: iso, error: null };
}

function normalizeGender(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'm' || v === 'male') return 'Male';
  if (v === 'f' || v === 'female') return 'Female';
  if (!v) return 'Other';
  return 'Other';
}

module.exports = { parse, normalizeDate, normalizeGender, parseRows };
