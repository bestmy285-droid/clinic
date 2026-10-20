---
name: RFP Intake
description: Collect detailed requirements from the user through a short interview, then create a new rfp/<kebab-case-slug>/ folder containing requirements.md and test-cases.md. Use when the user asks to create a new RFP, requirement document, feature spec, or test cases for a feature.
---

# RFP Intake

Turn a rough idea into a review-ready RFP package:

```
rfp/
└── <kebab-case-slug>/
    ├── requirements.md
    └── test-cases.md
```

Both files are always produced together. Requirements drive the tests; tests never
invent behavior that is not in `requirements.md`.

Reply to the user in their own language (Hinglish is fine), but keep the written
documents in clear English unless the user asks otherwise.

## Ground rules

- Never overwrite an existing `rfp/<slug>/`. Pick a different slug or ask first.
- Never invent requirements. Anything unknown goes to **Open Questions** as `TBD`.
- Ask before creating any file beyond the two documents above.
- Do not write application code, only Markdown.
- Use the `question` tool for choices; use plain text for open-ended answers.
- Match the user's level of detail. A tiny internal tool needs a short RFP, not 40 pages.

## Workflow

### 0. Check the workspace

1. Locate the project root (the working directory).
2. Check whether `rfp/` exists. Create it if missing.
3. List `rfp/` and note existing folder names so the new slug does not collide.
4. Read the user's original message and keep a list of facts already given. Do not
   re-ask anything already answered.

### 1. Interview (2-3 rounds, grouped)

Ask **2-3 rounds** of grouped questions. Maximum 6 questions per round. Stop as soon
as you can write a complete RFP; do not run all rounds mechanically.

**Round 1 - Problem and scope**

- What problem does this solve, and for whom (roles/personas)?
- What does success look like (measurable goals or metrics)?
- What is in scope and explicitly out of scope for this version?
- Is there an existing system, spreadsheet, or reference product to match?
- Target timeline, priority, or release window?
- Who is the business owner / decision maker?

**Round 2 - Functional detail**

- Main user flows, step by step, for each role.
- Data captured, key fields, and where the data comes from.
- Business rules, validations, limits, and approval steps.
- Integrations (payments, SMS/email, accounting, government/insurance APIs, SSO).
- Notifications, reports, exports, and dashboards needed.
- Permissions and data visibility per role.
- Edge cases and failure handling the user already knows about.

**Round 3 - Non-functional and delivery**

- Platforms and devices (web, mobile, desktop, offline support).
- Expected load, performance targets, availability.
- Security, privacy, and compliance requirements (e.g. patient data, audit trail).
- Localization, currency, timezone, accessibility.
- Environments, test data, and definition of done.
- Acceptance expectations: who signs off, and how.

Interview behavior:

- Ask the round, then **wait** for the answers before asking the next round.
- When an answer is vague ("fast", "secure", "user friendly"), ask one focused
  follow-up that turns it into something testable.
- Offer sensible options in `question` instead of open blanks when the domain is
  common. Include a recommended option first.
- Summarize what you understood before writing files, and correct any mismatch.

### 2. Choose the folder slug

- English, ASCII, lowercase, kebab-case: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- 3-6 meaningful words from the requirement domain, no generic words like
  `new-project` or `rfp-1`.
- No dates, no version numbers, no names of people.
- Examples:
  - "patient appointment booking with SMS reminders" -> `patient-appointment-booking`
  - "stock transfer between clinic branches" -> `branch-stock-transfer`
  - "insurance claim submission portal" -> `insurance-claim-portal`
- If the slug already exists in `rfp/`, either extend the slug with a distinguishing
  word or ask the user whether to update the existing RFP.

### 3. Write `rfp/<slug>/requirements.md`

Follow `references/requirements-template.md` in this skill directory. Required
sections, in order:

1. Document control (title, slug, date, version, status, owner)
2. Problem statement
3. Goals and success metrics
4. Users and roles
5. Scope (in scope / out of scope)
6. Functional requirements, each with a stable ID: `FR-01`, `FR-02`, ...
7. Business rules and validations (`BR-01`, ...)
8. Data requirements (entities, key fields, retention)
9. Integrations
10. Non-functional requirements (`NFR-01`, ...)
11. Assumptions and constraints
12. Risks
13. Open questions (`Q-01`, ...) with owner and blocking status
14. Acceptance criteria
15. Glossary
16. Changelog

Every functional requirement must be specific enough to test: actor, action,
trigger, and outcome. Avoid words like "appropriate", "properly", "etc.".

### 4. Write `rfp/<slug>/test-cases.md`

Follow `references/test-case-template.md`. Required content:

1. Scope and environment for testing
2. Coverage summary (which FR/NFR are covered, which are not and why)
3. Test case table: `TC-01`, title, type, priority, linked requirement,
   preconditions, steps, expected result
4. Gherkin scenarios (`Given/When/Then`) for every P0 case and for multi-step flows
5. Negative, boundary, permission, and integration cases - not just happy paths
6. Traceability: every `FR-*` and `NFR-*` maps to at least one test case
7. Open test questions that depend on unanswered `Q-*` items

Priority convention: `P0` release blocker, `P1` important, `P2` nice to have.
Test types: Functional, Negative, Boundary, Permission, Integration, Data,
Security, Performance, Usability.

### 5. Verify and report

Before finishing:

- Both files exist and are non-empty.
- Every `FR-*` appears in `test-cases.md` traceability.
- Open questions have IDs and no silent assumptions remain in the body.
- No placeholder text like `[TBD]` outside the Open Questions section.
- Folder name matches the slug rules.

Then report to the user, in their language:

- Absolute paths of the folder and both files.
- Counts: functional requirements, non-functional requirements, test cases, P0 cases,
  open questions.
- The 2-3 most important open questions that block sign-off.
- Suggested next step (review, answer open questions, then build).

## References

- `references/requirements-template.md` - skeleton and quality bar for `requirements.md`
- `references/test-case-template.md` - skeleton, table format, and Gherkin examples
