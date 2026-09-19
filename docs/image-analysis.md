# Image analysis and reporting

This pipeline produces an initial assessment from a photo: broad category,
normalized incident type, visible context, seriousness (0–10), and AI confidence
(0–100). It saves the server result before review and uses that saved record when
creating the report.

The supplied ZIP is an overlay for the repository after PR #7, not a standalone
application. This integration keeps its three-field AI contract and saved
analysis reference, then adds image preparation, a manual fallback, and atomic
submission. The original planning PDF provides context; the current scope is
image reporting and AI analysis.

## Setup

1. Review and apply `supabase/migrations/202609190000_reporting.sql`, then
   `supabase/migrations/202609190001_image_analyses.sql`, then
   `supabase/migrations/202609190002_incident_context_and_clustering.sql`, then
   `supabase/migrations/202609190003_baltimore_311_routing.sql` in the Supabase project.
   These contain the base reporting tables and `public.image_analyses`.
   API requests never perform schema creation or alteration.
2. Create a public-read Storage bucket named `report-photos` in that project.
3. Configure `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`. `GEMINI_MODEL` overrides
   the default `gemini-3.8-flash` model. See `.env.example` for placeholders.
4. Install dependencies and run the Next.js app. These are server routes; no
   separate Supabase Edge Function is needed.

Use the same Supabase project for the SQL connection and API URL. Keys stay on
the server, and the browser calls the app's API rather than writing analyses
directly. Apply migrations explicitly before deploying the new application.

If the original overlay's `202609190001_image_analyses.sql` was already applied,
rerun the updated file as SQL to add `analysis_status`. It is written to support
reapplication. A migration runner that already recorded that filename will skip
it unless you explicitly apply the updated SQL or copy its upgrade into a new
migration.

## Pipeline

1. **Prepare:** the browser reduces photo dimensions and converts supported
   images to JPEG. A 20 MB source-file limit keeps local input bounded. Camera
   capture, file selection, and location fallback remain available independently.
2. **Validate:** `/api/upload` checks the request and image content. The server
   decodes and normalizes the image to JPEG, a maximum 1600-pixel edge, and at
   most 3 MB. It strips metadata as part of re-encoding. Malformed or unsupported
   content is rejected before external storage or model calls.
3. **Store and analyze:** the normalized bytes go to Supabase Storage and Gemini
   concurrently. Gemini receives a structured response schema and an approximately
   eight-second request deadline. The prompt treats text inside the photo as
   untrusted content.
4. **Save:** validate every AI field against preset taxonomies and persist the analysis with its
   session owner, photo path/hash, model, prompt version, and status. Return the
   saved `analysis_id` to the review screen only after persistence succeeds.
5. **Review:** show the saved AI assessment and permit a category correction,
   optional details, and GPS or a manual location. A correction changes the
   report category while preserving the original AI assessment.
6. **Submit:** load the saved analysis by ID and session. The server uses its
   stored image and scores rather than trusting browser AI fields. It saves the
   report and analysis link in one database transaction, locking the analysis
   row so simultaneous retries return the existing report. Nearby recent reports
   with the same normalized incident type attach to one aggregate incident.
7. **Receipt:** navigate only after the database commit. A refresh loads the
   durable saved report.

Storage and Gemini concurrency removes the previous serial wait. Resizing and
re-encoding reduce upload and model payloads. These are implementation changes,
not measured phone-network latency results.

## Failure behavior

Missing keys, timeouts, model refusals, invalid responses, and upstream errors
produce a saved assessment marked `analysis_status: unavailable`, with
`category: unable_to_assess`, `seriousness: null`, and `ai_confidence: 0`.
Review explains the failure and allows manual category selection and submission.
Those fields express missing analysis; they are not an AI conclusion that the
scene is safe.

A successful model response may also be `unable_to_assess` when the image is
ambiguous. Its completed status distinguishes model uncertainty from an
unavailable service. The user can still choose a category.

Photo storage or database persistence failure is an upload failure. The UI must
not claim an assessment was saved or a report was submitted. Submission retries
reuse the saved analysis ID and return the same report instead of creating a
second report. Abandoned uploads remain unsubmitted evidence; consumers should
select only linked rows with a report and submission timestamp.

A rejected analysis save triggers best-effort photo cleanup only when the
response definitively rejects the write. Timeouts, network errors, and upstream
server errors can occur after a write commits, so those failures preserve the
photo. Such ambiguous failures may leave an orphan photo or an unsubmitted
analysis; reconciling them requires a later retention/cleanup process.

## Debugging unavailable AI analysis

`/api/health` checks the database schema and whether provider configuration is
present. An `ok` response does **not** validate the Gemini key, model access,
quota, or a live analysis request.

After deploying, upload a fresh photo. If analysis is unavailable, open the
deployment's Vercel runtime logs and search for `image_analysis_unavailable`.
Match `analysis_id` to the review screen's saved assessment reference. The log
contains a bounded failure code, HTTP status when available, model, elapsed
processing time, and an allowlisted provider reason. It never includes the API
key, photo, prompt, session cookie, or raw provider error body.

