import { resolve } from 'node:path';
import { config } from 'dotenv';
import { routeIncident } from './agency-route.ts';
import {
  createWorkerClient,
  fetchIncident,
  fetchIncidentReports,
  fetchIncidents,
  markIncidentFailed,
  markIncidentSubmitted,
} from './database.ts';
import { buildMockFormPayload } from './form-payload.ts';
import { createSerialQueue } from './incident-queue.ts';
import { skipReason } from './ready-incidents.ts';
import { listenForNewReports } from './report-watch.ts';
import { submitToMockGovernment } from './submitToMockGovernment.ts';
import type { WorkerIncident, WorkerReport } from './types.ts';

config({ path: resolve(process.cwd(), '.env.local') });
config();

function extraInspectText(reports: WorkerReport[]): string {
  return reports
    .flatMap((report) => [report.user_description, report.context_summary, report.location_address])
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ');
}

async function submitIncident(
  client: ReturnType<typeof createWorkerClient>,
  incident: WorkerIncident,
) {
  const reason = skipReason(incident);
  if (reason) {
    if (
      (incident.incident_score != null && incident.incident_score >= 0.75)
      || incident.government_report_status === 'ready_to_submit'
      || incident.mock_status === 'failed'
    ) {
      console.log(`Incident ${incident.id}: ${reason}. Skipping submission.`);
    }
    return;
  }

  try {
    const reports = await fetchIncidentReports(client, incident.id);
    const route = routeIncident(incident, extraInspectText(reports));
    if (!route) {
      console.log(
        `Incident ${incident.id}: no mock agency for category ${incident.category}. Skipping submission.`,
      );
      return;
    }

    console.log(`Incident ${incident.id}: routing to ${route.label} (${route.agency}).`);
    const payload = buildMockFormPayload(incident, reports);
    const referenceId = await submitToMockGovernment(payload, route);
    await markIncidentSubmitted(client, incident.id, referenceId, route.agency);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to submit incident to mock government website:');
    console.error(message);
    await markIncidentFailed(client, incident.id, message);
  }
}

async function processIncidentById(
  client: ReturnType<typeof createWorkerClient>,
  incidentId: string,
) {
  const incident = await fetchIncident(client, incidentId);
  if (!incident) {
    console.log(`Incident ${incidentId} was not found.`);
    return;
  }
  await submitIncident(client, incident);
}

async function processExistingIncidents(client: ReturnType<typeof createWorkerClient>) {
  const incidents = await fetchIncidents(client);
  if (incidents === null) return;

  console.log(`Checking ${incidents.length} existing incident(s) for a backlog filing.\n`);
  for (const incident of incidents) {
    await submitIncident(client, incident);
  }
}

async function main() {
  console.log('Mock government worker started.\n');
  console.log('Connecting to Supabase...\n');
  const client = createWorkerClient();
  const queue = createSerialQueue(async (incidentId: string) => {
    await processIncidentById(client, incidentId);
  });

  await processExistingIncidents(client);

  const channel = listenForNewReports(client, (incidentId) => {
    void queue.enqueue(incidentId);
  });

  await new Promise<void>(() => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Listening for new rows on public.reports.\n');
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(
          'Realtime listen failed. Apply supabase/migrations/202609190007_reports_realtime.sql and enable Realtime for public.reports in the Supabase dashboard.',
        );
        if (err) console.error(err);
      }
    });
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
