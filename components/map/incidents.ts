import type { IncidentBbox, MapIncident, MapIncidentsResponse } from '@/lib/map-incident-types';

export interface MapListFilters {
  category?: string;
  incident_type?: string;
  tag?: string;
  common_only?: boolean;
  limit?: number;
  bbox?: IncidentBbox;
}

export type MappableIncident = MapIncident & { latitude: number; longitude: number };

export function slugLabel(value: string | null | undefined): string {
  if (!value) return 'Unspecified';
  return value.replaceAll('_', ' ');
}

export function formatConfidence(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

export function isEmergencyIncident(incident: Pick<MapIncident, 'routing_disposition'>): boolean {
  return incident.routing_disposition === 'emergency';
}

export function parseMapFilters(searchParams: URLSearchParams): MapListFilters {
  const limitValue = searchParams.get('limit');
  const limit = limitValue === null ? 50 : Number(limitValue);
  return {
    category: searchParams.get('category') || undefined,
    incident_type: searchParams.get('incident_type') || undefined,
    tag: searchParams.get('tag') || undefined,
    common_only: searchParams.get('common_only') === 'true',
    limit: Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 50,
  };
}

export function incidentsQuery(filters: MapListFilters): string {
  const query = new URLSearchParams();
  if (filters.category) query.set('category', filters.category);
  if (filters.incident_type) query.set('incident_type', filters.incident_type);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.common_only) query.set('common_only', 'true');
  query.set('limit', String(filters.limit ?? 50));
  if (filters.bbox) {
    query.set('min_lat', String(filters.bbox.minLat));
    query.set('max_lat', String(filters.bbox.maxLat));
    query.set('min_lon', String(filters.bbox.minLon));
    query.set('max_lon', String(filters.bbox.maxLon));
  }
  return query.toString();
}

export function urlFiltersQuery(filters: MapListFilters): string {
  return incidentsQuery({
    category: filters.category,
    incident_type: filters.incident_type,
    tag: filters.tag,
    common_only: filters.common_only,
    limit: filters.limit,
  });
}

export function incidentsPath(filters: MapListFilters): string {
  return `/api/incidents?${incidentsQuery(filters)}`;
}

export function roundBbox(bbox: IncidentBbox): IncidentBbox {
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    minLat: round(bbox.minLat),
    maxLat: round(bbox.maxLat),
    minLon: round(bbox.minLon),
    maxLon: round(bbox.maxLon),
  };
}

export function sameBbox(a: IncidentBbox | undefined, b: IncidentBbox): boolean {
  return (
    a != null &&
    a.minLat === b.minLat &&
    a.maxLat === b.maxLat &&
    a.minLon === b.minLon &&
    a.maxLon === b.maxLon
  );
}

export function mappableIncidents(incidents: MapIncident[]): MappableIncident[] {
  return incidents.flatMap((incident) => {
    const latitude = Number(incident.latitude);
    const longitude = Number(incident.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ ...incident, latitude, longitude }];
  });
}

export async function fetchMapIncidents(
  filters: MapListFilters,
  signal?: AbortSignal,
): Promise<MapIncident[]> {
  const response = await fetch(incidentsPath(filters), { signal, cache: 'no-store' });
  const data: unknown = await response.json().catch(() => null);
  const errorMessage =
    data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Incident data is temporarily unavailable.';
  if (!response.ok) throw new Error(errorMessage);
  if (!isMapIncidentsResponse(data)) {
    throw new Error('Incident data is temporarily unavailable.');
  }
  return data.incidents;
}

function isMapIncidentsResponse(value: unknown): value is MapIncidentsResponse {
  return !!value && typeof value === 'object' && Array.isArray((value as MapIncidentsResponse).incidents);
}
