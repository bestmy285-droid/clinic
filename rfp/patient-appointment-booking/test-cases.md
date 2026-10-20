# Clinic Appointment Booking - Test Cases

Companion to [requirements.md](./requirements.md). Version 1.7, 2026-10-20.

## 1. Test scope and environment

| Item         | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| In scope     | FR-01 to FR-09, FR-12 to FR-18, FR-20, FR-27, BR-01 to BR-09, BR-12, BR-13, NFR-01 to NFR-11 |
| Out of scope | Payments, clinical records, patient portal, multi-branch, any messaging |
| Environment  | Staging with production-like data (55k appointments, 15k patients) |
| Devices      | Chrome 130+, Edge 130+, desktop 1366x768 and 1920x1080              |
| Test data    | Seed script: 9 doctors, 12 patients, 3 receptionists, 1 admin, 1 doctor account |
| Roles needed | receptionist@, doctor@, admin@ clinic test accounts                |
| Messaging    | None - v1 has no SMS, OTP, email, or patient portal                |
| Time control | Clock override utility to simulate slot start, cut-off, and next-day list windows |

## 2. Coverage summary

FR-10, FR-11, FR-19 (SMS) and FR-21 to FR-26 (portal) are withdrawn, so they have no
tests. NFR-12 and NFR-13 were withdrawn with the portal.

| Requirement | Covered by                  | Status                         |
| ----------- | --------------------------- | ------------------------------ |
| FR-01       | TC-01, TC-02, TC-03, TC-60  | Covered                        |
| FR-02       | TC-04, TC-05                | Covered                        |
| FR-03       | TC-33                       | Covered                        |
| FR-04       | TC-06, TC-07                | Covered                        |
| FR-05       | TC-08, TC-09, TC-12, TC-13, TC-59 | Covered                 |
| FR-06       | TC-10, TC-11                | Covered                        |
| FR-07       | TC-14, TC-15                | Covered                        |
| FR-08       | TC-16, TC-17, TC-18         | Covered                        |
| FR-09       | TC-19, TC-20                | Covered                        |
| FR-12       | TC-24                       | Covered                        |
| FR-13       | TC-25                       | Covered                        |
| FR-14       | TC-26                       | Covered                        |
| FR-15       | TC-27                       | Covered                        |
| FR-16       | TC-28                       | Covered                        |
| FR-17       | TC-29                       | Covered                        |
| FR-18       | TC-30                       | Covered                        |
| FR-20       | TC-32                       | Covered                        |
| FR-27       | TC-58                       | Covered                        |
| NFR-01      | TC-34                       | Covered                        |
| NFR-02      | TC-35                       | Covered                        |
| NFR-03      | Monitoring (uptime report)  | Operational, not a manual test |
| NFR-04      | TC-28, TC-37                | Partially covered              |
| NFR-05      | TC-57                       | Covered                        |
| NFR-06      | TC-29, TC-39                | Covered                        |
| NFR-07      | TC-39                       | Covered                        |
| NFR-08      | TC-38                       | Covered                        |
| NFR-09      | TC-40                       | Covered                        |
| NFR-10      | TC-41                       | Covered                        |
| NFR-11      | TC-39                       | Covered                        |

## 3. Test cases

Priority: `P0` release blocker, `P1` important, `P2` nice to have.

TC-21, TC-22, TC-23, TC-31, TC-36 (SMS) and TC-42 to TC-56 (portal) were withdrawn.
IDs are not reused so older review notes stay traceable.

