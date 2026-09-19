export interface IncidentFilters {
  category?: string;
  incident_type?: string;
  tag?: string;
  common_only?: boolean;
  limit?: number;
}

export interface PublicIncident {
  id: string;
  category: string;
  incident_type: string | null;
  short_label: string;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  severity: string;
  credibility_score: number;
  evidence_count: number;
  highest_seriousness: number | null;
  average_ai_confidence: number | null;
  tags: string[];
  baltimore_service_candidates: string[];
  routing_disposition: string;
  created_at: number;
  updated_at: number;
  last_reported_at: number | null;
  is_super_report: boolean;
}

export type MappableIncident = PublicIncident & { latitude: number; longitude: number };

export function slugLabel(value: string | null | undefined): string {
  if (!value) return 'Unspecified';
  return value.replaceAll('_', ' ');
}

export function formatConfidence(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

export function isEmergencyIncident(incident: Pick<PublicIncident, 'routing_disposition'>): boolean {
  return incident.routing_disposition === 'emergency';
}

export function parseIncidentFilters(searchParams: URLSearchParams): IncidentFilters {
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

export function incidentsQuery(filters: IncidentFilters): string {
  const query = new URLSearchParams();
  if (filters.category) query.set('category', filters.category);
  if (filters.incident_type) query.set('incident_type', filters.incident_type);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.common_only) query.set('common_only', 'true');
  query.set('limit', String(filters.limit ?? 50));
  return query.toString();
}

export function incidentsPath(filters: IncidentFilters): string {
  return `/api/incidents?${incidentsQuery(filters)}`;
}

export function mappableIncidents(incidents: PublicIncident[]): MappableIncident[] {
  return incidents.flatMap((incident) => {
    const latitude = Number(incident.latitude);
    const longitude = Number(incident.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ ...incident, latitude, longitude }];
  });
}

export async function fetchIncidents(
  filters: IncidentFilters,
  signal?: AbortSignal,
): Promise<PublicIncident[]> {
  const response = await fetch(incidentsPath(filters), { signal, cache: 'no-store' });
  const data: unknown = await response.json().catch(() => null);
  const errorMessage =
    data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Incident data is temporarily unavailable.';
  if (!response.ok) throw new Error(errorMessage);
  if (!data || typeof data !== 'object' || !('incidents' in data) || !Array.isArray(data.incidents)) {
    throw new Error('Incident data is temporarily unavailable.');
  }
  return data.incidents as PublicIncident[];
}
