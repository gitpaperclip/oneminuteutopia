# Priority 0 Findings

## Executive Summary

Phase 1 core functionality is **implemented and tested** (45/45 tests pass). The prepared-report contract has been frozen. Baltimore 311 routing and clustering remain unimplemented as planned for subsequent agents.

## Test Results

**Status:** ✅ All passing

```
npm run test:analysis: 45 passing tests
npm run typecheck: No errors
npm run lint: No errors
```

Tests run in embedded PostgreSQL (PGlite) with mocked provider requests. Live deployment verification (Gemini API, Supabase, Vercel) is out of scope for this agent.

## Implementation Status

### ✅ Working (Implemented on main)

#### Image Compression & Processing
- **Location:** `lib/image-processing.ts`
- **Status:** Fully implemented
- **Details:**
  - Browser-side 20 MB upload limit enforced
  - Server-side decoding, normalization to JPEG
  - Maximum 1600px edge constraint
  - 3 MB output limit
  - EXIF metadata stripping via re-encoding
  - Test coverage: `image normalization really decodes, bounds dimensions and strips EXIF`

#### Gemini Analysis Fields
- **Location:** `lib/gemini.ts`, `lib/hazard-analysis.mjs`
- **Status:** Fully implemented
- **Fields:** `category`, `seriousness` (0-10 or null), `ai_confidence` (0-100)
- **Details:**
  - Structured JSON schema with strict validation
  - All 12 categories validated (roads_and_sidewalks, traffic_signals_and_streetlights, trash_and_sanitation, water_drainage_and_sewage, trees_and_public_spaces, buildings_and_construction, electricity_and_gas, animals, fire_injury_or_immediate_threat, other_hazard, no_visible_hazard, unable_to_assess)
  - 8-second timeout per request
  - Concurrent storage + analysis (no serial wait)
  - Failure classification: configuration, credentials, invalid_request, rate_limited, model_unavailable, provider_unavailable, network_error, timeout, blocked_response, output_truncated, invalid_response
  - Test coverage: 21 passing Gemini/analysis tests

#### image_analyses Persistence
- **Location:** `lib/analysis-store.ts`, `supabase/migrations/202609190001_image_analyses.sql`
- **Status:** Fully implemented
- **Details:**
  - Row-level security enabled, no public browser access
  - Server-side service role credentials
  - Saves: id (uuid), session_id, image_path, image_hash, category, seriousness, ai_confidence, model, analysis_status (complete|unavailable), prompt_version, created_at, report_id, incident_id, lat/lon, location_address, submitted_at
  - Check constraints enforce unable_to_assess contract (null seriousness, 0 confidence)
  - Concurrent save during upload (no blocking on AI response)
  - Test coverage: Supabase persistence, owned analysis lookup, write failures

#### Session-Owned Submit
- **Location:** `lib/db.ts` `submitReport()`, `app/api/submit/route.ts`
- **Status:** Fully implemented
- **Details:**
  - Anonymous first-party session cookies (not Supabase Auth)
  - Analysis locked with `FOR UPDATE` during submit
  - Idempotent: retries return existing report_id
  - Transaction: report + incident + analysis link in one atomic commit
  - 10 second statement timeout
  - Preserves AI scores from database, not browser input
  - Records user category corrections (user_corrected flag)
  - Test coverage: trusted scores, concurrent retries, rollback, manual fallback, unowned analysis

#### Request Rate Limits
- **Location:** `lib/db.ts` `checkRateLimit()`
- **Status:** Fully implemented
- **Limits:** 10 uploads/hour, 60 submit attempts/hour per session
- **Persistence:** `public.request_limits` table with hourly sliding window
- **Details:** Shared across server processes, session-scoped (not IP-scoped)
- **Test coverage:** persistent hourly limit

#### Health Check Endpoint
- **Location:** `app/api/health/route.ts`
- **Status:** Fully implemented
- **Checks:** database_schema, storage_configured, gemini_configured
- **Note:** Does NOT validate live Gemini API key, quota, or model access

### ❌ Not Implemented (Gaps for Future Agents)

#### 311 Candidates + Disposition
- **Status:** Not implemented
- **Expected Location:** `lib/baltimore-routing.ts` (does not exist)
- **Contract Reference:** See frozen `PreparedReportReadiness` type
- **Details:**
  - No Baltimore 311 service mapping logic exists
  - No routing to emergency (911) vs. 311 vs. manual_review
  - No jurisdiction detection (city/state/utility)
  - No service catalog integration
  - Baltimore catalog document exists (`docs/baltimore-reporting-catalog.md`) but is not consumed by code
  - **This is intentional:** Agent B owns the prepare-311 route implementation

