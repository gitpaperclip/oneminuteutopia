import type { MapIncident } from './map-incident-types.ts';

export type MappableIncident = MapIncident & { latitude: number; longitude: number };

export interface IncidentFeatureProperties {
  id: string;
  evidence_count: number;
  confirmation_count: number;
  is_super_report: 0 | 1;
  emergency: 0 | 1;
  seriousness?: number;
}

export interface IncidentFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: IncidentFeatureProperties;
}

export interface IncidentFeatureCollection {
  type: 'FeatureCollection';
  features: IncidentFeature[];
}

export function hasSeriousness(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Missing seriousness stays unset. Never coerce null/undefined to 0. */
export function seriousnessProperty(value: number | null | undefined): number | undefined {
  return hasSeriousness(value) ? value : undefined;
}

export function mappableIncidents(incidents: MapIncident[]): MappableIncident[] {
  return incidents.flatMap((incident) => {
    const latitude = Number(incident.latitude);
    const longitude = Number(incident.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ ...incident, latitude, longitude }];
  });
}

export function incidentsToGeoJSON(
  incidents: MappableIncident[],
  isEmergency: (incident: MappableIncident) => boolean,
): IncidentFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: incidents.map((incident) => {
      const seriousness = seriousnessProperty(incident.highest_seriousness);
      const properties: IncidentFeatureProperties = {
        id: incident.id,
        evidence_count: incident.evidence_count,
        confirmation_count: incident.confirmation_count,
        is_super_report: incident.is_super_report ? 1 : 0,
        emergency: isEmergency(incident) ? 1 : 0,
      };
      if (seriousness !== undefined) properties.seriousness = seriousness;
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [incident.longitude, incident.latitude],
        },
        properties,
      };
    }),
  };
}

/** Gray when unscored — not the low-risk blue that would treat missing as 0. */
export const MISSING_SERIOUSNESS_COLOR = '#6b7280';

export function pointColorExpression(): unknown[] {
  return [
    'case',
    ['==', ['get', 'emergency'], 1],
    '#dc2626',
    ['==', ['get', 'is_super_report'], 1],
    '#d97706',
    ['==', ['typeof', ['get', 'seriousness']], 'number'],
    [
      'interpolate',
      ['linear'],
      ['get', 'seriousness'],
      1,
      '#2563eb',
      4,
      '#0d9488',
      7,
      '#d97706',
      9,
      '#dc2626',
    ],
    MISSING_SERIOUSNESS_COLOR,
  ];
}
