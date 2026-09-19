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
updated in the last 72 hours and are within 150 meters. The nearest match receives
the new report. Otherwise the backend creates a new incident.

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

Apply `supabase/migrations/202609190002_incident_context_and_clustering.sql`
and `supabase/migrations/202609190003_baltimore_311_routing.sql` after the two
existing reporting migrations. They backfill existing records with
broad fallback incident types and create indexes for subtype, tag, and recent
location matching.

The clustering constants are exported from `lib/db.ts`. The current radius and
time window are hackathon defaults rather than validated civic policy. A wider
deployment should tune them per incident type; a fire and a pothole should not
necessarily share the same spatial or temporal window.

## Baltimore 311 handoff

The incident type is the stable internal value mapped to one or more exact Baltimore
SRType candidates. The mapping remains separate from image analysis because city
service names can change and some choices require user details or location context.
A future adapter can validate required fields and submit a user-confirmed city
request. Store the official service request ID on the report after a successful
city response.
