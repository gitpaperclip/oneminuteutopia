import type { MockGovernmentPayload, WorkerIncident, WorkerReport } from './types.ts';

const TEMP_DESCRIPTION =
  'Automated test report for an aggregated civic infrastructure incident.';
const TEMP_PHOTO_URL = 'https://example.com/test-photo.jpg';

export function buildMockFormPayload(
  incident: WorkerIncident,
  reports: WorkerReport[],
): MockGovernmentPayload {
  const first = reports[0];
  const issue = incident.incident_type || incident.category;
  const note =
    first?.user_description?.trim() ||
    first?.context_summary?.trim() ||
    incident.location_address?.trim() ||
    TEMP_DESCRIPTION;
  const description = `${issue} (${incident.evidence_count} nearby reports). ${note}`.slice(0, 500);
  const photoUrl = first?.image_path?.trim() || TEMP_PHOTO_URL;

  return {
    description,
    latitude: String(incident.latitude),
    longitude: String(incident.longitude),
    photoUrl,
  };
}
