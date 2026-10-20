# Requirements Template

Use this skeleton for `rfp/<slug>/requirements.md`. Keep the headings, replace the
guidance, and delete sections that genuinely do not apply (never leave empty
headings). Unknowns go to Open Questions with an ID.

---

```markdown
# <Project Title>

## 1. Document control

| Field   | Value                       |
| ------- | --------------------------- |
| Slug    | `<slug>`                    |
| Date    | YYYY-MM-DD                  |
| Version | 1.0 (Draft)                 |
| Owner   | <business owner>            |
| Status  | Draft / In review / Approved |

## 2. Problem statement

3-6 sentences. Current situation, who is affected, what it costs (time, money,
errors, risk), and why now. No solution wording here.

## 3. Goals and success metrics

| ID   | Goal                    | Metric                          | Target  |
| ---- | ----------------------- | ------------------------------- | ------- |
| G-01 | <outcome the user wants> | <how it is measured>            | <value> |

## 4. Users and roles

| Role       | Description              | Key needs                    |
| ---------- | ------------------------ | ---------------------------- |
| <role>     | <who they are>           | <what they must do>          |

## 5. Scope

### In scope

- <capability included in this version>

### Out of scope

- <capability explicitly deferred> - <why / when>

## 6. Functional requirements

Requirement quality bar: an actor, a trigger, an action, and an observable outcome.
One requirement per row, no compound "and also" items.

| ID    | Requirement                                              | Actor   | Priority |
| ----- | -------------------------------------------------------- | ------- | -------- |
| FR-01 | <actor> can <action> when <trigger>, resulting in <outcome> | <role> | Must     |

Priority values: `Must`, `Should`, `Could` (MoSCoW).

For complex requirements add detail below the table:

### FR-01 <short title>

- Trigger:
- Main flow: 1. ... 2. ... 3. ...
- Alternate flow:
- Error handling:
- Notes:

## 7. Business rules and validations

| ID    | Rule                                  | Applies to | Error message / behavior |
| ----- | ------------------------------------- | ---------- | ------------------------ |
| BR-01 | <rule in testable terms>              | FR-01      | <what the user sees>     |

## 8. Data requirements

| Entity   | Key fields          | Source        | Retention        |
| -------- | ------------------- | ------------- | ---------------- |
| <entity> | <field, field, ...> | <who creates> | <period / policy> |

Include required vs optional fields, uniqueness rules, and audit fields
(created/updated by, timestamps) where relevant.

## 9. Integrations

| System   | Direction        | Purpose              | Protocol / format | Owner  |
| -------- | ---------------- | -------------------- | ----------------- | ------ |
| <system> | In / Out / Both  | <why it is needed>   | <REST, CSV, ...>  | <team> |

Note sandbox availability, credentials ownership, rate limits, and failure
behavior (retry, queue, manual fallback).

## 10. Non-functional requirements

| ID     | Category     | Requirement                                      | Measure / target     |
| ------ | ------------ | ------------------------------------------------ | -------------------- |
| NFR-01 | Performance  | Page load for <flow>                             | < 2s at p95          |
| NFR-02 | Security     | <access control / encryption requirement>        | <standard>           |

Cover only relevant categories: performance, availability, scalability, security,
privacy/compliance, usability, accessibility, localization, backup, audit.

## 11. Assumptions and constraints

- A-01: <assumption that must hold>
- C-01: <constraint: budget, tech stack, deadline, policy>

## 12. Risks

| ID   | Risk                    | Impact | Likelihood | Mitigation        |
| ---- | ----------------------- | ------ | ---------- | ----------------- |
| R-01 | <what could go wrong>   | High   | Medium     | <plan>            |

## 13. Open questions

| ID   | Question                       | Why it matters        | Owner  | Blocking |
| ---- | ------------------------------ | --------------------- | ------ | -------- |
| Q-01 | <unresolved decision>          | <affects FR-xx>       | <name> | Yes / No |

## 14. Acceptance criteria

High-level, business-readable conditions for sign-off. Detailed step-by-step checks
live in `test-cases.md`.

- [ ] AC-01: <condition that proves the goal is met>
- [ ] AC-02: <condition>

## 15. Glossary

| Term   | Meaning                        |
| ------ | ------------------------------ |
| <term> | <definition used in this RFP>  |

## 16. Changelog

| Version | Date       | Author | Change           |
| ------- | ---------- | ------ | ---------------- |
| 1.0     | YYYY-MM-DD | <name> | Initial draft    |
```

---

## Quality checks

- Every requirement is testable; no "fast", "secure", "user friendly" without a number.
- Every `FR-*` has an actor and priority.
- Every rule that changes behavior has a `BR-*` and a matching error behavior.
- Every unknown is a `Q-*`, not a guess hidden in the text.
- Out-of-scope list is explicit; silence is not a scope decision.
- Numbers in NFRs have units and measurement conditions.
