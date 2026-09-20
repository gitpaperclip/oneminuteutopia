import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export function incidentIdFromReportRow(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const value = (row as { incident_id?: unknown }).incident_id;
  if (typeof value !== 'string') return null;
  const incidentId = value.trim();
  return incidentId || null;
}

export function listenForNewReports(
  client: SupabaseClient,
  onIncident: (incidentId: string, reportId?: string) => void,
): RealtimeChannel {
  return client
    .channel('worker-reports-insert')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reports' },
      (payload) => {
        const incidentId = incidentIdFromReportRow(payload.new);
        if (!incidentId) {
          console.log('New report has no incident_id. Skipping.');
          return;
        }
        const reportId =
          payload.new && typeof payload.new === 'object' && 'id' in payload.new
            ? String(payload.new.id ?? '')
            : '';
        console.log(
          reportId
            ? `New report ${reportId} linked to incident ${incidentId}.`
            : `New report linked to incident ${incidentId}.`,
        );
        onIncident(incidentId, reportId || undefined);
      },
    );
}