| ID    | Title                                  | Type        | Priority | Req            | Preconditions                          | Steps                                                              | Expected result                                              |
| ----- | -------------------------------------- | ----------- | -------- | -------------- | -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| TC-01 | Register a new patient                | Functional  | P0       | FR-01          | Receptionist signed in                 | 1. Open Patients > New<br>2. Enter name, mobile, gender (DOB blank)<br>3. Save | Patient saved with ID; optional DOB is not required |
| TC-02 | Find patient by mobile and by name    | Functional  | P1       | FR-01          | Patient `P-1001` exists with appointment | Search by `9876543210`, then by partial name                     | Same patient returned; row shows next appointment date       |
| TC-03 | Reject invalid mobile, warn on duplicate | Negative  | P1       | BR-01          | Patient with `9876543210` exists       | 1. Create patient with `12345`<br>2. Retry with `9876543210`      | Invalid number blocked; duplicate shows warning with existing name, can continue |
| TC-04 | Define weekly availability             | Functional  | P0       | FR-02          | Doctor `D-01` exists                   | Set Mon-Fri 09:00-13:00 and 16:00-19:00, 15-minute slots          | Blocks saved; slot grid reflects 15-minute slots             |
| TC-05 | Reject overlapping availability blocks | Negative    | P1       | FR-02, BR-08   | Doctor has Mon 09:00-13:00             | Add Mon 12:00-15:00, then try slot duration 25                    | Overlap rejected with conflict message; 25 min rejected      |
| TC-06 | Slots generated from availability      | Functional  | P0       | FR-04          | Mon 09:00-13:00, 15 min, no bookings   | Open booking grid for Monday                                       | 16 slots from 09:00 to 12:45, each 15 minutes                |
| TC-07 | Slots exclude booked, leave, holiday   | Functional  | P0       | FR-04          | 10:00 booked, 11:00 time off, holiday on Tuesday | Open Monday grid, then Tuesday grid                     | 10:00 and 11:00 unavailable; Tuesday shows holiday notice    |
| TC-08 | Book an available slot                 | Functional  | P0       | FR-05          | Patient `P-1001`, slot 10:00 free      | Select patient, doctor, date, 10:00, confirm                       | Appointment saved with `APT-YYYYMMDD-####`; reference shown; print-on-request works; appears in schedule |
| TC-09 | Reject past date and time              | Negative    | P1       | BR-02          | Clock at 2026-10-20 15:00              | Book 2026-10-20 14:30 and 2026-10-19 10:00                         | Both rejected with "time has already passed"; no record created |
| TC-10 | Reject double booking same slot        | Negative    | P0       | FR-06, BR-03   | 10:00 booked for `D-01`                | Attempt second booking for `D-01` at 10:00                         | Rejected with "slot already booked"; only one active appointment |
| TC-11 | Concurrent booking race                | Functional  | P0       | FR-06          | Slot 10:00 free; two sessions ready    | Submit both bookings within 1 request gap                          | Exactly one succeeds; loser gets conflict message; one active row |
| TC-12 | Reject booking beyond horizon          | Boundary    | P1       | BR-05          | Horizon 60 days                        | Book day +60, then day +61                                         | +60 accepted; +61 rejected with horizon message              |
| TC-13 | Limit 3 active future appointments     | Boundary    | P1       | BR-04          | Patient has 2 upcoming appointments    | Book 3rd, then attempt 4th                                         | 3rd accepted; 4th rejected with limit message                |
| TC-14 | Reschedule to another slot             | Functional  | P0       | FR-07          | Appointment at 10:00, 11:00 free       | Reschedule to 11:00, confirm                                       | Appointment moves; 10:00 bookable again; reschedule_count = 1 |
| TC-15 | Reject third reschedule                | Boundary    | P1       | BR-07          | reschedule_count = 2                   | Attempt another reschedule                                         | Blocked with "reschedule limit reached"; cancel and rebook suggested |
| TC-16 | Cancel with reason                     | Functional  | P0       | FR-08          | Appointment 6h away                    | Cancel with category "Patient request", confirm                    | Status Cancelled, reason saved, slot immediately bookable    |
| TC-17 | Cancellation cut-off by role           | Permission  | P0       | FR-08, BR-06, FR-16 | Appointment 1h away              | Receptionist cancels, then admin cancels                           | Receptionist blocked with cut-off message; admin succeeds    |
| TC-18 | Cancellation reason mandatory          | Negative    | P2       | BR-13          | Active appointment                     | Open cancel dialog, submit without reason                          | Inline error; appointment stays active                       |
| TC-19 | Status lifecycle happy path            | Functional  | P0       | FR-09          | Appointment today at 09:00, clock 09:05 | Confirm > Checked-in > Completed                                  | Each transition saves and shows in timeline; completed locks further edits |
| TC-20 | Invalid status transitions             | Negative    | P1       | FR-09, BR-12   | Appointment at 18:00, clock 10:00      | Set Completed, then try Completed after Cancelled                  | Completed rejected before start; terminal status not changeable |
| TC-24 | Day schedule view and filters          | Functional  | P1       | FR-12          | 12 appointments across 3 doctors       | Open schedule for `D-01` today, switch doctor and date             | Only the selected doctor's date is shown; patient and status visible |
| TC-25 | Doctor sees only own daily list        | Functional  | P1       | FR-13, FR-16   | Doctor `D-01` signed in                | Open Today; attempt URL of `D-02` schedule                         | Only `D-01` appointments listed; other doctor access denied   |
| TC-26 | Walk-in registration                   | Functional  | P1       | FR-14          | Current slot free                      | Register walk-in patient for current slot                           | Appointment created with channel=walk-in, appears in today's list |
| TC-27 | Appointment search and filters         | Functional  | P2       | FR-15          | Mixed appointment history              | Filter by mobile, doctor, date range, status                       | Result set matches each filter; filters combine correctly    |
| TC-28 | Role-based access matrix               | Permission  | P0       | FR-16, NFR-04  | All three role accounts                | Attempt every capability in the FR-16 matrix                       | Allowed/denied exactly as matrix; denied actions return 403  |
| TC-29 | Audit trail completeness               | Data        | P1       | FR-17, NFR-06  | Active appointment                     | Create, reschedule, cancel, change status, edit settings           | One entry per action with actor, timestamp, before/after     |
| TC-30 | Daily CSV export                       | Functional  | P2       | FR-18          | Appointments with all statuses today   | Export today's report                                              | CSV opens with per-doctor booked/completed/no-show/cancelled counts matching UI |
| TC-32 | Clinic settings update                 | Functional  | P2       | FR-20          | Admin signed in                        | Change horizon to 30, add holiday, change call-list lead to 12h    | Settings persist; grids and call list use new values         |
| TC-33 | Time off with existing appointments    | Functional  | P0       | FR-03, BR-09   | 2 active appointments in range         | Save time off for that range                                       | Blocked; both appointments listed with reschedule/cancel actions |
| TC-34 | Schedule view performance              | Performance | P1       | NFR-01         | 50 concurrent users, 60k appointments  | Run 10-minute load test on schedule view                           | p95 ≤ 2s, error rate < 1%                                    |
| TC-35 | Booking API performance                | Performance | P2       | NFR-02         | Load model 20 bookings/minute          | Run booking load test                                              | p95 ≤ 800ms                                                  |
| TC-37 | Idle session timeout                   | Security    | P2       | NFR-04         | Receptionist signed in                 | Idle 15 minutes, then act                                          | Session expired, redirect to login, no data leak             |
| TC-38 | Keyboard-only booking flow             | Usability   | P2       | NFR-08         | None                                   | Complete booking using only keyboard and screen reader             | Full flow operable, focus visible, fields announced correctly |
| TC-39 | Backup and restore                     | Data        | P2       | NFR-07, NFR-11 | Admin signed in, seeded data           | 1. Download backup<br>2. Book an extra appointment<br>3. Restore the file<br>4. Compare counts | Counts and settings return to the backup state; restore audit entry exists; under 4h |
| TC-40 | Timezone and 12-hour display           | Functional  | P2       | NFR-09         | Appointment 14:30 IST                  | View in schedule and on printed reference                          | Shows 02:30 PM Asia/Kolkata; no UTC drift                    |
| TC-41 | Browser compatibility matrix           | Usability   | P2       | NFR-10         | Chrome and Edge latest 2 versions      | Run booking, schedule, cancel flows on each                        | No layout break or blocked action at 1366x768 and 1920x1080  |
| TC-57 | No PHI in logs and exports             | Security    | P1       | NFR-05         | Traffic with real-looking patient data | Book, cancel with a free-text reason, export CSV, inspect logs and URLs | No diagnosis or free-text reason in logs/URLs; CSV contains counts only |
| TC-58 | Generate next-day call list            | Functional  | P1       | FR-27          | Appointments tomorrow for 2 doctors    | Generate the list for one doctor, then for the whole clinic         | Rows show name, mobile, time, doctor, reference; filters match; print layout usable |
| TC-59 | Phone booking read-back                | Usability   | P2       | FR-05, AC-12   | Observer present, 10 live calls        | Observe 10 phone bookings and note what staff read back             | Doctor, date, time, and reference read back on all 10 calls  |

