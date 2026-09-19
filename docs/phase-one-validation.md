# Phase 1 validation

Validated locally on September 19, 2026, against GitHub main commit
`88279cac2ec6b3deb6ec5772f0f5db5029ec02b9` (after PR #8).

The implementation scope is photo reporting, review, saved AI analysis, manual
fallback, and a durable receipt. The coordinator and volunteer workflows are
removed as requested.

## Completed checks

- Production build, TypeScript, and ESLint pass.
- `npm run test:analysis`: 39 passing tests. Provider requests are mocked;
  database tests execute the production SQL and migrations in embedded PostgreSQL
  (PGlite), without touching the live Supabase project.
- Fresh setup and upgrades from both the existing main schema and original
  overlay preserve records and timestamps. Reapplying migrations is tested.
- Persistence tests cover owned analyses, trusted server scores, category
  corrections, simultaneous submissions, rollback on failure, manual fallback,
  session validation, durable rate limits, and denied public database access.
- Browser smoke checks in Chromium at desktop and 390px mobile widths pass:
  gallery upload, simulated camera capture, denied-location/manual-address path,
  category correction, AI outage, upload retry, and save retry using the same
  analysis ID. No horizontal overflow or browser JavaScript errors were observed.
  Provider responses in these browser checks were mocked.
- Image tests verify actual decoding, 1600px bounds, JPEG output, EXIF removal,
  and rejection of malformed/oversized uploads.

## Deployment acceptance still required

Credentials are configured only in Vercel, so this validation did not call the
live Gemini or Supabase services or apply migrations remotely. No production
latency or physical-device success is claimed.

Before calling the deployed Phase 1 complete:

1. Apply both migrations in filename order in the configured Supabase project.
   Confirm that SQL, REST, and photo storage configuration refer to that project.
2. Deploy this code with the existing Vercel secrets. Check `/api/health` and
   perform a real upload; health verifies schema/configuration, not Gemini quota
   or Storage bucket permissions.
3. Complete three consecutive HTTPS phone reports: gallery upload, camera
   capture, and denied-location/manual-address entry. Refresh each receipt and
   open its link on another device; verify the photo and location persist.
4. Exercise an AI outage on a preview deployment and submit a manual report.
5. Record end-to-end timing from capture to receipt. Faster processing is
   implemented through resizing and concurrent work; deployed latency remains
   to be measured.

See [setup instructions](../README.md) and the [pipeline contract](image-analysis.md).
