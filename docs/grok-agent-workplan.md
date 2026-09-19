# Grok agent work plan

This document is the implementation brief for a Grok coding agent working on
One Minute Utopia. The goal is a convincing HopHacks Baltimore demo:

> A resident photographs a civic issue, AI identifies it, the app prepares the
> correct Baltimore 311 report, and repeated nearby reports become one stronger
> incident record.

The project is a **report-preparation demo**. It must not claim that reports are
submitted to Baltimore City. The current Baltimore 311 public Open311 endpoint
is unavailable and the newer portal interface requires authentication. Do not
automate the city website, reverse-engineer private endpoints, bypass login, or
label an internal database write as a city submission.

## Working rules

- Work in `C:\Users\Sreyan Das\Documents\GitHub\oneminuteutopia`.
- Make backend changes only unless a task below explicitly names a UI file.
- Do not modify the in-progress visual redesign in `app/page.tsx` or global CSS.
- Do not add volunteer coordinator features, assignments, dispatch, or scheduling.
- Do not replace the normalized taxonomy or broad category contract.
- Never expose Supabase service credentials, Gemini keys, provider response
  bodies, session IDs, or database URLs to the browser or logs.
- Preserve manual reporting when Gemini is unavailable.
- Treat emergency classifications as instructions to call 911, never as 311
  submission candidates.
- Run `npm run test:analysis`, `npm run typecheck`, and changed-file lint before
  handing work back. Do not commit secrets or `.env.local`.

Read these files before editing:

- `docs/image-analysis.md`
- `docs/incident-intelligence.md`
- `docs/baltimore-reporting-catalog.md`
- `lib/report-pipeline.ts`
- `lib/db.ts`
- `lib/incident-taxonomy.mjs`
- `lib/baltimore-311-routing.mjs`
- `app/api/upload/route.ts`
- `app/api/submit/route.ts`

## Multi-agent organization

Use one lead agent and four bounded implementation agents. Each implementation
agent should work on its own branch or worktree. The lead owns integration,
resolves conflicts, runs final verification, and rejects changes that exceed the
scope of this brief.

### Agent A: lead and contract owner

Responsibilities:

- inspect the repository and freeze the prepared-report JSON contract first;
- assign tasks and prevent overlapping edits;
- own shared type definitions and final documentation;
- integrate agents in the merge order below;
- run the complete test, typecheck, lint, and build suite;
- manually exercise the upload-to-prepared-report demo.

Preferred file ownership:

- `docs/grok-agent-workplan.md`
- shared types introduced specifically for prepared reports;
- final edits needed to reconcile other agents' work.

Agent A should not independently reimplement another agent's task while that task
is in progress. It should review results against the acceptance checks.

### Agent B: prepared-report API and authorization

Primary task: Priority 1.

Preferred file ownership:

- `app/api/reports/[id]/prepare-311/route.ts`
- a new server-only prepared-report service module;
- endpoint authorization and contract tests.

Agent B may read `lib/db.ts`, but should request that Agent A make any shared
database-service edit unless a new isolated query method is clearly required.
It must not touch `app/page.tsx` or CSS.

### Agent C: description and Baltimore routing

Primary tasks: Priorities 2 and 3.

Preferred file ownership:

- a new deterministic description-builder module and its tests;
- a new routing-selector module and its tests;
- narrowly scoped corrections to `lib/baltimore-311-routing.mjs` only when backed
  by the existing official catalog evidence.

Agent C returns pure, tested functions to Agent B. It must not create API routes,
change persistence, or call Gemini.

### Agent D: clustering and demo evidence

Primary task: Priority 4.

Preferred file ownership:

- clustering integration tests;
- `GET /api/incidents` changes, if required;
- receipt/report-detail backend fields needed for the demonstration.

Avoid editing the clustering transaction in `lib/db.ts` unless a failing test
proves a defect. Coordinate any necessary edit with Agent A because report
submission is a high-conflict file.

### Agent E: reliability, security, and negative testing