### TC-11 Concurrent booking race

- Requirement: FR-06, BR-03
- Data: doctor `D-01`, slot 2026-10-21 10:00, patients `P-1001` and `P-1002`
- Steps:
  1. Sign in as receptionist in two separate browser sessions.
  2. Select `P-1001` + 10:00 in session A and `P-1002` + 10:00 in session B.
  3. Submit both within 1 second using the API directly to remove UI timing noise.
  4. Query the database for active appointments on `(D-01, 10:00)`.
- Expected: exactly one 201 response, one 409 with "This slot is already booked",
  exactly one active appointment row.
- Post-checks: audit log shows one create and one rejected attempt.

### TC-17 Cancellation cut-off

- Requirement: FR-08, BR-06, FR-16
- Data: appointment at 14:00, current clock 13:00
- Steps:
  1. As receptionist, open the appointment and choose Cancel.
  2. Enter a reason and confirm.
  3. Sign out, sign in as admin, repeat.
- Expected: receptionist sees cut-off message and the status stays Confirmed; admin
  sees an override confirmation, and cancellation succeeds with reason and audit entry.

### TC-58 Next-day call list

- Requirement: FR-27, FR-20, AC-11
- Data: tomorrow has 14 appointments across 3 doctors
- Steps:
  1. Sign in as receptionist.
  2. Generate the list for doctor `D-01` only.
  3. Generate the list for the whole clinic.
  4. Print the whole-clinic list.
