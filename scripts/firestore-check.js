'use strict';

// Checks the Firestore connection and optionally pushes the current
// data/clinic.json snapshot.
//
//   npm run firestore:check
//   npm run firestore:push

const fs = require('fs');
const path = require('path');
const firestore = require('../lib/firestore');

const DATA_FILE = path.join(__dirname, '..', 'data', 'clinic.json');
const push = process.argv.includes('--push');

(async () => {
  const ok = firestore.init();
  const st = firestore.status();

  console.log('key file      :', st.keyFile);
  console.log('project       :', st.projectId || '(unknown)');
  console.log('mirror        :', ok ? 'ON' : 'OFF - ' + st.reason);

  if (!ok) {
    console.error('\nFirestore is not enabled. Fix the key path or env vars above.');
    process.exit(1);
  }

  if (push) {
    if (!fs.existsSync(DATA_FILE)) {
      console.error('\nNo local data file at', DATA_FILE);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    firestore.mirror(data);
    await firestore.flush();
    console.log('\nPushed', DATA_FILE, 'to clinics/clinic-desk');
  }

  const res = await firestore.ping();
  console.log('\ndocument      : clinics/clinic-desk');
  console.log('exists        :', res.exists);
  if (res.writeTime) console.log('last cloud    :', res.writeTime);

  const after = firestore.status();
  if (after.lastError) {
    console.error('last error    :', after.lastError);
    process.exit(1);
  }
  console.log('\nOK - Firestore is reachable.');
  process.exit(0);
})().catch(err => {
  console.error('check failed:', err.message);
  process.exit(1);
});
