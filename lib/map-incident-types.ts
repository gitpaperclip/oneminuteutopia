import { HttpError } from './hazard-analysis.mjs';

export interface MapIncident {
  id: string;
  category: string;
  incident_type: string | null;
  short_label: string;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  severity: string;
  evidence_count: number;
  highest_seriousness: number | null;
  average_ai_confidence: number | null;
  tags: string[];
  routing_disposition: string;
  created_at: number;
  updated_at: number;
  last_reported_at: number | null;
  is_super_report: boolean;
}

export interface MapIncidentsResponse {
  incidents: MapIncident[];
}

export interface IncidentBbox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function toMapIncident(incident: {
  id: string;
  category: string;
  incident_type: string | null;
  short_label: string;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  severity: string;
  evidence_count: number;
  highest_seriousness: number | null;
  average_ai_confidence: number | null;
  tags: string[] | null;
  routing_disposition: string;
  created_at: number;
  updated_at: number;
  last_reported_at: number | null;
}): MapIncident {
  return {
    id: incident.id,
    category: incident.category,
    incident_type: incident.incident_type,
    short_label: incident.short_label,
    latitude: incident.latitude,
    longitude: incident.longitude,
    location_address: incident.location_address,
    status: incident.status,
    severity: incident.severity,
    evidence_count: incident.evidence_count,
    highest_seriousness: incident.highest_seriousness,
    average_ai_confidence: incident.average_ai_confidence,
    tags: incident.tags ?? [],
    routing_disposition: incident.routing_disposition,
    created_at: incident.created_at,
    updated_at: incident.updated_at,
    last_reported_at: incident.last_reported_at,
    is_super_report: incident.evidence_count >= 2,
  };
}

export function toPublicIncidentReports<T extends {
  id: string;
  incident_id: string | null;
  image_path: string;
  category: string;
  incident_type: string | null;
  short_label: string;
  user_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  ai_confidence: number | null;
  seriousness: number | null;
  analysis_status: string | null;
  tags: string[] | null;
  baltimore_service_candidates: string[] | null;
  routing_disposition: string;
  created_at: number;
}>(reports: T[]) {
  return reports.map(report => ({
    id: report.id,
    incident_id: report.incident_id,
    image_path: report.image_path,
    category: report.category,
    incident_type: report.incident_type,
    short_label: report.short_label,
    user_description: report.user_description,
    latitude: report.latitude,
    longitude: report.longitude,
    location_address: report.location_address,
    ai_confidence: report.ai_confidence,
    seriousness: report.seriousness,
    analysis_status: report.analysis_status,
    tags: report.tags ?? [],
    baltimore_service_candidates: report.baltimore_service_candidates ?? [],
    routing_disposition: report.routing_disposition,
    created_at: report.created_at,
  }));
}

export function parseBooleanQuery(value: string | null, label: string): boolean {
  if (value !== null && value !== 'true' && value !== 'false') {
    throw new HttpError(400, `${label} must be true or false.`);
  }
  return value === 'true';
}

export function parseLimitQuery(value: string | null): number {
  const limit = value === null ? 50 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, 'limit must be between 1 and 100.');
  }
  return limit;
}

export function parseBboxQuery(query: { get(name: string): string | null }): IncidentBbox | undefined {
  const raw = [query.get('min_lat'), query.get('max_lat'), query.get('min_lon'), query.get('max_lon')];
  if (raw.every(value => value === null)) return undefined;
  if (raw.some(value => value === null)) {
    throw new HttpError(400, 'Bounding box requires min_lat, max_lat, min_lon, and max_lon.');
  }
  const [minLat, maxLat, minLon, maxLon] = raw.map(value => Number(value));
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
    throw new HttpError(400, 'Bounding box values must be numbers.');
  }
  if (minLat > maxLat || minLon > maxLon) {
    throw new HttpError(400, 'Bounding box is inverted.');
  }
  return { minLat, maxLat, minLon, maxLon };
}
