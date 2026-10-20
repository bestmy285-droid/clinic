# Build Checklist - Clinic Appointment Booking

Companion to [requirements.md](./requirements.md) (v1.5) and
[test-cases.md](./test-cases.md) (v1.5). This is the delivery handoff: what to build,
in what order, and what must be true before each gate opens.

Target go-live: **2026-12-15** (C-01). Staff-only web application. No portal, no
messaging integration.

## 1. Start gates

| ID   | Item                                                        | Blocks                     | Owner        | Status |
| ---- | ----------------------------------------------------------- | -------------------------- | ------------ | ------ |
| Q-07 | Exact patient export format and a sample file                | Phase 1 import, UAT data   | Clinic Admin | Open   |

Q-09 is closed (owner: Clinic Manager). Q-13, Q-14 and Q-15 are resolved:
confirmation is by phone call, the portal is removed, and date of birth is optional.

### External dependency

| ID   | Dependency                                                   | Needed by        | Owner        | Status |
| ---- | ------------------------------------------------------------ | ---------------- | ------------ | ------ |
| D-01 | Patient data export file (same source as Q-07)              | Phase 1 import   | Clinic Admin | Open   |

## 2. Delivery phases

Owner column is intentionally `TBD` - assign names at kickoff.

### Phase 1 - Foundation

| Task                                                        | Req                    | Done when                                                        |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Repo, dev/staging/prod environments, CI pipeline             | C-02                   | One-command deploy to staging, secrets outside the repo          |
| Schema and migrations (UTC timestamps, soft delete)          | §8, NFR-07             | Migration runs forward and back cleanly on staging               |
| Staff login + RBAC                                           | FR-16, NFR-04          | Matrix in FR-16 enforced server-side; TC-28 passes for staff     |
| Patient master + CSV import (DOB optional, mobile validated) | FR-01, A-02, Q-07      | Preview plus 15k-row import with duplicate/error report; TC-01, TC-02, TC-60 pass |
| Clinic settings (hours, holidays, horizon, slot size, call-list lead) | FR-20          | TC-32 passes; settings drive slot generation and the call list   |
| Audit log foundation                                         | FR-17, NFR-06          | Append-only; TC-29 passes for create/reschedule/cancel           |

### Phase 2 - Scheduling core

| Task                                                        | Req                    | Done when                                                        |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Availability model and editor                                | FR-02, BR-08           | TC-04, TC-05 pass                                                |
| Slot generation as a pure, unit-tested function              | FR-04, BR-05           | TC-06, TC-07 pass; no slot logic duplicated in UI                |
| DB uniqueness constraint on active `(doctor_id, slot_start)` | FR-06, BR-03           | Constraint exists in staging; direct SQL insert conflict proves it |
| Time off with impact list                                    | FR-03, BR-09           | TC-33 passes; cannot orphan active appointments                  |
| Holiday and working-hour handling                            | FR-20, FR-04           | Holiday blocks slots for all doctors                             |

### Phase 3 - Staff booking flows

| Task                                                        | Req                    | Done when                                                        |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Book appointment, reference generation, print on request     | FR-05, BR-02, BR-04    | TC-08, TC-09, TC-12, TC-13 pass; print layout usable             |
| Conflict handling and readable 409 responses                 | FR-06                  | TC-10, TC-11 pass; one active row under race                     |
| Reschedule                                                   | FR-07, BR-07           | TC-14, TC-15 pass                                                |
| Cancel with reason + cut-off                                 | FR-08, BR-06, BR-13    | TC-16, TC-17, TC-18 pass                                         |
| Walk-in registration                                         | FR-14                  | TC-26 passes                                                     |
| Day schedule view                                            | FR-12                  | TC-24 passes                                                     |
| Doctor today list + status actions                           | FR-13, FR-09, BR-12    | TC-19, TC-20, TC-25 pass                                         |
| Appointment search and filters                               | FR-15                  | TC-27 passes                                                     |
| Next-day call list (generate, filter, print)                 | FR-27, FR-20           | TC-58 passes; no PHI on the list                                 |
| Phone read-back prompt on the booking screen                 | FR-05, AC-12, R-11     | Doctor, date, time, and reference visible in one block for read-back |

### Phase 4 - Reporting and administration

| Task                                                        | Req                    | Done when                                                        |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Daily CSV report                                             | FR-18                  | TC-30 passes; counts reconcile with the schedule view            |
| User and role management                                     | FR-16                  | Admin can create/disable staff accounts; TC-28 passes            |
| Settings UI for all FR-20 values                             | FR-20                  | Changes apply without a deploy; audit entry recorded             |

### Phase 5 - Hardening

