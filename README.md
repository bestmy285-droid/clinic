# Clinic Desk

Staff-only appointment booking for a single clinic, built from the RFP in
`rfp/patient-appointment-booking/`. No patient portal, no SMS, no email - confirmation
is verbal and on screen, with a next-day call list for manual reminders.

## Run

```powershell
npm start
```

While changing code, use `npm run dev` instead: it restarts the server on every save.

Open <http://127.0.0.1:3000>.

| Role         | Email                     | Password    |
| ------------ | ------------------------- | ----------- |
| Receptionist | receptionist@clinic.test  | `Clinic@2026` |
| Doctor       | doctor@clinic.test        | `Clinic@2026` |
| Admin        | admin@clinic.test         | `Clinic@2026` |

Data lives in `data/clinic.json` and is created from a seed on first start. Delete the
file to reset.

## Firestore mirror (optional)

Every `db.save()` also writes a copy of the store to the Firestore document
`clinics/clinic-desk`. The local JSON file stays the source of truth, so the app keeps
working when Firestore is unreachable or not configured.

**One-time setup**

1. Firebase project with Firestore in Native mode (`asia-south1`).
2. Project settings -> Service accounts -> Generate new private key.
3. Save the key as `secrets/serviceAccountKey.json`. It is gitignored; never commit it.

**Use**

```powershell
npm run firestore:check   # can the server reach Firestore?
npm run firestore:push    # push data/clinic.json once, by hand
npm start                 # log shows: [firestore] mirror ON
```

Open the Firebase console -> Firestore -> `clinics` -> `clinic-desk` to see the data.

| Variable | Effect |
| --- | --- |
| `FIRESTORE_KEY` | Path to the service-account key (default `secrets/serviceAccountKey.json`) |
| `FIRESTORE_MIRROR=off` | Turn the mirror off |
| `TEST_MODE=1` | Always turns the mirror off (the test suite resets the database) |

The mirror is one document, so it must stay under Firestore's 1 MiB limit. Split it into
per-collection documents before the store grows past that. For Docker, mount the key
read-only and point `FIRESTORE_KEY` at it:

```yaml
volumes:
  - ./secrets:/app/secrets:ro
environment:
  FIRESTORE_KEY: /app/secrets/serviceAccountKey.json
```


## What is implemented

- Patient registration, search, duplicate-mobile warning, optional date of birth
- CSV patient import with preview, duplicate detection and per-row error report (admin)
- Doctor weekly availability, slot generation, time off with conflict blocking
- Booking, reschedule (max 2), cancel (2-hour cut-off, admin override, mandatory reason)
- Conflict prevention with a single authoritative check under concurrency
- Status lifecycle: Booked, Confirmed, Checked-in, Completed, No-show, Cancelled
- Walk-in registration, day schedule, doctor's today list
- Appointment search and filters
- Next-day call list with doctor filter and print layout
- Daily CSV report
- Clinic settings, role-based access, append-only audit log
- Admin backup download and restore (application level)

- CSV import: sign in as admin, open **Import**, paste or choose a CSV with a header row
  (`Name`, `Mobile`, optional `DOB`, `Gender`, `Email`), preview the report, then confirm.
  Nothing is written until you confirm.

## Test

```powershell
npm test
```

Playwright starts the app on port 3100 against a disposable database (`TEST_MODE=1`),
resets it before every test, and can move the clinic clock with `/test/clock` for
cut-off and lifecycle scenarios.

- 40 test cases, one per case in `rfp/patient-appointment-booking/test-cases.md`
- Screenshot evidence for every executed test in `evidence/TC-xx.png`
- Trace on failure, full HTML report:

```powershell
npm run test:report
```

Useful single runs:

```powershell
npx playwright test --grep TC-11
npx playwright test tests/staff.spec.js
```

## Security

- Passwords are stored as scrypt hashes with a per-user salt; plaintext records from
  older data files are migrated on load.
- Login is rate limited: 5 failed attempts per email in 15 minutes, then a 15-minute
  lockout.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when served over HTTPS.
- Every response carries `Content-Security-Policy`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, and `Referrer-Policy: same-origin`.
- Cross-origin POST requests are rejected by an Origin check.
- Audit log is append-only and records booking, status, access and restore actions.
- Still missing: a password-change screen, per-user session revocation, and multi-user
  roles beyond the three seeded accounts.

## Live on Firebase

The public deployment runs as a 2nd-gen Cloud Function in `asia-south1` behind
Firebase Hosting:

- URL: <https://clinic-991d5.web.app>
- Storage: Firestore (`clinics/clinic-desk`), not the local JSON file
- `firebase.json` rewrites every Hosting path to the `clinic` function
- `functions/index.js` loads the store from Firestore and buffers each request body
  before boot, because a cold start can outlast the request stream

Deploy:

```powershell
npm run deploy
```

This copies `lib/` and `public/` into `functions/` (predeploy), then deploys functions
and hosting. Requires `firebase-tools` and `firebase login`.

Notes:

- `maxInstances: 1` keeps sessions and the in-memory copy consistent. Sessions live in
  memory, so a cold start or a new revision logs everyone out.
- The session cookie is named `__session` because Firebase Hosting forwards only that
  cookie to the backend.
- Do not run the local app against the same Firestore document while the live site is
  in use: both write the whole snapshot, so the last save wins. For local development
  use `FIRESTORE_MIRROR=off npm start`.

## Deploy (Docker + HTTPS)

```powershell
# local HTTP on port 80
$env:SITE_ADDRESS=":80"; docker compose up -d --build

# with a real domain and automatic TLS
$env:SITE_ADDRESS="clinic.example.com"; docker compose up -d --build
```

Caddy terminates TLS and forwards `X-Forwarded-Proto`, which turns on the `Secure`
cookie flag and HSTS. Clinic data lives in the `clinic-data` volume, so containers can
be replaced without losing records.

Backups: sign in as admin, open **Settings**, and use **Download backup**. Store the
JSON file encrypted and off the server. Restore uses the same screen and is audit-logged.

## Structure

```
server.js              HTTP server entry
lib/db.js              JSON store, seed data, reset
lib/firestore.js       Firestore mirror / cloud store
lib/headers.js         shared security headers
functions/index.js     Firebase Cloud Function entry
firebase.json          Hosting rewrite + functions config
lib/clinic.js          slots, booking rules, conflicts, statuses, audit
lib/app.js             routes, pages, backup/restore, test hooks
lib/html.js            layout, formatting, badges
public/style.css       UI and print styles
tests/helpers.js       login/reset/clock helpers + evidence fixture
tests/staff.spec.js    TC-01..TC-20, TC-24..TC-29, TC-33
tests/ops.spec.js      TC-30..TC-41, TC-57..TC-59
```

## Notes and limits

- `TEST_MODE=1` exposes `/test/reset`, `/test/clock`, `/test/state` and `/test/logs`.
  Never run with it in production.
- Storage is a single JSON file, so run exactly one app instance. Move to Postgres
  before adding a second instance or a patient portal.
- Session idle timeout is configurable from settings (used by TC-37 with a short value).
- TC-41 runs a Chromium viewport matrix (1366x768 and 1920x1080). Edge and Firefox are
  not installed on this machine.
- TC-39 verifies application-level restore. Restoring a database backup into a fresh
  infrastructure environment is still an operations drill.
- The public portal, messaging and reminders were deliberately removed from v1; see the
  RFP changelog for the decisions.