Primary tasks: Priority 5 and adversarial review of Priorities 1–4.

Preferred file ownership:

- upload and prepared-report failure-contract tests;
- safe structured diagnostic helpers, if needed;
- security tests for cross-session access and secret redaction;
- health endpoint changes only when justified by a reproducible gap.

Agent E should attempt invalid IDs, foreign-session IDs, missing records,
emergency types, malformed stored data, upstream timeouts, and duplicate retries.
It reports defects to the owning agent rather than silently duplicating that
agent's implementation.

### Parallel execution and merge order

After Agent A freezes the contract, Agents B, C, D, and E may investigate in
parallel. Agent B can scaffold the endpoint against an interface while Agent C
implements its pure helpers. Agent D can add failing clustering/demo tests against
the existing backend. Agent E can build the threat and failure matrix immediately.

Integrate in this order:

1. Agent C's pure description and routing modules.
2. Agent B's authorized prepared-report service and route.
3. Agent D's safe incident/receipt additions and demo tests.
4. Agent E's diagnostics, negative tests, and reliability corrections.
5. Agent A's contract reconciliation, documentation, and full verification.

No two agents should edit `lib/db.ts`, `app/api/submit/route.ts`, or a migration
at the same time. Assign those shared files explicitly to Agent A during the
integration window. Agents must send commit hashes, changed-file lists, test
results, and any assumptions to Agent A.

### Team completion gate

The team is finished only when Agent A verifies all of the following on the
combined branch:

- a real persisted, session-owned report produces a prepared Baltimore packet;
- a foreign session cannot read it;
- multiple candidates require review instead of silent guessing;
- an emergency produces a 911 instruction and no 311 continuation action;
- two nearby same-type reports form one super-report with two evidence records;
- Gemini failure still permits a manual report;
- no response or structured log leaks secrets or session identifiers;
- all automated checks pass after integration, not only on individual branches.

## Priority 0: reproduce and observe the complete flow

Before adding features, run the full local test suite and inspect the existing
contracts. Confirm that the current code already provides:

- browser and server image compression;
- Gemini category, incident type, seriousness, confidence, context summary, and
  normalized tags;
- persisted `image_analyses` records;
- explicit Baltimore service candidates and routing disposition;
- report submission with session ownership;
- 150-meter/72-hour incident clustering;
- `GET /api/incidents` and `GET /api/baltimore-311/services`.

Do not rebuild working pieces. Record any reproducible failure with the request,
response status, sanitized error code, and relevant test. Fix failures before
starting Priority 1.

## Priority 1: prepared Baltimore 311 report endpoint

Build a session-owned endpoint that turns a saved report into a reviewable 311
packet. Preferred route:

```text
GET /api/reports/{report_id}/prepare-311
```

The endpoint must load the report only when it belongs to the current session.
It must derive its output from trusted stored analysis and deterministic routing,
not from browser-supplied AI fields.

Return a stable JSON contract similar to:

```json
{
  "report_id": "...",
  "readiness": "ready",
  "routing_disposition": "311",
  "department": "Department of Transportation",
  "service_type": "TRM-Potholes",
  "alternative_service_types": ["TRM-Pickup Pothole"],
  "prepared_fields": {
    "description": "Pothole visible in the roadway...",
    "location": "...",
    "latitude": 39.29,
    "longitude": -76.61,
    "photo_url": "..."
  },
  "user_action": {
    "label": "Continue in Baltimore 311",
    "url": "https://balt311.baltimorecity.gov/citizen/s/"
  },
  "disclaimer": "Prepared by One Minute Utopia. Review and submit through Baltimore 311."
}
```

Use these readiness values:

- `ready`: exactly one recommended 311 service type and sufficient location data;
- `choose_service`: multiple plausible service types require user confirmation;
- `needs_location`: neither useful GPS nor a manual location is stored;
- `manual_review`: routing is intentionally uncertain;
- `emergency`: show a 911 instruction and no 311 continuation action;
- `not_reportable`: no city submission should be prepared.

