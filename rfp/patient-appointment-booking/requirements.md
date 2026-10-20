# Clinic Appointment Booking

## 1. Document control

| Field   | Value                                        |
| ------- | -------------------------------------------- |
| Slug    | `patient-appointment-booking`                |
| Date    | 2026-10-20                                   |
| Version | 1.5 (Approved for build)                     |
| Owner   | Clinic Manager                               |
| Status  | Approved for build 2026-10-20                |

## 2. Problem statement

The clinic currently books appointments in a paper register and over the phone.
Reception staff cannot see a doctor's real availability while the patient is on the
call, so double bookings are discovered only when the patient arrives. Reminder calls
are ad hoc: whoever is free scans the register, and there is no reliable list of who
still needs a call. Roughly 30% of booked patients do not turn up, leaving paid doctor
time idle. Cancellations are verbal and untracked, so nobody can explain why slots
went empty. Management has no reliable daily count of booked, completed, no-show, and
cancelled visits.

## 3. Goals and success metrics

| ID   | Goal                              | Metric                                              | Target          |
| ---- | --------------------------------- | --------------------------------------------------- | --------------- |
| G-01 | Reduce patient no-shows           | No-show appointments / total appointments, 30 days  | from 30% to ≤20% |
| G-02 | Book faster at the reception desk | Median time from patient identified to confirmed    | ≤60 seconds     |
| G-03 | Eliminate double bookings         | Overlapping active appointments per doctor          | 0               |
| G-04 | Every cancellation is explained   | Cancelled appointments with a reason recorded       | 100%            |

There is no automated reminder and no patient-facing app in v1. G-01 is pursued through
a next-day call list generated from the schedule, plus a standard read-back script on
phone bookings.

## 4. Users and roles

| Role        | Description                                       | Key needs                                                        |
| ----------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Receptionist| Front-desk staff, 4 users, high turnover          | Find patient fast, see true availability, book/reschedule/cancel |
| Doctor      | 9 consulting doctors, low system patience         | Today's list, mark check-in/complete/no-show, block leave        |
| Clinic Admin| Manager + 1 assistant                             | Settings, users, reports, override cut-off, full visibility      |

Patients are not system users in v1. They are informed of the appointment by phone or
at the desk, and reception works from a printed call list.

## 5. Scope

### In scope

- Patient registration and search (staff only)
- Doctor weekly availability, slot generation, time off
- Booking, reschedule, cancel, walk-in registration
- On-screen confirmation with reference; print on request
- Appointment status tracking through the visit
- Next-day call list for manual reminder calls
- Day schedule view, doctor's daily list, basic daily CSV report
- Role-based access, audit trail, clinic settings

### Out of scope

- Patient self-service portal - removed from v1 (Q-14)
- SMS, WhatsApp, or email notifications - none in v1
- Automated reminders - staff call patients from the call list
- Native iOS/Android app
- Patient self-registration - staff or import only
- Payments, billing, invoicing - stays in existing billing software (C-04)
- Clinical notes, prescriptions, EMR - separate system
- Telemedicine / video consultation
- Insurance and claim handling
- Multi-branch scheduling - v2 (Q-03)

## 6. Functional requirements

Priority uses MoSCoW: `Must` for v1 go-live.

