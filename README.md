# One Minute Utopia

A camera-first civic reporting app built for HopHacks 2026. Take or upload a photo,
review an initial AI assessment, confirm the location, and save a report with a
durable receipt. No account is required.

The current build focuses on image reporting and analysis. It does not send
reports to a city or emergency service, schedule work, or promise that someone
will act on a report.

## Reporting flow

1. Take a photo with the rear camera, or select an existing image.
2. The browser prepares a smaller image for upload. The server validates and
   normalizes it again before storage or analysis.
3. Supabase photo storage and Gemini analysis run concurrently. Gemini returns
   category, initial seriousness (0–10), and AI confidence (0–100).
4. Review the saved assessment and correct the category if needed. Confirm GPS
   location or enter an address or landmark; add optional details.
5. Submit. The server loads the session-owned assessment and saves the report
   atomically. The receipt appears only after persistence succeeds.

If Gemini is unavailable, the photo and an explicitly unavailable assessment are
saved so that manual reporting remains usable. An unavailable assessment is
never presented as zero risk.

## Stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4.
- Supabase Postgres for sessions, saved analyses, and reports.
- Supabase Storage for report photos.
- Google Gemini for structured image analysis, called only by the server.

## Local setup

Use Node.js 22 or newer. The analysis tests use Node's TypeScript stripping.

```sh
npm ci
cp .env.example .env.local
```

In PowerShell, use `Copy-Item .env.example .env.local` for the second command.
Fill in the configuration with values from your own project:

- `DATABASE_URL`: Supabase Postgres connection string. For a serverless host,
  use the transaction pooler connection from the Supabase dashboard; the database
  client disables prepared statements for compatibility with that pooler.
- `NEXT_PUBLIC_SUPABASE_URL`: the project's Supabase URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only Supabase service role key.
- `GEMINI_API_KEY`: the server-only Gemini key.
- `GEMINI_MODEL`: optional model override; see `.env.example` and
  `lib/gemini.ts` for the configured default.

The API URL and database connection must belong to the same Supabase project.
Never put service or Gemini keys in `NEXT_PUBLIC_*` variables or commit
`.env.local`. A browser anonymous key is not required by this reporting flow.

### Database and photo storage

1. Review and apply the migrations in filename order using the Supabase SQL
   editor or your normal migration workflow:
   `supabase/migrations/202609190000_reporting.sql`, then
   `supabase/migrations/202609190001_image_analyses.sql`. They contain the base
   reporting schema and analysis table, with row-level security and server access.
   Tables are **not** created by API requests.
2. Create a Supabase Storage bucket named `report-photos` and enable public read
   access. Uploads use the server credential. Photo URLs can be opened by anyone
   who has the URL; use consented public-space images for the demo.
3. Configure the same environment variables on the deployment host before
   deploying.

If you already applied the ZIP's original analysis migration, rerun the updated
`202609190001_image_analyses.sql` as SQL to add its new status column; migration
tools may otherwise skip a filename they previously recorded. The file supports
reapplication.

```sh
npm run dev
```

Open `http://localhost:3000`. On a physical phone, use an HTTPS deployment or
an HTTPS development tunnel; camera and location permissions require a secure
context. File upload and manual location entry are available when permissions
are denied.

## Checks

```sh
npm run test:analysis
npm run lint
npm run typecheck
npm run build
```

`/api/health` checks configuration and database connectivity. It does not prove
that a Gemini request, photo upload, or full report submission succeeds. Run the
real reporting flow to validate those services.

Automated tests use mocked external services. Passing local checks is evidence
for the implementation, not proof of deployed credentials, applied migrations,
phone compatibility, or measured end-to-end latency.

The project's credentials are configured in Vercel, not in this local checkout.
The implementation work does not verify those secret values or run live Gemini
and Supabase checks. Add a separate local development configuration if needed.

## Phase 1 acceptance

The requested Phase 1 scope is the reporting page, saved AI analysis, and durable
receipt. The original planning PDF is reference material; its triage and
community-action features are outside this build.

On the deployed HTTPS site, complete these checks before calling Phase 1
demonstrated:

- Submit three consecutive reports: one camera capture, one file upload, and
  one with location permission denied and a manually entered location.
- Refresh each receipt and confirm that the photo, corrected category,
  location, and saved report remain available.
- Simulate an unavailable Gemini service and complete a manual report.
- Repeat a submission for the same saved analysis and confirm it returns one
  report. A storage or database failure must never show a successful receipt.
- Measure ordinary report completion and image-processing time on a phone.
  “One minute” is the product goal, not a verified latency guarantee.

These require a configured Supabase project, Gemini access, and a deployed test
device. They cannot be inferred from a successful local build.

## Project layout

```text
app/page.tsx                       Capture, analysis review, and submission
app/receipt/[id]/page.tsx          Durable report receipt
app/api/upload/route.ts           Validate, normalize, store, analyze, and save
app/api/submit/route.ts           Authoritative report submission
app/api/health/route.ts           Configuration and database health
lib/gemini.ts                    Server-side Gemini request
lib/hazard-analysis.mjs          Prompt, schema, and validation
lib/analysis-store.ts            Saved analysis persistence
lib/analysis-labels.ts           Category labels
lib/db.ts                        Reporting transactions and persistence
lib/storage.ts                   Supabase photo storage
supabase/migrations/             Explicit database setup
tests/                           Automated regression checks
```

See [docs/image-analysis.md](docs/image-analysis.md) for the pipeline, score
definitions, trust boundaries, and operational limits.

## Troubleshooting

- **Upload fails:** confirm the storage bucket exists, service credentials are
  present, and the database migration is applied. Retry with JPEG, PNG, or WebP.
  HEIC/HEIF support depends on the browser being able to decode and convert it;
  if conversion fails, export a JPEG first.
- **Manual analysis fallback appears:** check `GEMINI_API_KEY`, model access,
  quota, and network availability. A saved manual report remains valid evidence.
- **Database unavailable:** check the project's pooler connection string and
  password, and inspect server logs. Do not share credentials in screenshots.
- **Camera or location is denied:** use file upload and enter the location
  manually. Confirm the phone is using HTTPS before testing permissions again.

## License

MIT