| Task                                                        | Req                    | Done when                                                        |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Load tests (schedule and booking)                            | NFR-01, NFR-02         | TC-34, TC-35 pass on production-like data                        |
| Security: RBAC review, TLS, encryption at rest, session policy | NFR-04, NFR-05, C-06 | TLS scan clean; no public exposure beyond agreed network boundary |
| Accessibility pass                                           | NFR-08                 | TC-38 passes; no critical axe issues                             |
| Backup and restore (application)                            | NFR-07, NFR-11         | TC-39 passes; infrastructure restore drill remains an ops task   |
| Log and export PHI review                                    | NFR-05                 | TC-57 passes; no free-text reason in logs or URLs                |
| Monitoring and alerting (uptime, booking errors, failed upgrades) | NFR-03            | Alerts reach the on-call owner; dashboard shows G-01..G-04       |

### Phase 6 - UAT and go-live

| Task                                                        | Req                    | Done when                                                        |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| UAT with all three roles                                     | FR-16, AC-06           | UAT script signed by reception, doctor, and admin                |
| Two-week parallel run with the paper register                | AC-02, AC-05, R-02     | Zero double bookings; daily reconciliation has no unexplained gaps |
| Staff training and quick-reference card                      | R-02                   | All reception and doctor users trained                           |
| Read-back script rehearsed                                   | AC-12, R-11            | TC-59 observed on 10 calls; all four details read back           |
| Call-list routine rehearsed                                  | AC-11, G-01, R-10      | Reception produces and works the list for 5 consecutive days     |
| Go/no-go review                                              | AC-01, AC-02, AC-04, AC-05, AC-06, AC-11, AC-12 | Evidence attached for every active criterion |

## 3. Definition of done (per task)

A task is done only when all of these are true:

- [ ] Code merged with review; no direct pushes to main
- [ ] Unit tests cover the business rule it implements
- [ ] The linked test case ID from `test-cases.md` passes on staging
- [ ] Audit entry written where FR-17 applies
- [ ] Error messages match the wording in BR-* and are translated
- [ ] No PHI in logs, URLs, exports, or analytics events
- [ ] Feature flag or deploy note added if behaviour is user-visible

## 4. Phase gates

| Gate         | Must pass                                       | Also verify                                   |
| ------------ | ----------------------------------------------- | --------------------------------------------- |
| G1 Foundation| TC-01, TC-28, TC-29                             | Import rows and duplicate-mobile report reconciled |
| G2 Scheduling| TC-04, TC-06, TC-07, TC-33                      | Slot counts match a manual calculation         |
| G3 Staff     | TC-08, TC-10, TC-11, TC-14, TC-16, TC-17, TC-19 | No double booking in a 2-hour soak test        |
| G4 Reporting | TC-30, TC-58                                    | Call list produced for 3 consecutive days      |
| G5 Hardening | TC-34, TC-35, TC-57                             | Restore drill passed, no PHI in logs           |
| G6 Go-live   | All 13 P0 cases                                 | AC-01, AC-02, AC-04, AC-05, AC-06, AC-11, AC-12 signed off |

The 13 P0 cases are TC-01, TC-04, TC-06, TC-07, TC-08, TC-10, TC-11, TC-14, TC-16,
TC-17, TC-19, TC-28 and TC-33.

## 5. Go-live checklist

- [ ] Patient import reconciled: source rows = imported + rejected, with a rejection list
- [ ] Duplicate mobile report reviewed by reception and merged where needed
- [ ] Backups running and one restore verified in the last 7 days
- [ ] Monitoring alerts tested by triggering one synthetic failure
- [ ] Reference slip printer and paper stock verified at reception
- [ ] Read-back script printed at every desk and covered in training
- [ ] Call-list routine assigned to a named person for the first 2 weeks
- [ ] Paper register policy agreed for the parallel run
- [ ] Rollback plan: previous release and a verified database restore point
- [ ] Support roster for the first 7 days, including evenings

## 6. Rollback triggers

- Any confirmed double booking
- Booking API error rate above 5% for 15 minutes
- Any PHI found in logs, URLs, or exports
- Appointment data loss or a failed migration discovered after cutover

## 7. Watchlist

| Risk | Early signal                                      | Response                                      |
| ---- | ------------------------------------------------- | --------------------------------------------- |
| R-02 | Reception still writes the paper register after week 1 | Manager review of daily reconciliation    |
| R-03 | Import rejection rate above 5% or many duplicate mobiles | Manual cleanup sprint before UAT        |
| R-05 | Conflicts reported during the morning rush        | Confirm DB constraint, review API logs        |
| R-10 | No-show rate flat after 30 days                   | Review call-list adherence; revisit reminders for v2 |
| R-11 | Patients arriving on the wrong day or time        | Reinforce read-back, spot-check 10 calls/week |
