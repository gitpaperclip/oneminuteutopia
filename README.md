# One Minute Utopia

One Minute Utopia is a camera-first civic reporting prototype built for HopHacks
2026. A resident photographs a public issue, receives a server-generated AI
assessment, confirms the location and details, and saves a durable report. Nearby
reports of the same issue can be grouped into one stronger community signal.

No account is required. The current project is a Baltimore-focused demonstration;
it does **not** submit to Baltimore 311, dispatch emergency services, or promise a
government response.

## What the demo does

- Captures a new photo or accepts an existing image.
- Compresses the image in the browser, then validates and normalizes it again on
  the server to reduce upload time and model input size.
- Uses Gemini on Vertex AI to return a broad category, normalized incident type,
  seriousness, confidence, a short visual summary, and allowlisted context tags.
- Stores the photo and server-owned analysis in Supabase. Browser-supplied AI
  scores are never trusted during submission.
- Routes normalized incident types to Baltimore 311 service candidates or to
  emergency/manual-review guidance. (Backend actually generates a Baltimore311 API-ready form submission call)
- Creates a durable report receipt and prepares a human-reviewed Baltimore handoff.
- Groups same-type reports whose GPS accuracy circles overlap (2× reported
  accuracy, clamped 25–250m) within 72 hours, including through a chain of
  overlaps, into one "super-report".
- Shows saved incidents on a public Leaflet/OpenStreetMap map and lets a visitor
  add one reversible "I see this too" confirmation per browser session.
- Includes Beacon, an optional local Playwright worker that files score-ready clusters
  into mock government forms (mock forms for Baltimore public departments).


If AI analysis is unavailable, the photo is retained with an explicit unavailable
status and the resident can finish a manual report. An unavailable assessment is
never displayed as zero risk.

## Reporting flow

1. Take a photo or choose one from the device.
2. The browser compresses it; the server validates, strips metadata, normalizes,
   stores, and analyzes it.
3. Review the suggested issue category and complete the location and optional
   description.
4. Submit the report. The server reloads the saved analysis, derives the trusted
   subtype and routing, and atomically creates or joins an incident.
5. Open the durable receipt, Baltimore reporting destination, or public map.

Beacon (`npm run worker`) listens for new rows on
`public.reports`. When an incident's combined score reaches 0.6, it files that
cluster to a **mock** government website with Playwright and stores the
confirmation on the incident. Dangerous issues can file from one strong report;
minor issues need several independent reporters. Roads, sidewalks, and
streetlights go to the Riverton DOT mock; other civic issues, including fires,
go to the City 311 mock. It does not call Baltimore 311.

The confirm screen still shows a 911 button for fires and similar threats.
Beacon still files those incidents to the mock portal when the score is high enough.

## Architecture

- **Web:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- **AI:** Gemini 3.8 Flash through Google Cloud Vertex AI, called only by the server
- **Data:** Supabase Postgres for sessions, analyses, reports, incidents, routing,
  confirmations, scoring, and mock filing status
- **Images:** Supabase Storage with client and server image normalization
- **Map:** Leaflet with public OpenStreetMap raster tiles
- **Demo automation:** Beacon, a local Playwright worker for the mock government website

The AI response uses a constrained provider schema and a stricter server validator.
The request has an 18-second deadline and retries Vertex HTTP 429 responses with
bounded exponential jitter. A provider failure falls back to manual reporting.

## Baltimore scope and limitations

The backend has a normalized incident taxonomy and maps each subtype to observed
Baltimore 311 service types. `GET /api/reports/{id}/prepare-311` builds a preview
packet and applies emergency guardrails. It is **prepare-only**: it does not prove
that Baltimore accepted a service request.

The Baltimore mobile app and authenticated intake do not expose a public write API
that this prototype can safely call. The UI therefore links residents to the
appropriate official destination and keeps the user responsible for reviewing and
submitting the city form. The Playwright worker targets only the mock demo sites;
its reference number is not a Baltimore case number.

The overlapping-circle / 72-hour grouping values are hackathon defaults. A
production system would tune them by incident type, add moderation and retention
policies, geocode manually entered addresses, and establish a formal city
integration.

**Hard constraint:** The app does NOT call live Baltimore 311 APIs. All 311
integration is prepare-only (packet generation, form preview, link generation).
Users must manually confirm and submit through the city's portal. Never claim
"submitted" to any government system — a link opened or form displayed is NOT
proof of city acceptance. The Playwright worker files only to the mock
government demo sites (City 311 and Riverton DOT).

See [docs/incident-intelligence.md](docs/incident-intelligence.md),
[docs/baltimore-reporting-catalog.md](docs/baltimore-reporting-catalog.md), and
[docs/map.md](docs/map.md) for the detailed contracts. The project's problem
research, evidence, and validation limits are documented in
[docs/civic-reporting-research.md](docs/civic-reporting-research.md).

## Local setup

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
```

In PowerShell, use `Copy-Item .env.example .env.local` for the second command.

Configure:

- `DATABASE_URL`: Supabase transaction-pooler Postgres URL. URL-encode reserved
  characters in the password.
- `NEXT_PUBLIC_SUPABASE_URL`: URL for the same Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for that project.
- `GOOGLE_CLOUD_PROJECT`: Google Cloud project with Vertex AI enabled.
- `GOOGLE_CLOUD_LOCATION`: use `global` for the current Gemini 3.8 deployment.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON object as a
  server-only environment value. For local development, a file path in
  `GOOGLE_APPLICATION_CREDENTIALS` is also supported.
- `GEMINI_MODEL`: optional model override; the current default is
  `gemini-3.8-flash`.

`GEMINI_API_KEY` belongs to the older Gemini Developer API setup and is not used by
the current Vertex AI implementation. Never expose service-account JSON or the
Supabase service-role key through a `NEXT_PUBLIC_*` variable or commit them.

Apply every SQL migration in `supabase/migrations/` in filename order. Then create
a public-read Supabase Storage bucket named `report-photos`. The bucket is written
with the server credential; anyone with a photo URL can open it.

```sh
npm run dev
```

Open `http://localhost:3000`. Camera and location permissions require HTTPS on a
physical phone, so use the deployed site or an HTTPS development tunnel. File
upload and manual location entry are available when permissions are denied.