| ID    | Requirement                                                                                          | Actor         | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------- | -------- |
| FR-01 | A receptionist can create a patient record (name, mobile, optional date of birth and email, gender) and find it by mobile number or name; results show the next active appointment. | Receptionist | Must |
| FR-02 | A doctor or admin can define weekly availability blocks per doctor (weekday, start time, end time, slot duration). | Doctor, Admin | Must |
| FR-03 | A doctor or admin can register time off for a date range with a reason; the system lists every active appointment that overlaps the range. | Doctor, Admin | Must |
| FR-04 | The system derives bookable slots for a doctor and date from availability, minus booked slots, time off, and clinic holidays. | System | Must |
| FR-05 | A receptionist can book an available slot for an existing patient, producing a confirmed appointment with a unique reference shown on screen and printable on request. | Receptionist | Must |
| FR-06 | The system rejects any booking, reschedule, or walk-in that would create a second active appointment for the same doctor at the same start time, including under concurrent requests. | System | Must |
| FR-07 | A receptionist can move an active appointment to another available slot with the same doctor, and the old slot becomes bookable again. | Receptionist | Must |
| FR-08 | A receptionist or admin can cancel an active appointment with a mandatory reason; the slot is released immediately. | Receptionist, Admin | Must |
| FR-09 | The system tracks appointment status through Booked, Confirmed, Checked-in, Completed, No-show, and Cancelled, allowing only the defined transitions. | System | Must |
| FR-12 | A receptionist can open a day schedule for a doctor and date and see all slots with patient and status. | Receptionist | Must |
| FR-13 | A doctor can see only their own appointments for today and mark Checked-in, Completed, or No-show. | Doctor | Must |
| FR-14 | A receptionist can register a walk-in patient against the current or next slot without advance booking; the appointment is flagged as walk-in. | Receptionist | Should |
| FR-15 | A receptionist or admin can search appointments by patient mobile, patient name, doctor, date range, and status. | Receptionist, Admin | Should |
| FR-16 | The system enforces role-based access: receptionists manage patients and bookings, doctors act only on their own list, admins manage settings, users, and reports, and only admins can override the cancellation cut-off. | System | Must |
| FR-17 | The system records an audit entry for every create, reschedule, cancel, status change, and settings change, including actor, timestamp, and before/after values. | System | Must |
| FR-18 | A receptionist or admin can export a daily report as CSV with per-doctor booked, completed, no-show, and cancelled counts. | Receptionist, Admin | Should |
| FR-20 | An admin can configure working hours, holidays, default slot duration, booking horizon, and the lead time used to generate the next-day call list. | Admin | Must |
| FR-27 | A receptionist can generate and print the next-day call list for a doctor or the whole clinic, showing patient name, mobile, time, doctor, and reference. | Receptionist | Must |

FR-10 (confirmation SMS), FR-11 (reminder SMS), FR-19 (notification delivery log) were
withdrawn in v1.4 when SMS was removed. FR-21 to FR-26 (patient self-service portal)
were withdrawn in v1.5. IDs are not reused so earlier reviews and test references stay
traceable.

### FR-05 Book an appointment

- Trigger: receptionist selects a patient, doctor, date, and an available slot.
- Main flow: 1) show slot grid. 2) select a slot. 3) system re-checks availability.
  4) system saves the appointment and generates reference `APT-YYYYMMDD-####`.
  5) reference is shown on screen and can be printed on request. 6) the appointment
  appears in the day schedule.
- Alternate flow: slot was taken meanwhile - system shows "Slot just taken" and
  refreshes the grid without losing the selected patient.
- Error handling: network failure shows a retry option; no partial appointment is left
  behind.
- Phone bookings: reception reads back doctor, date, time, and reference before ending
  the call (AC-12).

### FR-06 Conflict prevention

- Trigger: any write path that occupies a slot (book, reschedule, walk-in, time off).
- Rule: a database-level uniqueness constraint for active appointments on
  `(doctor_id, slot_start)` is authoritative; application checks are only for UX.
- Concurrent requests: exactly one succeeds, the other receives a conflict response
  and a readable message. No silent overwrite.
- Exceptions: none in v1 - overbooking is explicitly not allowed (Q-04).

### FR-09 Status lifecycle

| From       | Allowed to                   | Actor                     |
| ---------- | ---------------------------- | ------------------------- |
| Booked     | Confirmed, Cancelled, No-show | Receptionist, Admin, System |
| Confirmed  | Checked-in, Cancelled, No-show | Receptionist, Admin      |
| Checked-in | Completed                    | Doctor, Receptionist, Admin |
| Completed  | - (terminal)                 | -                         |
| No-show    | - (terminal)                 | -                         |
| Cancelled  | - (terminal)                 | -                         |

Booked may move to No-show automatically at end of day if never checked in
(see Q-06).

### FR-16 Access matrix

