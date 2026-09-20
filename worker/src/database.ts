import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MockAgency, MockStatus, WorkerIncident, WorkerReport } from './types.ts';
import {
  caseScoreFromReport,
  recalculateIncident,
  type GovernmentReportStatus,
} from '../../lib/incident-scoring.ts';

export function createWorkerClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY
  )?.trim();

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL. Set it in .env.local.');
  }
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Set it in .env.local.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchIncidents(client: SupabaseClient): Promise<WorkerIncident[] | null> {
  console.log('Fetching data from public.incidents...\n');

  const { data, error } = await client.from('incidents').select('*');

  if (error) {
    console.error('Failed to fetch incidents:\n');
    console.error(error.message);
    return null;
  }

  return (data ?? []) as WorkerIncident[];
}

export async function fetchIncident(
  client: SupabaseClient,
  incidentId: string,
): Promise<WorkerIncident | null> {
  const { data, error } = await client
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch incident ${incidentId}:\n`);
    console.error(error.message);
    return null;
  }

  return (data as WorkerIncident | null) ?? null;
}

export async function fetchIncidentReports(
  client: SupabaseClient,
  incidentId: string,
): Promise<WorkerReport[]> {
  const { data, error } = await client
    .from('reports')
    .select('id, session_id, image_path, user_description, context_summary, location_address, case_score, seriousness, ai_confidence, analysis_status, withdrawn')
    .eq('incident_id', incidentId)
    .eq('withdrawn', 0)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch reports for incident:\n');
    console.error(error.message);
    return [];
  }

  return (data ?? []) as WorkerReport[];
}

export async function persistIncidentScores(
  client: SupabaseClient,
  incident: WorkerIncident,
  reports: WorkerReport[],
): Promise<WorkerIncident> {
  const scoredReports = reports.map(report => ({
    session_id: report.session_id ?? incident.id,
    case_score: report.case_score,
    seriousness: report.seriousness,
    ai_confidence: report.ai_confidence,
    analysis_status: report.analysis_status,
    withdrawn: report.withdrawn,
  }));
  const aggregates = recalculateIncident(
    scoredReports,
    incident.government_report_status as GovernmentReportStatus | null,
  );
  for (const report of reports) {
    const score = caseScoreFromReport({
      session_id: report.session_id ?? incident.id,
      case_score: report.case_score,
      seriousness: report.seriousness,
      ai_confidence: report.ai_confidence,
      analysis_status: report.analysis_status,
      withdrawn: report.withdrawn,
    });
    if (report.id && report.case_score == null && score != null) {
      const { error } = await client.from('reports').update({ case_score: score }).eq('id', report.id);
      if (!error) report.case_score = score;
    }
  }
  if (
    aggregates.incident_score === incident.incident_score
    && aggregates.report_count === incident.report_count
    && aggregates.government_report_status === incident.government_report_status
  ) {
    return { ...incident, ...aggregates };
  }
  const { error } = await client.from('incidents').update({
    incident_score: aggregates.incident_score,
    report_count: aggregates.report_count,
    highest_seriousness: aggregates.highest_seriousness,
    government_report_status: aggregates.government_report_status,
  }).eq('id', incident.id);
  if (error) {
    console.error(`Could not persist scores for incident ${incident.id}:`);
    console.error(error.message);
  }
  return { ...incident, ...aggregates };
}

export async function markIncidentSubmitted(
  client: SupabaseClient,
  incidentId: string,
  referenceId: string,
  agency: MockAgency,
): Promise<void> {
  const payload = {
    mock_reference_id: referenceId,
    mock_submitted_at: Date.now(),
    mock_status: 'submitted' satisfies MockStatus,
    mock_error: null,
    mock_agency: agency,
    government_report_status: 'submitted',
  };
  const { error } = await client.from('incidents').update(payload).eq('id', incidentId);

  if (!error) return;

  const retry = await client.from('incidents').update({
    mock_reference_id: payload.mock_reference_id,
    mock_submitted_at: payload.mock_submitted_at,
    mock_status: payload.mock_status,
    mock_error: payload.mock_error,
  }).eq('id', incidentId);
  if (retry.error) {
    throw new Error(`Could not save mock reference id: ${retry.error.message}`);
  }
  console.warn('Saved mock confirmation without mock_agency/government_report_status. Apply later scoring migrations.');
}

export async function markIncidentFailed(
  client: SupabaseClient,
  incidentId: string,
  message: string,
): Promise<void> {
  const { error } = await client
    .from('incidents')
    .update({
      mock_status: 'failed' satisfies MockStatus,
      mock_error: message.replace(/\s+/g, ' ').slice(0, 180),
      government_report_status: 'failed',
    })
    .eq('id', incidentId);

  if (error) {
    console.error('Could not save mock filing failure:');
    console.error(error.message);
  }
}