### Optional Beacon mock filing worker

Beacon runs locally and does not run on Vercel:

```sh
npx playwright install chromium
npm run worker
```

It reads the same `.env.local` as the app. On startup it checks existing
incidents once, then waits for new `public.reports` inserts instead of polling
every 10 seconds. A visible browser opens for incidents whose
incident score is at least 0.6 and that have not already been filed, including
fires and other high-danger reports. Road and
streetlight clusters open the transportation mock; litter and other civic issues
open the general 311 mock. Apply `202609190007_reports_realtime.sql` so Supabase
Realtime publishes `reports`. `MOCK_GOVERNMENT_URL` and
`MOCK_TRANSPORTATION_URL` must use an allowlisted hostname (`localhost`,
`127.0.0.1`, `mock-government-page-without-api.vercel.app`, or
`mock-second-gov-site-transportation.vercel.app`). Beacon refuses to start
or submit if a mock portal URL is missing or not allowlisted. Live city URLs
are not permitted.

## Verification

```sh
npm run test:analysis
npm run lint
npm run typecheck
npm run build
```

`GET /api/health` verifies the database schema, storage configuration, and presence
of Vertex configuration. It does not make a billable model request, upload a photo,
or complete a report. Validate the deployed system with the real reporting flow.

Before a demo, verify:

1. Two consecutive photos return a completed AI assessment.
2. A report survives a receipt refresh.
3. Two nearby reports of the same type join one super-report.
4. The incident appears on `/map` and "I see this too" can be added and removed.
5. Emergency imagery shows 911-first guidance.
6. Beacon runs locally if mock filing is part of the presentation.

Automated tests mock external services. Passing them confirms the application
contracts, not deployed credentials, quotas, migrations, or phone permissions.

## Public data and privacy

The demo map can expose a report photo, issue details, address, and precise
coordinates. Use consented public-space images and avoid faces, license plates,
home interiors, medical information, and other identifying details. The server
normalizes images and strips metadata, but the visible content of the photo still
matters. A production deployment needs clear consent, moderation, deletion, and
retention controls.

## Project layout

```text
app/page.tsx                              Capture, review, and report submission
app/map/page.tsx                          Public incident map
app/receipt/[id]/page.tsx                 Durable receipt and Baltimore handoff
app/api/upload/route.ts                   Normalize, store, analyze, and persist
app/api/submit/route.ts                   Authoritative report and clustering
app/api/reports/[id]/prepare-311/route.ts Prepared Baltimore handoff packet
app/api/incidents/route.ts                Map-safe incident list and detail
app/api/incidents/[id]/confirmation/      I-see-this-too state
app/api/health/route.ts                   Schema and configuration health
lib/gemini.ts                             Vertex AI request, validation, and retry
lib/hazard-analysis.mjs                   Prompt and strict response contract
lib/incident-taxonomy.mjs                 Normalized issue taxonomy
lib/incident-scoring.ts                   Case score, incident score, and filing threshold
lib/baltimore-311-routing.mjs             Baltimore service-type mapping
lib/db.ts                                 Transactions, clustering, and persistence
worker/src/index.ts                       Run Beacon: listen for reports and file the matching mock form
worker/src/agency-route.ts                Choose Riverton DOT vs City 311 from category
supabase/migrations/                      Database setup in execution order
tests/                                    Contract and regression tests
```

## Links

  repository for mock government sites that are used for testing and demo
  general reports:                https://github.com/A1x-Z/mock_government_page_without_api
  public transportation specific: https://github.com/A1x-Z/mock_second_gov_site_transportation_specific
  
## Troubleshooting

- **Photo cannot be saved:** verify the `report-photos` bucket, Supabase URL and
  service-role key, database connection, and applied migrations. Check the matching
  `/api/upload` runtime log in Vercel.
- **AI analysis is unavailable:** inspect the structured
  `image_analysis_unavailable` log entry. `rate_limited`/429 means Vertex quota or
  shared capacity; retry after a short delay. `credentials` means the service
  account or Vertex permissions are wrong. `model_unavailable` means the selected
  model is unavailable in the configured project/location.
- **Vertex model returns 404:** keep `GOOGLE_CLOUD_LOCATION=global` for the current
  model and confirm the production deployment uses the expected `GEMINI_MODEL`.
- **Map is empty:** submit a report with GPS coordinates, apply the clustering and
  confirmation migrations, and inspect `GET /api/incidents`.
- **Camera or location is denied:** use file upload and manual location entry. GPS
  clustering and default map placement require coordinates.
- **Beacon never opens a browser:** apply
  `202609190004_mock_government_submission.sql` through
  `202609190008_incident_scoring.sql`, confirm the incident score is at least
  0.6 (`government_report_status` is `ready_to_submit`), apply
  `202609190007_reports_realtime.sql`, and run `npx playwright install chromium`.
  Already-filed incidents are skipped on purpose.

## License

MIT