Do not invent a Baltimore department when the official service catalog does not
provide one. A missing department may be `null`. Never auto-submit.

Acceptance checks:

- another session receives 404, not the report data;
- emergency types never return a 311 URL;
- the description is bounded, plain text, and contains no unsupported claims;
- exact stored coordinates, address, and photo URL are preserved;
- the endpoint exposes no session or credential fields;
- tests cover every readiness state.

## Priority 2: deterministic report description builder

Create a small server-only module that builds the prepared description. It may
combine:

- normalized incident label;
- AI context summary;
- allowlisted context tags rendered as human-readable observations;
- user-provided details;
- evidence count when the report belongs to a super-report.

The builder must not call another model. It must avoid repeating information,
cap output at a practical form length, and clearly distinguish user-provided text
from image-derived observations. Sanitize control characters and do not emit
HTML. Add focused unit tests.

## Priority 3: routing selection and auditability

Add a deterministic selector around `baltimore_service_candidates`:

- one candidate becomes the recommendation;
- multiple candidates remain choices unless a documented rule can distinguish
  them from stored evidence;
- zero candidates maps to `manual_review`, `emergency`, or `not_reportable`;
- every result includes a short machine-readable `routing_reason`;
- selection never depends on arbitrary model-written service names.

Keep the mapping in one server module and test every incident type. Do not expand
the taxonomy from guesses. If the official current-year ArcGIS data contains an
unmapped service, document it for later review.

## Priority 4: demo support for super-reports

Make the existing grouping easy to demonstrate through backend contracts:

- expose the incident ID, evidence count, and `is_super_report` on the receipt or
  a session-owned report-detail endpoint;
- ensure two reports of the same `incident_type` within 150 meters and 72 hours
  join one incident;
- ensure different incident types, distant reports, and old reports stay apart;
- preserve idempotency so retrying one analysis does not increase evidence count;
- return only aggregate, safe fields from the public incident endpoint.

Add integration tests for the exact demo: submit two nearby pothole reports and
assert one incident with `evidence_count: 2`.

## Priority 5: operational reliability

Improve diagnostics without exposing sensitive values:

- use the upload `request_id` in structured Vercel log events;
- classify session/database, photo-storage, analysis-storage, and provider
  failures by stage;
- retry only transient, idempotent operations;
- keep Gemini failure nonfatal by saving an unavailable/manual assessment;
- do not retry invalid credentials, schema errors, or rejected user input;
- update `/api/health` only if a safe readiness check can be performed without
  consuming Gemini quota or writing user data.

Tests must prove logs and responses never contain API keys, database URLs,
session IDs, image bytes, or arbitrary provider response text.

## Priority 6: optional demo fixtures

Only after Priorities 1–5 pass, add a development-only fixture or documented
script that creates two nearby reports without touching production. It must be
guarded by `NODE_ENV !== 'production'` and require explicit local invocation.
Never ship a public seed endpoint.

The desired scripted demo is:

1. Upload a pothole image.
2. Show `incident_type: pothole`, context, confidence, and Baltimore candidates.
3. Confirm location and save the first report.
4. Prepare its Baltimore 311 packet.
5. Submit a second nearby pothole report.
6. Show one incident with two pieces of evidence.
7. Upload an active-fire image and show the emergency guardrail instead of 311.

## Out of scope for this hackathon build

- submitting to Baltimore City or claiming submission occurred;
- native iOS integration with the Baltimore 311 app;
- browser automation against the Baltimore portal;
- user accounts, OAuth, case-status synchronization, or push notifications;
- volunteer coordination, work orders, dispatch, or agency dashboards;
- training a custom vision model;
- nationwide city routing.

## Handoff format

When finished, report:

1. files changed and the final API contract;
2. migrations or environment variables required;
3. tests run and their results;
4. one copy-paste example request and response;
5. remaining limitations, especially anything that is simulated for the demo.

Do not mark a task complete if the endpoint returns plausible mock data without
loading the persisted report and enforcing session ownership.