| Capability                     | Receptionist | Doctor | Admin |
| ------------------------------ | ------------ | ------ | ----- |
| Create/edit patient            | Yes          | No     | Yes   |
| Book for any patient           | Yes          | No     | Yes   |
| Reschedule                     | Yes          | No     | Yes   |
| Cancel before cut-off          | Yes          | No     | Yes   |
| Cancel after cut-off           | No           | No     | Yes   |
| View own schedule              | Yes          | Yes    | Yes   |
| View all schedules             | Yes          | No     | Yes   |
| Change appointment status      | Yes          | Own    | Yes   |
| Manage availability / time off | No           | Own    | Yes   |
| Manage users and settings      | No           | No     | Yes   |
| Export reports                 | Yes          | No     | Yes   |

## 7. Business rules and validations

| ID    | Rule                                                                                       | Applies to | Error message / behavior                                   |
| ----- | ------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| BR-01 | Mobile number is required, 10 digits, starting 6-9. Duplicate mobiles are allowed for family members but the UI must warn before creating. Date of birth is optional. | FR-01 | "Enter a valid 10-digit mobile number" / "This number already belongs to <name>" |
| BR-02 | An appointment may not start in the past.                                                | FR-05, FR-07 | "Selected time has already passed"                        |
| BR-03 | Exactly one active appointment per doctor per slot start time.                             | FR-06      | "This slot is already booked"                              |
| BR-04 | A patient may hold at most 3 active future appointments across the clinic.                 | FR-05      | "Patient already has 3 upcoming appointments"              |
| BR-05 | Booking horizon defaults to 60 days, configurable 1-180 days.                              | FR-04, FR-05 | "Bookings open only up to <n> days ahead"                |
| BR-06 | Receptionist cancellation is allowed until 2 hours before start; after that only admin.    | FR-08      | "Cut-off passed - ask the clinic manager"                  |
| BR-07 | Maximum 2 reschedules per appointment; the 3rd attempt requires cancel and rebook.         | FR-07      | "Reschedule limit reached for this appointment"            |
| BR-08 | Slot durations allowed: 10, 15, 20, 30, 45, 60 minutes.                                    | FR-02      | "Unsupported slot duration"                                |
| BR-09 | Time off cannot be saved while active appointments overlap it; resolve them first.         | FR-03      | Lists blocking appointments and offers reschedule/cancel    |
| BR-12 | Completed and No-show can be set only after the slot start time.                           | FR-09      | "Cannot complete an appointment that has not started"      |
| BR-13 | Cancellation reason is mandatory: pick a category and optionally add free text of 3-200 characters. | FR-08 | "Select a cancellation reason"                            |

BR-10, BR-11 (SMS) and BR-14 to BR-20 (patient access, self-service limits) were
withdrawn in v1.4 and v1.5.

## 8. Data requirements

| Entity          | Key fields                                                                 | Source        | Retention          |
| --------------- | -------------------------------------------------------------------------- | ------------- | ------------------ |
| Patient         | id, full name, mobile, dob (optional), gender, email (opt), created_by, created_at, updated_at | Receptionist | 7 years, soft delete |
| Doctor          | id, name, specialty, default slot duration, active flag                    | Admin         | Indefinite         |
| Availability    | id, doctor_id, weekday, start_time, end_time, slot_minutes, effective_from | Doctor/Admin  | Indefinite, versioned |
| TimeOff         | id, doctor_id, start_at, end_at, reason, created_by                        | Doctor/Admin  | 2 years            |
| Appointment     | id, reference, patient_id, doctor_id, slot_start, slot_end, status, channel (staff/walk-in), reschedule_count, cancel_reason, created_by, timestamps | Receptionist | 7 years |
| AuditLog        | id, actor_type (staff/system), actor_id, action, entity, entity_id, before_json, after_json, at | System | 2 years, immutable |
| ClinicSettings  | working_hours, holidays, default_slot_minutes, booking_horizon_days, call_list_lead_hours (24) | Admin | Indefinite |

Rules: appointment reference is unique and human-readable. All timestamps stored in
UTC and displayed in Asia/Kolkata. AuditLog is append-only. Patient date of birth is
optional and must not block booking or import.

## 9. Integrations

| System        | Direction | Purpose                        | Protocol / format        | Owner        |
| ------------- | --------- | ------------------------------ | ------------------------ | ------------ |
| Patient import| In        | One-time load of existing list | CSV upload               | Clinic Admin (Q-07) |
| Reporting     | Out       | Daily CSV export               | CSV download             | Clinic Admin |

