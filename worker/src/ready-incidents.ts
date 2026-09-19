import type { WorkerIncident } from './types.ts';
import { GOVERNMENT_REPORT_THRESHOLD } from '../../lib/incident-scoring.ts';

export const MOCK_FILING_EVIDENCE_THRESHOLD = 2;

export function skipReason(incident: WorkerIncident): string | null {
  if (incident.mock_reference_id) {
    return `already submitted (${incident.mock_reference_id})`;
  }
  if (incident.mock_status === 'submitted') {
    return 'already submitted';
  }
  if (incident.government_report_status === 'submitted') {
    return 'already submitted';
  }
  if (incident.mock_status === 'failed' || incident.government_report_status === 'failed') {
    return 'previous mock filing failed';
  }
  const markedReady = incident.government_report_status === 'ready_to_submit'
    || incident.government_report_status === 'submitting';
  const score = incident.incident_score;
  if (score == null) {
    if (incident.evidence_count < MOCK_FILING_EVIDENCE_THRESHOLD && !markedReady) {
      return `evidence_count ${incident.evidence_count} is below the reporting threshold of ${MOCK_FILING_EVIDENCE_THRESHOLD}`;
    }
  } else if (score < GOVERNMENT_REPORT_THRESHOLD && !markedReady) {
    return `incident_score ${score} is below the reporting threshold of ${GOVERNMENT_REPORT_THRESHOLD}`;
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