- Expected: the single-doctor list has only that doctor's rows; the clinic list has all
  14; each row shows patient name, mobile, time, doctor, and reference; the printout is
  readable on one page per 25 rows.
- Post-checks: no diagnosis or visit reason appears on the list (NFR-05).

| TC-60 | Import patients from CSV               | Functional  | P1       | FR-01          | Admin signed in                        | 1. Paste a 7-row CSV<br>2. Preview<br>3. Confirm               | Preview: 3 importable, 2 duplicates, 2 invalid; confirm adds 3; DOB normalised; import audited |

## 4. Gherkin scenarios

```gherkin
Feature: Slot generation

  Background:
    Given doctor "D-01" is available on Monday from 09:00 to 13:00
    And the slot duration is 15 minutes

  @P0 @FR-04
  Scenario: Generate bookable slots
    When the receptionist opens the booking grid for doctor "D-01" on Monday
    Then 16 slots are shown from 09:00 to 12:45
    And each slot lasts 15 minutes

  @P0 @FR-04
  Scenario: Hide unavailable slots
    Given the 10:00 slot is booked
    And the doctor is on time off from 11:00 to 12:00
    When the receptionist opens the booking grid
    Then the 10:00 and 11:00 slots are not selectable
    And the other slots remain selectable
```

```gherkin
Feature: Appointment booking

  Background:
    Given a receptionist is signed in
    And patient "P-1001" exists

  @P0 @FR-05
  Scenario: Book an available slot
    Given doctor "D-01" has the 10:00 slot available on 2026-10-21
    When the receptionist books the 10:00 slot for patient "P-1001"
    Then the appointment is confirmed with reference "APT-20261021-0001"
    And the reference is shown on screen and can be printed on request
    And the appointment appears in the doctor's schedule

  @P0 @FR-06 @negative
  Scenario: Reject a double booking
    Given the 10:00 slot is already booked for doctor "D-01"
    When the receptionist books the 10:00 slot for patient "P-1002"
    Then the booking is rejected with "This slot is already booked"
    And only one active appointment exists at 10:00

  @P0 @FR-06
  Scenario: Two receptionists race for the same slot
    Given the 10:00 slot is available
    And two receptionists have the slot open
    When both submit the booking at the same moment
    Then exactly one booking succeeds
    And the other receives a conflict response

  @P1 @BR-05 @boundary
  Scenario Outline: Booking horizon
    Given the booking horizon is 60 days
    When the receptionist books a slot <offset> days from today
    Then the result is <outcome>

    Examples:
      | offset | outcome                            |
      | 59     | accepted                           |
      | 60     | accepted                           |
      | 61     | rejected with horizon message      |

  @P1 @BR-04 @boundary
  Scenario Outline: Patient appointment limit
    Given the patient has <existing> upcoming appointments
    When the receptionist books another appointment
    Then the result is <outcome>

    Examples:
      | existing | outcome                          |
      | 2        | accepted                         |
      | 3        | rejected with limit message      |
```