No outbound messaging integration exists in v1. Confirmation is verbal and on screen.
This is a deliberate scope decision, not an unfinished item.

## 10. Non-functional requirements

| ID     | Category     | Requirement                                                        | Measure / target                          |
| ------ | ------------ | ------------------------------------------------------------------ | ----------------------------------------- |
| NFR-01 | Performance  | Day schedule view loads in normal clinic load                       | p95 ≤ 2s at 50 concurrent users, 60k appointments |
| NFR-02 | Performance  | Booking confirmation response                                       | p95 ≤ 800ms                               |
| NFR-03 | Availability | Service available during clinic hours                               | 99.5% monthly, 07:00-22:00 IST            |
| NFR-04 | Security     | Server-side RBAC, idle session timeout, staff password policy       | 15 min idle, min 10 chars, lockout after 5 fails |
| NFR-05 | Privacy      | Patient data encrypted in transit and at rest; no PHI in logs or exports | TLS 1.2+, AES-256 at rest           |
| NFR-06 | Audit        | Append-only audit trail                                             | 2 years, tamper-evident                   |
| NFR-07 | Data         | Appointment history retained, soft delete only                      | 7 years                                   |
| NFR-08 | Accessibility| Booking and schedule screens usable by keyboard and screen reader   | WCAG 2.1 AA                               |
| NFR-09 | Localization | Timezone and display format                                         | Asia/Kolkata, 12-hour AM/PM, English + Hindi labels |
| NFR-10 | Compatibility| Supported browsers                                                  | Chrome and Edge, last 2 major versions, min 1366x768 |
| NFR-11 | Backup       | Daily encrypted backup with tested restore                          | RPO 24h, RTO 4h, quarterly drill           |

NFR-12 and NFR-13 (mobile portal and patient access security) were withdrawn with the
portal in v1.5.

## 11. Assumptions and constraints

- A-01: v1 serves a single clinic location.
- A-02: ~15,000 existing patients will be imported once from a CSV export.
- A-04: Staff use clinic-managed accounts; SSO and 2FA are not required in v1.
- A-05: One appointment involves exactly one doctor; no multi-doctor or multi-service bookings.
- A-08: The patient master has mostly correct mobile numbers, which the call list depends on.
- A-10: Reception tells the patient the doctor, date, time, and reference by phone or at the desk. No confirmation is sent automatically.
- C-01: Target go-live 2026-12-15, allowing a 2-week parallel run with the paper register.
- C-02: Hosting stays in the clinic's existing cloud account, India region.
- C-04: Existing billing software will not be modified in v1.
- C-06: The application is used by clinic staff on clinic devices; it is not exposed to the public internet in v1.

A-03, A-06 and A-07 (SMS vendor, smartphones, OTP delivery) were withdrawn with SMS
and the portal.

## 12. Risks

| ID   | Risk                                                        | Impact | Likelihood | Mitigation                                            |
| ---- | ----------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------- |
| R-02 | Staff keep using the paper register alongside the system    | Medium | High       | Training, 2-week parallel run, admin daily reconciliation |
| R-03 | Imported patient data has duplicates and bad mobiles        | Medium | High       | Dedupe report and manual review before import          |
| R-05 | Race conditions during the 09:00 booking rush               | High   | Low        | DB uniqueness constraint plus load test (TC-11, TC-34) |
| R-10 | No reminders, so the no-show goal is missed                 | High   | Medium     | Daily call list from the schedule; measure weekly; revisit messaging in v2 |
| R-11 | Phone bookings are misheard or written down wrongly         | Medium | Medium     | Read-back script (AC-12), reference on screen, audit trail |

R-01, R-04, R-06 (SMS/OTP failures), R-07, R-08 and R-09 (public portal exposure) were
withdrawn.

## 13. Open questions