- `configuration`: the key is blank or the model ID is malformed.
- `credentials`: Google rejected the key or its access restrictions; check
  `provider_reason`, such as `API_KEY_INVALID`, when available.
- `invalid_request`: Google rejected the request. Check the deployed request
  format and any provider reason such as `SERVICE_DISABLED`.
- `rate_limited`: Google returned HTTP 429; check the project's Gemini quota.
- `model_unavailable`: Google returned HTTP 404; verify `GEMINI_MODEL` access.
  [New projects may not have access to Gemini 2.5](https://discuss.ai.google.dev/t/gemini-2-5-flash-deprecated-without-warning-earlier-than-shutdown-date/174217/27)
  even though it has no global shutdown date. Set
  `GEMINI_MODEL=gemini-3.8-flash` in Vercel's Production
  environment and redeploy. Updating the code default or `.env.example` does not
  override a value already configured in Vercel.
- `provider_unavailable` or `network_error`: Google or the connection failed.
- `timeout`: the eight-second deadline expired, including response-body reading.
- `blocked_response`, `output_truncated`, or `invalid_response`: Gemini did not
  return a complete, valid assessment. Manual reporting remains available.
- `unknown`: an unexpected application failure; raw errors remain excluded.

The request uses `generationConfig.responseMimeType: application/json` and
`responseJsonSchema`. The alternative `responseFormat.text.mimeType` is an enum
in Google's current API contract and cannot safely be treated as the same MIME
string field. See the [GenerateContent API reference](https://ai.google.dev/api/generate-content)
and [v1beta discovery contract](https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta).

Existing unavailable rows remain historical attempts; redeploying does not
reanalyze them. Upload a new photo to verify the corrected request.

The default [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini)
supports image inputs and structured JSON. It uses `thinkingLevel: MINIMAL` for
latency, with a 1,024-token output ceiling that includes thinking tokens. The
ceiling is headroom, not a requested answer length. Existing Gemini 2.5 overrides
retain their compatible `thinkingBudget: 0` setting. Availability must still be
verified with the project's key; a saved photo alone does not prove AI success.

## Score definitions

- **0:** no visible hazard; this is not a declaration of safety.
- **1–2:** minor maintenance concern.
- **3–4:** plausible minor injury.
- **5–6:** substantial injury potential.
- **7–8:** serious injury potential with apparent exposure.
- **9–10:** apparent immediate life-threatening conditions.
- **null:** unable to assess. Never convert this to zero seriousness.

These are prototype rubric anchors, not a validated safety standard. Confidence
is a model self-estimate for category and seriousness together; it is not a
calibrated probability. Do not multiply seriousness by confidence to downgrade
uncertain hazards. Multiple visible hazards use the most serious visible
hazard's category and score. Category values are in `lib/analysis-labels.ts`.

Saved analyses use confidence 0–100. The legacy report `ai_confidence` field uses
0–1, so submission divides the saved percentage by 100. Both representations
refer to the same initial assessment. An unavailable analysis produces null
confidence on the report, keeping missing AI output distinct from a model score.

The app does not calculate overall danger, aggregate report frequency into a
risk score, or send notifications. A local Playwright worker may file clustered
incidents to a mock government demo site only; it does not contact Baltimore 311.

## Trust boundaries and limits

- Analysis rows have row-level security and no browser access policies.
  Server-side credentials perform database and Storage operations.
- An anonymous first-party session cookie establishes upload ownership. It is
  not a verified person or an account; losing the cookie loses that ownership.
- Photos use a public-read bucket. Anyone with a photo URL can view it; do not
  describe uploads as private. Photos are re-encoded, but this does not remove
  visible faces, license plates, or other content in the image.
- Receipt URLs are shareable references. Anyone with the receipt URL can view
  its saved report details, including the submitted location.
- Session request limits are persisted in Postgres and shared across server
  processes: 10 uploads and 60 submission attempts per session per hour.
  Anonymous sessions can be recreated by clearing cookies, so this
  is still a prototype abuse control rather than verified per-person quotas.
- Public photo retention and cleanup of abandoned uploads need an operational
  policy before a wider pilot.

## Verification

Run `npm run test:analysis`, `npm run lint`, and `npm run build` with Node 22+.
The automated tests mock external services. They cannot verify credentials,
applied SQL, Supabase permissions, model quality, or real-device camera behavior.
Credentials are currently configured in Vercel; this local work has not run
live Gemini or Supabase checks against that deployment.

The deployment acceptance gate is three consecutive phone submissions across
camera, file upload, and denied-location/manual entry; receipts that survive
refresh; an AI-outage manual submission; and retry behavior without duplicates.
Record actual completion times on the deployed site. Until those checks run on
configured services, Phase 1 is locally implemented but not proven deployed.

API references:

- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