```gherkin
Feature: Reschedule and cancel

  Background:
    Given a receptionist is signed in
    And patient "P-1001" has an appointment with doctor "D-01" at 10:00

  @P0 @FR-07
  Scenario: Move an appointment to a new slot
    Given the 11:00 slot is available
    When the receptionist reschedules the appointment to 11:00
    Then the appointment is confirmed at 11:00
    And the 10:00 slot becomes bookable
    And the reschedule count is 1

  @P1 @BR-07 @boundary
  Scenario: Reject a third reschedule
    Given the appointment has been rescheduled twice
    When the receptionist tries to reschedule again
    Then the change is rejected with "Reschedule limit reached"
    And the existing booking is unchanged

  @P0 @FR-08
  Scenario: Cancel with a reason
    Given the appointment starts in 6 hours
    When the receptionist cancels with reason "Patient request"
    Then the appointment status is Cancelled
    And the reason is stored
    And the slot becomes bookable

  @P0 @FR-08 @BR-06 @permission
  Scenario: Enforce the cancellation cut-off
    Given the appointment starts in 1 hour
    When the receptionist tries to cancel
    Then the cancellation is blocked with a cut-off message
    And the appointment stays Confirmed
    When the clinic admin cancels with a reason
    Then the cancellation succeeds

  @P2 @BR-13 @negative
  Scenario: Require a cancellation reason
    Given the receptionist is cancelling an appointment
    When they submit without a reason
    Then an inline error "Select a cancellation reason" is shown
    And the appointment is not cancelled
```

```gherkin
Feature: Appointment lifecycle

  Background:
    Given a receptionist is signed in
    And patient "P-1001" has an appointment today at 09:00

  @P0 @FR-09
  Scenario: Walk an appointment through the visit
    Given the current time is 09:05
    When the patient arrives and the receptionist checks them in
    And the doctor completes the consultation
    Then the status history shows Booked, Checked-in, Completed
    And the appointment can no longer be edited

  @P1 @FR-09 @BR-12 @negative
  Scenario: Block completing a future appointment
    Given the current time is 10:00
    And the appointment starts at 18:00
    When the doctor marks it Completed
    Then the action is rejected with "Cannot complete an appointment that has not started"
```

```gherkin
Feature: Access control

  @P0 @FR-16 @permission
  Scenario Outline: Enforce the role matrix
    Given a signed-in <role>
    When the user attempts to <action>
    Then the result is <result>

    Examples:
      | role         | action                          | result   |
      | receptionist | cancel after the cut-off        | denied   |
      | receptionist | edit clinic settings            | denied   |
      | doctor       | view another doctor's schedule  | denied   |
      | doctor       | mark own patient checked-in     | allowed  |
      | admin        | cancel after the cut-off        | allowed  |
      | admin        | create a receptionist account   | allowed  |
```

```gherkin
Feature: Doctor time off

  @P0 @FR-03 @BR-09
  Scenario: Block time off that orphans appointments
    Given doctor "D-01" has two active appointments on 2026-10-25
    When the doctor requests time off for the full day
    Then the request is rejected
    And both affected appointments are listed
    And the doctor is offered reschedule or cancel for each
```

