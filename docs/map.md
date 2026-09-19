# Public incident map

Architecture:

`Supabase/Postgres incidents → GET /api/incidents → GeoJSON → MapLibre`

OpenMapTiles (via `NEXT_PUBLIC_MAP_STYLE_URL`) is the basemap only. It is not
the source of incident records. Private tokens stay off `NEXT_PUBLIC_*`.

## Truncation

`GET /api/incidents` still caps at 100 rows. The handler fetches `limit + 1`
and returns:

```json
{ "incidents": [], "limit": 100, "returned": 100, "truncated": true }
```

The map treats `truncated: true` as “this view is incomplete — zoom in.” It
does not pretend the viewport is the full dataset. This keeps the current
bbox + GeoJSON clustering path compatible with a later PostGIS/MVT endpoint.

## Display vs database clustering

MapLibre clusters nearby dots at low zoom. That is not database
deduplication. Super-reports remain `evidence_count >= 2` from the 150 m /
72 h matcher. Do not label `cluster_radius_m` as a hazard or impact radius.

Coordinates are GeoJSON `[longitude, latitude]`. Missing
`highest_seriousness` is omitted from feature properties and painted gray —
it is never treated as 0.

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
