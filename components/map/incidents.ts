import type {
  IncidentBbox,
  MapIncident,
  MapIncidentsResponse,
  PublicIncidentReport,
} from '@/lib/map-incident-types';
import { mappableIncidents } from '@/lib/map-geojson';

export type { MappableIncident } from '@/lib/map-geojson';
export { mappableIncidents };

export interface MapListFilters {
  category?: string;
  incident_type?: string;
  tag?: string;
  common_only?: boolean;
  limit?: number;
  bbox?: IncidentBbox;
}

export function isEmergencyIncident(incident: Pick<MapIncident, 'routing_disposition'>): boolean {
  return incident.routing_disposition === 'emergency';
}

export function parseMapFilters(searchParams: URLSearchParams): MapListFilters {
  const limitValue = searchParams.get('limit');
  const limit = limitValue === null ? 100 : Number(limitValue);
  return {
    category: searchParams.get('category') || undefined,
    incident_type: searchParams.get('incident_type') || undefined,
    tag: searchParams.get('tag') || undefined,
    common_only: searchParams.get('common_only') === 'true',
    limit: Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 100,
  };
}

export function hasActiveFilters(filters: MapListFilters): boolean {
  return Boolean(filters.category || filters.incident_type || filters.tag || filters.common_only);
}

export function incidentsQuery(filters: MapListFilters): string {
  const query = new URLSearchParams();
  if (filters.category) query.set('category', filters.category);
  if (filters.incident_type) query.set('incident_type', filters.incident_type);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.common_only) query.set('common_only', 'true');
  query.set('limit', String(filters.limit ?? 100));
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

export async function fetchMapIncidents(
  filters: MapListFilters,
  signal?: AbortSignal,
): Promise<MapIncidentsResponse> {
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
  return data;
}

function isMapIncidentsResponse(value: unknown): value is MapIncidentsResponse {
  return !!value && typeof value === 'object' && Array.isArray((value as MapIncidentsResponse).incidents);
}

export async function fetchIncidentDetail(
  incidentId: string,
  signal?: AbortSignal,
): Promise<{ reports: PublicIncidentReport[] }> {
  const response = await fetch(`/api/incidents?id=${encodeURIComponent(incidentId)}`, {
    signal,
    cache: 'no-store',
  });
  const data: unknown = await response.json().catch(() => null);
  const errorMessage =
    data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Incident photo is temporarily unavailable.';
  if (!response.ok) throw new Error(errorMessage);
  if (!isIncidentDetail(data)) {
    throw new Error('Incident photo is temporarily unavailable.');
  }
  return data;
}

function isIncidentDetail(value: unknown): value is { reports: PublicIncidentReport[] } {
  return !!value && typeof value === 'object' && Array.isArray((value as { reports?: unknown }).reports);
}

function confirmationError(data: unknown, fallback: string): string {
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
    ? data.error
    : fallback;
}

export async function fetchConfirmation(
  incidentId: string,
  signal?: AbortSignal,
): Promise<{ confirmation_count: number; viewer_confirmed: boolean }> {
  const response = await fetch(`/api/incidents/${incidentId}/confirmation`, {
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(confirmationError(data, 'Could not load confirmations.'));
  if (
    !data ||
    typeof data !== 'object' ||
    !('confirmation_count' in data) ||
    !('viewer_confirmed' in data)
  ) {
    throw new Error(confirmationError(data, 'Could not load confirmations.'));
  }
  return data as { confirmation_count: number; viewer_confirmed: boolean };
}

export async function setConfirmation(
  incidentId: string,
  confirm: boolean,
): Promise<{ confirmation_count: number; viewer_confirmed: boolean }> {
  const response = await fetch(`/api/incidents/${incidentId}/confirmation`, {
    method: confirm ? 'POST' : 'DELETE',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const data: unknown = await response.json().catch(() => null);
  const errorMessage = confirmationError(data, 'Could not update confirmation.');
  if (!response.ok) throw new Error(errorMessage);
  if (
    !data ||
    typeof data !== 'object' ||
    !('confirmation_count' in data) ||
    !('viewer_confirmed' in data)
  ) {
    throw new Error(errorMessage);
  }
  return data as { confirmation_count: number; viewer_confirmed: boolean };
}