```gherkin
Feature: Next-day call list

  @P1 @FR-27 @AC-11
  Scenario: Generate and use the call list
    Given 14 appointments are booked for tomorrow across three doctors
    When the receptionist generates the clinic call list
    Then all 14 rows appear with name, mobile, time, doctor, and reference
    And no diagnosis or visit reason appears on the list

  @P1 @FR-27
  Scenario: Filter the call list by doctor
    Given 14 appointments are booked for tomorrow across three doctors
    When the receptionist generates the list for doctor "D-01"
    Then only that doctor's appointments appear
```

## 5. Non-functional test notes

| NFR    | How to test                              | Tool / setup                       | Pass condition              |
| ------ | ---------------------------------------- | ---------------------------------- | --------------------------- |
| NFR-01 | 10-minute load on schedule view          | k6 or JMeter, staging dataset      | p95 ≤ 2s, errors < 1%       |
| NFR-02 | Booking load at 20 rpm                   | API load script                    | p95 ≤ 800ms                 |
| NFR-03 | Monthly uptime report, synthetic probe   | Monitoring dashboard               | ≥99.5% in clinic hours      |
| NFR-04 | RBAC matrix, idle timeout, staff lockout | Manual + API tests                 | All denied by default       |
| NFR-05 | TLS scan, storage review, log/export inspection | SSL Labs, DB and log review | TLS 1.2+, AES-256, no PHI  |
| NFR-06 | Audit append-only check                  | DB permission review               | No update/delete possible   |
| NFR-07 | Retention job and soft delete check      | Staging database                   | 7 years, no hard delete     |
| NFR-08 | Keyboard and screen reader pass          | NVDA + keyboard only               | WCAG 2.1 AA                 |
| NFR-09 | Timezone and locale checks               | Clock override                     | IST and 12-hour AM/PM       |
| NFR-10 | Browser matrix                           | Chrome and Edge, 2 versions        | No functional difference    |
| NFR-11 | Restore drill                            | Fresh environment from backup      | RTO ≤ 4h, data intact       |

## 6. Traceability gaps

- FR-01: import is tested with a synthetic CSV (TC-60). The real clinic export is still
  pending (Q-07), so re-run TC-60 against the real file before go-live.
- NFR-03: verified operationally through monitoring, not by a manual test case.
- NFR-04: staff password lockout has no dedicated test yet; add one alongside TC-37.
- NFR-11: TC-39 covers application-level backup and restore. A restore into a fresh
  infrastructure environment is still an operations drill, not a browser test.
- FR-09: automatic No-show at end of day is unconfirmed (Q-06) and untested.
- AC-11: call-list usage depends on a staff routine, not only on the software; TC-58
  proves the list is produced, not that it is worked.
- AC-12: read-back is a human process; TC-59 observes it but cannot enforce it.

## 7. Open test questions

| ID    | Question                                                     | Blocks                    |
| ----- | ------------------------------------------------------------ | ------------------------- |
| TQ-01 | Is a production-size dataset available, or must it be built?  | TC-34, TC-35             |
| TQ-02 | What data exists to simulate 3 no-shows in 90 days and the G-01 baseline? | TC-54 (withdrawn), G-01 |
| TQ-03 | When will the patient import sample arrive for migration testing? | Import tests (Q-07)  |
| TQ-04 | Can testers observe live phone calls for TC-59, and with what consent? | TC-59             |

## 8. Withdrawn test cases

| ID                | Reason                                                        |
| ----------------- | ------------------------------------------------------------- |
| TC-21             | Confirmation SMS - removed in v1.4                            |
| TC-22             | Reminder SMS - removed in v1.4                                |
| TC-23             | SMS quiet hours - removed in v1.4                             |
| TC-31             | Notification delivery log - removed in v1.4                   |
| TC-36             | No PHI in SMS - replaced by TC-57 for logs and exports        |
| TC-42 to TC-45    | Patient access and family profiles - portal removed in v1.5   |
| TC-46 to TC-52    | Portal browsing, booking, cancel, reschedule - portal removed |
| TC-53 to TC-55    | Patient history, no-show block, same-day rule - portal removed |
| TC-56             | Mobile portal responsiveness - portal removed                 |
