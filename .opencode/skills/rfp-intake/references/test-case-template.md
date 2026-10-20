# Test Case Template

Use this skeleton for `rfp/<slug>/test-cases.md`. Derive everything from
`requirements.md` in the same folder. If a test needs behavior that is not
specified, add an open question instead of assuming.

---

```markdown
# <Project Title> - Test Cases

Companion to [requirements.md](./requirements.md). Version 1.0, YYYY-MM-DD.

## 1. Test scope and environment

| Item          | Value                                        |
| ------------- | -------------------------------------------- |
| In scope      | <FR ranges, flows>                           |
| Out of scope  | <explicitly untested areas and why>          |
| Environment   | <dev / staging / UAT>                        |
| Devices       | <browser, OS, mobile models>                 |
| Test data     | <source of accounts, seed data>              |
| Roles needed  | <roles and credentials source>               |

## 2. Coverage summary

| Requirement | Covered by        | Status            |
| ----------- | ----------------- | ----------------- |
| FR-01       | TC-01, TC-02      | Covered           |
| NFR-01      | TC-14             | Covered           |
| FR-09       | -                 | Blocked by Q-03   |

## 3. Test cases

Priority: `P0` release blocker, `P1` important, `P2` nice to have.
Type: Functional, Negative, Boundary, Permission, Integration, Data, Security,
Performance, Usability.

| ID    | Title                        | Type       | Priority | Req    | Preconditions           | Steps                                  | Expected result                    |
| ----- | ---------------------------- | ---------- | -------- | ------ | ----------------------- | -------------------------------------- | ---------------------------------- |
| TC-01 | Create appointment           | Functional | P0       | FR-01  | Patient exists          | 1. Open booking<br>2. Pick slot<br>3. Save | Appointment saved and listed   |
| TC-02 | Booking without required field | Negative | P1       | BR-01  | Patient exists          | 1. Leave phone empty<br>2. Save        | Inline error, no record created    |

Keep one behavior per row. Split rows longer than ~5 steps into a detailed case
below the table.

### TC-01 Create appointment

- Requirement: FR-01
- Data: patient `P-1001`, slot `10:00`
- Steps:
  1. Log in as receptionist.
  2. Open the booking screen for the patient.
  3. Select the 10:00 slot and confirm.
- Expected: appointment appears in the day schedule and in the patient history.
- Post-checks: audit entry created with user and timestamp.

## 4. Gherkin scenarios

Write Gherkin for every `P0` case and for multi-step flows. Use one `Feature` per
requirement group and declarative steps (business language, not UI clicks).

```gherkin
Feature: Appointment booking

  Background:
    Given a receptionist is signed in
    And patient "P-1001" exists

  @P0 @FR-01
  Scenario: Book an available slot
    Given the slot "10:00" is available
    When the receptionist books the slot for patient "P-1001"
    Then the appointment is confirmed
    And the slot "10:00" is no longer available

  @P1 @BR-01 @negative
  Scenario: Reject booking without a phone number
    Given the patient has no phone number
    When the receptionist tries to book the slot "10:00"
    Then the booking is rejected with "Phone number is required"
    And no appointment is created

  @P1 @FR-04 @boundary
  Scenario Outline: Booking limit per patient
    When the receptionist books <count> future appointments for the patient
    Then the result is <outcome>

    Examples:
      | count | outcome                    |
      | 1     | accepted                   |
      | 3     | accepted                   |
      | 4     | rejected with limit message |
```

## 5. Non-functional test notes

| NFR    | How to test                          | Tool / setup                  | Pass condition        |
| ------ | ------------------------------------ | ----------------------------- | --------------------- |
| NFR-01 | Load test booking flow, 200 users    | k6 script, staging dataset    | p95 < 2s, errors < 1% |

## 6. Traceability gaps

- FR-09: waiting on Q-03 (SMS provider choice).
- NFR-04: no measurable target provided yet; see Q-05.

## 7. Open test questions

| ID    | Question                              | Blocks          |
| ----- | ------------------------------------- | --------------- |
| TQ-01 | <test data question>                  | TC-07           |
```

---

## Quality checks

- Every `FR-*` and `NFR-*` from `requirements.md` appears in the coverage summary.
- Each `P0` case has a Gherkin scenario.
- Happy path, negative, boundary, permission, and integration cases all exist.
- Steps are reproducible by someone who did not write them.
- Expected results are observable; no "works correctly" or "shows message".
- No test depends on an unanswered `Q-*` without being marked blocked.
