import { resolve } from 'node:path';
import { config } from 'dotenv';
import {
  createWorkerClient,
  fetchIncidentReports,
  fetchIncidents,
  markIncidentFailed,
  markIncidentSubmitted,
} from './database.ts';
import { buildMockFormPayload } from './form-payload.ts';
import { skipReason } from './ready-incidents.ts';
import { submitToMockGovernment } from './submitToMockGovernment.ts';
import type { WorkerIncident } from './types.ts';

config({ path: resolve(process.cwd(), '.env.local') });
config();

const POLL_INTERVAL_MS = 10_000;

async function submitReadyIncidents(
  client: ReturnType<typeof createWorkerClient>,
  incidents: WorkerIncident[],
) {
  for (const incident of incidents) {
    const reason = skipReason(incident);
    if (reason) {
      if (incident.evidence_count >= 2 || incident.mock_status === 'failed') {
        console.log(`Incident ${incident.id}: ${reason}. Skipping submission.`);
      }
      continue;
    }

    try {
      const reports = await fetchIncidentReports(client, incident.id);
      const payload = buildMockFormPayload(incident, reports);
      const referenceId = await submitToMockGovernment(payload);
      await markIncidentSubmitted(client, incident.id, referenceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to submit incident to mock government website:');
      console.error(message);
      await markIncidentFailed(client, incident.id, message);
    }
  }
}

async function processIncidents(client: ReturnType<typeof createWorkerClient>) {
  const incidents = await fetchIncidents(client);
  if (incidents === null) return;

  console.log(`Found ${incidents.length} incidents.\n`);
  console.log(incidents);
  console.log('');

  await submitReadyIncidents(client, incidents);
}

async function main() {
  console.log('Mock government worker started.\n');
  console.log('Connecting to Supabase...\n');
  const client = createWorkerClient();

  while (true) {
    await processIncidents(client);
    console.log('\nWaiting 10 seconds before the next fetch...\n');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