#### 150m / 72h Incident Clustering
- **Status:** Not implemented
- **Expected Logic:** Geospatial + temporal grouping
- **Details:**
  - `incidents` table exists with lat/lon and created_at/updated_at
  - No clustering query or grouping logic in codebase
  - Reports currently create independent incidents (1:1 mapping)
  - Index `idx_incidents_location` exists but unused
  - **This is intentional:** Future deduplication work

#### GET /api/incidents
- **Status:** Route does not exist
- **Expected:** Public or session-filtered incident listing
- **Details:**
  - `DatabaseService.getIncident(id)` exists for single-incident lookup
  - No list/search/filter endpoint
  - No pagination
  - **This is intentional:** Future browse/map feature

#### GET /api/baltimore-311/services
- **Status:** Route does not exist
- **Expected:** Baltimore 311 service catalog API
- **Details:**
  - No service catalog storage
  - No API integration with Baltimore 311
  - Baltimore catalog is documentation only (`docs/baltimore-reporting-catalog.md`)
  - **This is intentional:** Per hard stop, "Baltimore 311 API does NOT work — prepare-only, never call city APIs"

## Database Schema Status

### Tables (all exist, all pass tests)

- `public.reports`: report receipt with image_path, category, lat/lon, ai_confidence, seriousness, analysis_status, user_corrected
- `public.incidents`: clustered incident record (currently 1:1 with reports)
- `public.sessions`: anonymous session tracking
- `public.image_analyses`: server-owned AI assessment and photo reference
- `public.request_limits`: rate limiting state

### Row-Level Security
- ✅ All tables have RLS enabled
- ✅ Public browser roles (anon, authenticated) have NO access
- ✅ Only service_role can read/write
- ✅ Session authentication happens via server-side cookies, not database policies
- **Test coverage:** `browser roles cannot read reports, sessions or analyses`

### Migrations
- ✅ Reapplication-safe (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)
- ✅ Tested on fresh install and upgrade from original overlay
- **Test coverage:** `migrations are repeatable`

## Known Limitations (By Design)

1. **No city API integration:** Per hard stop, all 311 submission is prepare-only
2. **No real secrets in logs:** Analysis failure diagnostics sanitize all keys, images, sessions
3. **Session cookies are not accounts:** Losing cookie loses upload ownership
4. **Public photo bucket:** Anyone with photo URL can view it
5. **No retention policy:** Orphaned uploads remain; cleanup TBD
6. **Prototype rate limits:** Anonymous sessions can be recreated by clearing cookies

## Frozen Contract Reference

See `lib/prepared-report-types.ts` for the canonical prepared-report contract.

**Readiness values:**
- `ready`: Report packet is complete and ready for human portal handoff (user opens intake_url)
- `choose_service`: User must select from multiple eligible 311 services
- `needs_location`: GPS denied or unavailable, user must enter address
- `manual_review`: Human review required before preparing packet (e.g., sensitive content)
- `emergency`: Immediate danger detected, direct user to 911 (no 311 continue URL, no intake_url)
- `not_reportable`: Not a civic issue (private property, not a hazard, etc.)

**Key contract changes from review:**
- Changed all "immediate 311 submission" language to "prepare-only packet for human portal handoff"
- Removed CSR loophole — NEVER claim "submitted" to any government system
- Added optional/deferred fields: `prepared_fields`, `user_action`, `disclaimer` (Agent B may defer)
- Clarified ID usage: prepare-311 endpoint keys on `report_id` (from public.reports.id), NOT `analysis_id`
  - Mapping: reports.idempotency_key = image_analyses.id (uuid) for loading AI fields if needed
- Emergency readiness = 911 only, no 311 intake_url, no packet preparation

## Next Steps (Out of Scope for This Agent)

1. **Agent B:** Implement `/api/prepare-311` route with Baltimore service matching
2. **Agent C/D:** (See sibling PRs #10, #12)
3. **Agent E:** (See sibling PR)
4. **Clustering implementation:** 150m radius + 72h window incident grouping
5. **Browse endpoints:** GET /api/incidents with filters, pagination
6. **Retention policy:** Cleanup abandoned uploads and unsubmitted analyses

## Test Sanitization Note

All test output has been reviewed. No secrets, session IDs, or sensitive data appear in test results. Test mocks use placeholder values (`test-key`, `private-api-key`, `secret-session`) and verify they do NOT leak through logs or API responses.