| ID   | Question                                                        | Why it matters            | Owner        | Blocking |
| ---- | --------------------------------------------------------------- | ------------------------- | ------------ | -------- |
| Q-02 | ~~Is patient self-booking required in v1?~~ **Withdrawn 2026-10-20: portal removed from v1.** | - | - | No |
| Q-03 | When is multi-branch needed?                                    | Data model, v2 scope      | Clinic Manager | No     |
| Q-04 | ~~Allow overbooking for specific doctors?~~ **Resolved 2026-10-20: no overbooking in v1.** | FR-06 | - | No |
| Q-05 | ~~Reminder lead time?~~ **Withdrawn - no automated reminders.** | -                         | -            | No     |
| Q-06 | Should Booked auto-convert to No-show at end of day?            | FR-09 automation          | Clinic Manager | No     |
| Q-07 | Patient data exists and will be provided; exact export format still to be shared. | Import effort, A-02 | Clinic Admin | Yes |
| Q-08 | ~~WhatsApp or voice fallback?~~ **Withdrawn - no messaging.**    | -                         | -            | No     |
| Q-09 | Business owner confirmed: Clinic Manager.                       | Governance, sign-off      | Clinic Manager | No     |
| Q-10 | ~~Remember this device?~~ **Withdrawn - no portal.**             | -                         | -            | No     |
| Q-11 | ~~No-show self-service block threshold?~~ **Withdrawn - no portal.** | -                     | -            | No     |
| Q-12 | ~~Profiles per mobile?~~ **Withdrawn - no portal.**              | -                         | -            | No     |
| Q-13 | ~~How are patients informed?~~ **Resolved 2026-10-20: by phone call, plus on-screen reference.** | FR-05, AC-12 | - | No |
| Q-14 | ~~Is mobile + DOB acceptable for portal access?~~ **Resolved: portal removed from v1.** | Scope | - | No |
| Q-15 | ~~Is date of birth mandatory?~~ **Resolved: no, date of birth stays optional.** | FR-01 | - | No |

Only Q-07 remains blocking.

## 14. Acceptance criteria

- [ ] AC-01: Across 20 observed bookings, median desk time is ≤60 seconds (G-02).
- [ ] AC-02: A two-week parallel run produces zero double bookings (G-03).
- [ ] AC-04: No-show rate is ≤20% within 90 days of go-live (G-01).
- [ ] AC-05: 100% of cancelled appointments carry a reason, and the daily CSV reconciles with the paper register (G-04).
- [ ] AC-06: All three roles pass the access matrix in FR-16 with no unauthorized access.
- [ ] AC-11: The daily call list is produced for every clinic day and used by reception (G-01 support).
- [ ] AC-12: Reception reads back doctor, date, time, and reference on every observed phone booking (R-11).

AC-03, AC-07, AC-09 (SMS) and AC-08, AC-10 (portal) were withdrawn.

## 15. Glossary

| Term              | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| Slot              | A bookable start time and duration derived from a doctor's availability |
| Active appointment| Booked, Confirmed, or Checked-in - occupies the slot                    |
| Time off          | A blocked period when the doctor is unavailable                          |
| Walk-in           | A patient seen without a prior booking, placed in the current/next slot |
| No-show           | Patient did not arrive and did not cancel before the slot               |
| Cut-off           | 2 hours before slot start, after which reception cannot cancel          |
| PHI               | Protected health information, e.g. diagnosis or visit reason            |
| Call list         | Next-day list reception uses to phone patients and confirm attendance    |

## 16. Changelog

| Version | Date       | Author   | Change                                                |
| ------- | ---------- | -------- | ----------------------------------------------------- |
| 0.1     | 2026-10-20 | AI draft | Initial structure from a 30-minute intake assumption pass |
| 1.0     | 2026-10-20 | AI draft | Added acceptance criteria, access matrix, open questions |
| 1.1     | 2026-10-20 | AI draft | Added patient self-service with OTP; fixed 24h reminder; removed overbooking |
| 1.2     | 2026-10-20 | AI draft | Approved for build; added `build-checklist.md` |
| 1.3     | 2026-10-20 | AI draft | Removed SMS vendor selection from delivery scope |
| 1.4     | 2026-10-20 | AI draft | Removed SMS entirely; OTP replaced by mobile + DOB |
| 1.5     | 2026-10-20 | AI draft | Removed the patient portal (FR-21 to FR-26), self-service rules and NFR-12/13; DOB optional; confirmation by phone call and on-screen reference; added FR-27 call list; owner set to Clinic Manager; Q-07 only open blocker |
