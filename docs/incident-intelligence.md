# Incident intelligence backend

The reporting backend turns each uploaded photo into two levels of classification:

- `category`: the existing broad UI category, such as `trash_and_sanitation`.
- `incident_type`: a preset normalized subtype, such as `illegal_dumping`,
  `structure_fire`, or `garbage_fire`.

Gemini also returns a short factual `context_summary` and up to eight allowlisted
`context_tags`. The server validates all fields and derives `tags` by combining
the normalized incident type with the visual tags. No arbitrary model-generated
tag is stored.

The fine-grained taxonomy is aligned to the official Baltimore 311 SRType names
through `lib/baltimore-311-routing.mjs`. Each incident type has an explicit routing
disposition and zero or more exact city service candidates. Active fires, downed
power lines, visible injuries, and similar immediate threats are marked
`emergency`; they are never presented as ordinary 311 submissions.

## Stored analysis contract

`POST /api/upload` keeps the existing response fields and adds:

```json
{
  "analysis": {
    "category": "fire_injury_or_immediate_threat",
    "incident_type": "garbage_fire",
    "seriousness": 8,
    "ai_confidence": 91,
    "context_summary": "Flames and smoke are visible rising from a pile of trash.",
    "context_tags": ["active_flames", "smoke", "trash"],
    "tags": ["active_flames", "garbage_fire", "smoke", "trash"],
    "baltimore_service_candidates": [],
    "routing_disposition": "emergency"
  }
}
```

The durable `public.image_analyses` row is still the source of truth. The browser
cannot invent or replace image context during submission. If the user changes the
broad category, the submitted report uses that category's preset fallback subtype
while retaining the image context for auditability.

## Super-report grouping

Location is only available after review, so grouping runs in `POST /api/submit`.
The backend searches open incidents with the same `incident_type` that were
updated in the last 72 hours. Each report is a circle whose center is its
latitude/longitude and whose radius is **2× GPS accuracy**, clamped between 25m
and 250m. If the new report's circle overlaps any existing report's circle,
they are the same incident. Overlap is transitive: if A overlaps B and B
overlaps D, A, B, and D become one incident (older incident kept, others marked
`merged`). Reports without coordinates never cluster.

1× accuracy is too strict for typical phone GPS jitter. 3× lets two poor-GPS
circles swallow a city block. 2× is the default.

An incident is a super-report when `evidence_count >= 2`. Its aggregate record
contains:

- the union of normalized tags;
- a centroid of contributing GPS coordinates;
- the highest image seriousness;
- average AI confidence and the number of AI-scored reports;
- first-created and most-recent report timestamps;
- the number of independent report records attached to it.

Submission returns `clustered` and `super_report`. `duplicate` retains its previous
meaning: the same saved analysis was submitted twice and the existing receipt was
returned. A clustered report is new evidence, not an idempotent retry.

## Public incident query API

`GET /api/incidents` returns aggregate incidents without session identifiers or
individual report records. Supported query parameters are:

- `category=<preset category>`
- `incident_type=<preset subtype>`
- `tag=<preset subtype or context tag>`
- `common_only=true` to return only super-reports
- `limit=1..100` (default 50)

Every result includes `is_super_report`, derived from `evidence_count`. Example:

```text
/api/incidents?incident_type=garbage_fire&common_only=true&limit=20
```

`GET /api/baltimore-311/services` exposes the complete set of service types
observed in Baltimore's official current-year 311 dataset. The source currently
contains 294 distinct SRType values, including administrative and internal
workflows that cannot be inferred from a photo. Operational-only rows are removed
by default; pass `include_internal=true` for auditing. The response deliberately
labels these as observed service types because Baltimore's authenticated mobile
catalog endpoint is not publicly readable.

## Database setup

Apply `supabase/migrations/202609190002_incident_context_and_clustering.sql`,
`supabase/migrations/202609190003_baltimore_311_routing.sql`,
`supabase/migrations/202609190004_mock_government_submission.sql`,
`supabase/migrations/202609190005_incident_confirmations.sql`,
`supabase/migrations/202609190006_mock_agency.sql`,
`supabase/migrations/202609190007_reports_realtime.sql`, and
`supabase/migrations/202609190008_incident_scoring.sql` after the two
existing reporting migrations. They backfill existing records with
broad fallback incident types and create indexes for subtype, tag, and recent
location matching.

The clustering constants are exported from `lib/incident-clustering.ts`. The
current 2× accuracy multiplier, 25–250m clamp, and 72-hour window are hackathon
defaults rather than validated civic policy. A wider deployment should tune them
per incident type; a fire and a pothole should not necessarily share the same
spatial or temporal window.

## Beacon mock government worker

Beacon is a local Playwright process (`npm run worker`) that listens for new `public.reports`
rows, then loads the linked incident. It does
not regroup reports. Each report stores a backend `case_score`. The incident
score is `1 - Π(1 - independent case scores)` and never uses time. When that
score is at least `0.6`, coordinates are present, and the incident has not
already been mock-filed. Fires and other high-danger reports are included. It
chooses a mock agency from the incident category: roads, sidewalks, and streetlights go
to the Riverton DOT form; other civic issues go to the City 311 form. It stores
`mock_reference_id` and `mock_agency` on the incident. That confirmation is a
demo ID, not a Baltimore City case number. If `incident_score` is missing,
Beacon falls back to the earlier `evidence_count >= 2` gate so older rows can
still file.

## Baltimore 311 handoff

The incident type is the stable internal value mapped to one or more exact Baltimore
SRType candidates. The mapping remains separate from image analysis because city
service names can change and some choices require user details or location context.
A future adapter can validate required fields and submit a user-confirmed city
request. Store the official service request ID on the report after a successful
city response.
