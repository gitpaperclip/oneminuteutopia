import type { WorkerIncident } from './types.ts';

export type MockAgency = 'transportation' | 'general';

export interface MockAgencyRoute {
  agency: MockAgency;
  label: string;
  url: string;
  openButtonName: string;
}

const TRANSPORT_CATEGORIES = new Set([
  'roads_and_sidewalks',
  'traffic_signals_and_streetlights',
]);

const SKIP_CATEGORIES = new Set([
  'fire_injury_or_immediate_threat',
  'no_visible_hazard',
  'unable_to_assess',
]);

const TRANSPORT_HINT =
  /\b(pothole|sidewalk|streetlight|street light|traffic signal|traffic light|roadway|pavement|guardrail|crosswalk|stop sign|lane marking|bike lane|broken street|crack(?:s|ed)? (?:in|on) (?:the )?road)\b/i;

function inspectText(incident: WorkerIncident, extraText = ''): string {
  return [
    incident.category,
    incident.incident_type,
    incident.short_label,
    extraText,
  ]
    .filter(Boolean)
    .join(' ');
}

export function mockAgencyRoute(agency: MockAgency): MockAgencyRoute {
  if (agency === 'transportation') {
    return {
      agency,
      label: 'Riverton Department of Transportation',
      url:
        process.env.MOCK_TRANSPORTATION_URL?.trim() ||
        'https://mock-second-gov-site-transportation.vercel.app/',
      openButtonName: 'Report a Roadway Hazard',
    };
  }

  return {
    agency: 'general',
    label: 'City 311',
    url:
      process.env.MOCK_GOVERNMENT_URL?.trim() ||
      'https://mock-government-page-without-api.vercel.app/',
    openButtonName: 'Report an Issue',
  };
}

export function routeIncident(
  incident: WorkerIncident,
  extraText = '',
): MockAgencyRoute | null {
  if (
    SKIP_CATEGORIES.has(incident.category) ||
    incident.routing_disposition === 'emergency' ||
    incident.routing_disposition === 'no_submission'
  ) {
    return null;
  }

  if (TRANSPORT_CATEGORIES.has(incident.category)) {
    return mockAgencyRoute('transportation');
  }

  const blob = inspectText(incident, extraText);
  if (incident.category === 'other_hazard' && TRANSPORT_HINT.test(blob)) {
    return mockAgencyRoute('transportation');
  }

  return mockAgencyRoute('general');
}
