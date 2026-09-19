import type { WorkerIncident } from './types.ts';

export const MOCK_FILING_EVIDENCE_THRESHOLD = 2;

export function skipReason(incident: WorkerIncident): string | null {
  if (incident.mock_reference_id) {
    return `already submitted (${incident.mock_reference_id})`;
  }
  if (incident.mock_status === 'submitted') {
    return 'already submitted';
  }
  if (incident.mock_status === 'failed') {
    return 'previous mock filing failed';
  }
  if (incident.evidence_count < MOCK_FILING_EVIDENCE_THRESHOLD) {
    return `evidence_count ${incident.evidence_count} is below the reporting threshold of ${MOCK_FILING_EVIDENCE_THRESHOLD}`;
  }
  if (incident.latitude == null || incident.longitude == null) {
    return 'missing latitude/longitude';
  }
  if (incident.routing_disposition === 'emergency') {
    return 'emergency incidents are 911-only';
  }
  if (incident.routing_disposition === 'no_submission') {
    return 'not reportable';
  }
  if (incident.status !== 'reported' && incident.status !== 'in_progress') {
    return `status ${incident.status} is not open`;
  }
  return null;
}

export function isReadyForMockFiling(incident: WorkerIncident): boolean {
  return skipReason(incident) === null;
}

export function readyIncidents(incidents: WorkerIncident[]): WorkerIncident[] {
  return incidents.filter(isReadyForMockFiling);
}
