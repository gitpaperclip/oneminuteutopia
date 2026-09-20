# Public incident map

Architecture:

`Supabase/Postgres incidents → GET /api/incidents → Leaflet + OpenStreetMap tiles`

The basemap is public OSM raster tiles. No `NEXT_PUBLIC_MAP_STYLE_URL` or
MapLibre style is required. Private tokens stay off `NEXT_PUBLIC_*`.

When GPS is unavailable or denied, the report form queries Baltimore City's
public EGIS composite locator through `GET /api/location/suggest`. Selecting a
result saves its latitude and longitude with the manual address, which lets the
incident participate in map display and distance-based grouping. This service
does not require an application API key.

## Truncation

`GET /api/incidents` still caps at 100 rows. The handler fetches `limit + 1`
and returns:

```json
{ "incidents": [], "limit": 100, "returned": 100, "truncated": true }
```

The map treats `truncated: true` as “this view is incomplete — zoom in.” It
does not pretend the viewport is the full dataset.

## Pins vs database clustering

Leaflet draws one pin per mappable incident. Nearby pins may overlap at low
zoom; that is not database deduplication. Super-reports remain
`evidence_count >= 2` from the 150 m / 72 h matcher. Do not label
`cluster_radius_m` as a hazard or impact radius.

Missing `highest_seriousness` is never treated as 0.

## Selected sheet photo

Selecting a pin loads `GET /api/incidents?id=` and shows the latest attached
report `image_path` (public or signed http(s) URL). The list `MapIncident`
payload stays unchanged. The detail DTO still strips `session_id`,
`image_hash`, and other ownership fields. URL picking lives in `lib/map-photo.ts`
so the client never imports server-only analysis code. Missing or invalid
photos render a compact placeholder; the sheet and confirm controls stay usable.

## I see this too

`confirmation_count` is a lighter community signal than photo evidence.

- Confirm / unconfirm: `POST` / `DELETE` `/api/incidents/:id/confirmation`
- One row per session in `incident_confirmations`
- Does not create a report, bump `evidence_count`, change
  `is_super_report`, or file 311 / mock-government

## Where copy lives

| What you are editing | File |
| --- | --- |
| Contacts / department notes, phones, report URLs (e.g. BCDOT “Potholes, signs, signals…”) | `lib/baltimore-routes.ts` |
| Longer Baltimore agency narrative | `docs/baltimore-reporting-catalog.md` |
| Map chrome and selected-sheet copy (“I see this too”, empty states, Super-report badge) | `lib/map-copy.ts` |
