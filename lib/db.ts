import 'server-only';
import postgres from 'postgres';
import { nanoid } from 'nanoid';
import { formatTimestamp } from './utils.ts';
import { HttpError } from './hazard-analysis.mjs';
import { CATEGORY_LABELS } from './analysis-labels.ts';
import {
  fallbackIncidentType, incidentTypeMatchesCategory, normalizedTags,
} from './incident-taxonomy.mjs';
import { baltimoreRouteForIncidentType } from './baltimore-311-routing.mjs';
import type { SavedAnalysis } from './analysis-store.ts';
import type { ReportInput } from './report-input.ts';
import {
  caseScoreFromAnalysis,
  recalculateIncident,
  type GovernmentReportStatus,
} from './incident-scoring.ts';
import {
  INCIDENT_CLUSTER_SEARCH_METERS,
  INCIDENT_CLUSTER_WINDOW_MS,
  boundingBoxDeltas,
  chooseKeeperIncident,
  clusterRadiusMeters,
  overlappingIncidentIds,
} from './incident-clustering.ts';

export interface Report {
  id: string;
  incident_id: string | null;
  session_id: string;
  image_path: string;
  image_hash: string;
  category: string;
  incident_type: string | null;
  context_summary: string | null;
  tags: string[];
  baltimore_service_candidates: string[];
  routing_disposition: string;
  short_label: string;
  full_description: string | null;
  user_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_source: string | null;
  location_address: string | null;
  ai_confidence: number | null;
  seriousness: number | null;
  analysis_status: string | null;
  ai_model: string | null;
  ai_routing: string | null;
  user_corrected: number;
  created_at: number;
  withdrawn: number;
  idempotency_key: string | null;
  case_score: number | null;
}

export interface Incident {
  id: string;
  category: string;
  incident_type: string | null;
  tags: string[];
  baltimore_service_candidates: string[];
  routing_disposition: string;
  short_label: string;
  full_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  severity: string;
  credibility_score: number;
  evidence_count: number;
  highest_seriousness: number | null;
  average_ai_confidence: number | null;
  ai_evidence_count: number;
  last_reported_at: number | null;
  cluster_radius_m: number;
  created_at: number;
  updated_at: number;
  mock_reference_id: string | null;
  mock_submitted_at: number | null;
  mock_status: 'pending' | 'submitted' | 'failed';
  mock_error: string | null;
  mock_agency: 'transportation' | 'general' | null;
  incident_score: number;
  report_count: number;
  government_report_status: GovernmentReportStatus;
}

export {
  CLUSTER_ACCURACY_MULTIPLIER,
  INCIDENT_CLUSTER_SEARCH_METERS,
  INCIDENT_CLUSTER_WINDOW_MS,
  clusterRadiusMeters,
} from './incident-clustering.ts';

const GOVERNMENT_STATUS_RANK: Record<GovernmentReportStatus, number> = {
  not_ready: 0,
  ready_to_submit: 1,
  submitting: 2,
  failed: 3,
  submitted: 4,
};

function preferredGovernmentStatus(
  current: GovernmentReportStatus,
  incoming: GovernmentReportStatus | null | undefined,
): GovernmentReportStatus {
  if (!incoming) return current;
  return (GOVERNMENT_STATUS_RANK[incoming] ?? 0) >= (GOVERNMENT_STATUS_RANK[current] ?? 0)
    ? incoming
    : current;
}

async function absorbIncidents(
  tx: any,
  keeper: Incident,
  absorbed: Incident[],
  now: number,
): Promise<void> {
  if (absorbed.length === 0) return;
  const mockSource = [keeper, ...absorbed].find(item => item.mock_status === 'submitted')
    ?? [keeper, ...absorbed].find(item => item.mock_status === 'failed')
    ?? keeper;
  let governmentStatus = keeper.government_report_status ?? 'not_ready';
  for (const item of absorbed) {
    governmentStatus = preferredGovernmentStatus(governmentStatus, item.government_report_status);
  }
  await tx`UPDATE public.incidents SET
    mock_reference_id = ${mockSource.mock_reference_id},
    mock_submitted_at = ${mockSource.mock_submitted_at},
    mock_status = ${mockSource.mock_status},
    mock_error = ${mockSource.mock_error},
    mock_agency = ${mockSource.mock_agency},
    government_report_status = ${governmentStatus},
    updated_at = ${now}
    WHERE id = ${keeper.id}`;
  for (const item of absorbed) {
    await tx`UPDATE public.reports SET incident_id = ${keeper.id} WHERE incident_id = ${item.id}`;
    await tx`UPDATE public.image_analyses SET incident_id = ${keeper.id} WHERE incident_id = ${item.id}`;
    await tx`UPDATE public.incidents SET
      status = 'merged', evidence_count = 0, report_count = 0, updated_at = ${now}
      WHERE id = ${item.id}`;
  }
}

async function refreshIncidentAggregates(tx: any, incidentId: string, now: number): Promise<void> {
  const reports = (await tx`SELECT * FROM public.reports WHERE incident_id = ${incidentId} AND withdrawn = 0
    ORDER BY created_at ASC`) as Report[];
  const [incident] = (await tx`SELECT * FROM public.incidents WHERE id = ${incidentId}`) as Incident[];
  if (!incident) throw new Error('Incident is missing');
  const located = reports.filter(report => report.latitude != null && report.longitude != null);
  const latitude = located.length
    ? located.reduce((sum, report) => sum + report.latitude!, 0) / located.length
    : incident.latitude;
  const longitude = located.length
    ? located.reduce((sum, report) => sum + report.longitude!, 0) / located.length
    : incident.longitude;
  const tags = [...new Set(reports.flatMap(report => report.tags ?? []))].sort();
  const services = [...new Set(reports.flatMap(report => report.baltimore_service_candidates ?? []))].sort();
  const confidences = reports
    .map(report => report.ai_confidence)
    .filter((value): value is number => value != null);
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : null;
  const clusterRadius = Math.max(
    clusterRadiusMeters(null),
    ...reports.map(report => clusterRadiusMeters(report.location_accuracy)),
  );
  const routingDisposition = reports.some(report => report.routing_disposition === 'emergency')
    ? 'emergency'
    : (reports.at(-1)?.routing_disposition ?? incident.routing_disposition);
  const locationAddress = incident.location_address
    ?? reports.find(report => report.location_address)?.location_address
    ?? null;
  const aggregates = recalculateIncident(reports, incident.government_report_status);
  await tx`UPDATE public.incidents SET
    evidence_count = ${reports.length}, tags = ${tags},
    baltimore_service_candidates = ${services}, routing_disposition = ${routingDisposition},
    latitude = ${latitude}, longitude = ${longitude}, location_address = ${locationAddress},
    highest_seriousness = ${aggregates.highest_seriousness},
    average_ai_confidence = ${averageConfidence},
    ai_evidence_count = ${confidences.length},
    cluster_radius_m = ${clusterRadius},
    last_reported_at = ${now},
    incident_score = ${aggregates.incident_score},
    report_count = ${aggregates.report_count},
    government_report_status = ${aggregates.government_report_status},
    updated_at = ${now}
    WHERE id = ${incidentId}`;
}

export class DatabaseService {
  private static sql: ReturnType<typeof postgres> | null = null;
  static formatTimestamp = formatTimestamp;

  static getConnection(): ReturnType<typeof postgres> {
    if (this.sql) return this.sql;
    const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING;
    if (!url) throw new Error('Database is not configured');
    const hostname = new URL(url).hostname;
    this.sql = postgres(url, {
      ssl: hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.com') ? 'require' : undefined,
      prepare: false, max: 5, idle_timeout: 20, connect_timeout: 8,
    });
    return this.sql;
  }

  static async testConnection(): Promise<void> {
    const sql = this.getConnection();
    // Also proves the migration has been applied; no runtime DDL on request paths.
    await sql`SELECT r.id, r.incident_type, r.routing_disposition,
      a.analysis_status, a.tags, a.baltimore_service_candidates
      FROM public.reports r FULL JOIN public.image_analyses a ON a.report_id = r.id LIMIT 1`;
    await sql`SELECT id FROM public.sessions LIMIT 1`;
    await sql`SELECT key FROM public.request_limits LIMIT 1`;
    await sql`SELECT incident_type, evidence_count, tags, mock_status, mock_reference_id,
      incident_score, report_count, government_report_status FROM public.incidents LIMIT 1`;
    await sql`SELECT case_score FROM public.reports LIMIT 1`;
  }

  static async createSession(): Promise<string> {
    const sql = this.getConnection();
    const id = nanoid(32);
    const now = Date.now();
    await sql`INSERT INTO public.sessions (id, created_at, last_seen) VALUES (${id}, ${now}, ${now})`;
    return id;
  }

  static async validateSession(id: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{21,64}$/.test(id)) return false;
    const sql = this.getConnection();
    const rows = await sql`UPDATE public.sessions SET last_seen = ${Date.now()} WHERE id = ${id} RETURNING id`;
    return rows.length === 1;
  }

  static async checkRateLimit(sessionId: string, action: 'upload' | 'submit', limit: number): Promise<boolean> {
    const sql = this.getConnection();
    const key = `${action}:${sessionId}`;
    const now = Date.now();
    const reset = now + 60 * 60 * 1000;
    const rows = await sql`INSERT INTO public.request_limits (key, count, reset_at)
      VALUES (${key}, 1, ${reset}) ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN request_limits.reset_at <= ${now} THEN 1 ELSE request_limits.count + 1 END,
        reset_at = CASE WHEN request_limits.reset_at <= ${now} THEN ${reset} ELSE request_limits.reset_at END
      WHERE request_limits.reset_at <= ${now} OR request_limits.count < ${limit}
      RETURNING key`;
    return rows.length === 1;
  }

  static async submitReport(sessionId: string, input: ReportInput): Promise<{ report: Report; duplicate: boolean; clustered: boolean }> {
    const sql = this.getConnection();
    return await sql.begin(async tx => {
      await tx`SET LOCAL statement_timeout = '10s'`;
      // Lock the owned draft so simultaneous submissions serialize on one analysis.
      const [analysis] = await tx<SavedAnalysis[]>`SELECT * FROM public.image_analyses
        WHERE id = ${input.analysis_id} AND session_id = ${sessionId} FOR UPDATE`;
      if (!analysis) throw new HttpError(404, 'Saved analysis was not found for this session. Upload the photo again.');
      if (analysis.report_id) {
        const [report] = await tx<Report[]>`SELECT * FROM public.reports WHERE id = ${analysis.report_id} AND session_id = ${sessionId}`;
        if (!report) throw new Error('Linked report is missing');
        const [incident] = report.incident_id
          ? await tx<Incident[]>`SELECT * FROM public.incidents WHERE id = ${report.incident_id}` : [];
        return { report, duplicate: true, clustered: (incident?.evidence_count ?? 1) > 1 };
      }
      const now = Date.now();
      const reportId = nanoid();
      const label = CATEGORY_LABELS[input.category];
      const corrected = input.category !== analysis.category ? 1 : 0;
      const keepModelType = analysis.analysis_status === 'complete' &&
        input.category === analysis.category &&
        incidentTypeMatchesCategory(input.category, analysis.incident_type);
      const incidentType = keepModelType ? analysis.incident_type : fallbackIncidentType(input.category);
      const baltimoreRoute = baltimoreRouteForIncidentType(incidentType);
      if (!baltimoreRoute) throw new Error('Incident type has no Baltimore routing contract');
      const serviceCandidates = [...baltimoreRoute.service_types];
      const routingDisposition = baltimoreRoute.disposition;
      const contextTags = Array.isArray(analysis.context_tags) ? analysis.context_tags : [];
      const tags = normalizedTags(incidentType, contextTags);
      const confidence = analysis.analysis_status === 'complete' ? analysis.ai_confidence / 100 : null;
      const caseScore = caseScoreFromAnalysis(
        analysis.seriousness, analysis.ai_confidence, analysis.analysis_status,
      );

      let incidentId: string | undefined;
      let clustered = false;
      if (input.latitude !== null && input.longitude !== null) {
        // Serialize clustering for one subtype so simultaneous first reports do not
        // create competing super-reports before either transaction can see the other.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${incidentType}))`;
        const { latitudeDelta, longitudeDelta } = boundingBoxDeltas(input.latitude, INCIDENT_CLUSTER_SEARCH_METERS);
        const candidates = await tx<Incident[]>`SELECT * FROM public.incidents
          WHERE incident_type = ${incidentType}
            AND status IN ('reported', 'in_progress')
            AND updated_at >= ${now - INCIDENT_CLUSTER_WINDOW_MS}
            AND latitude BETWEEN ${input.latitude - latitudeDelta} AND ${input.latitude + latitudeDelta}
            AND longitude BETWEEN ${input.longitude - longitudeDelta} AND ${input.longitude + longitudeDelta}
          FOR UPDATE`;
        const memberReports = candidates.length === 0 ? [] : await tx<(Pick<Report, 'incident_id' | 'latitude' | 'longitude' | 'location_accuracy'>)[]>`
          SELECT r.incident_id, r.latitude, r.longitude, r.location_accuracy
          FROM public.reports r
          INNER JOIN public.incidents i ON i.id = r.incident_id
          WHERE i.incident_type = ${incidentType}
            AND i.status IN ('reported', 'in_progress')
            AND i.updated_at >= ${now - INCIDENT_CLUSTER_WINDOW_MS}
            AND r.withdrawn = 0
            AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
            AND r.latitude BETWEEN ${input.latitude - latitudeDelta} AND ${input.latitude + latitudeDelta}
            AND r.longitude BETWEEN ${input.longitude - longitudeDelta} AND ${input.longitude + longitudeDelta}`;
        const matchIds = overlappingIncidentIds(
          {
            latitude: input.latitude,
            longitude: input.longitude,
            location_accuracy: input.location_accuracy,
          },
          memberReports.flatMap(report => {
            if (report.latitude == null || report.longitude == null) return [];
            return [{
              incident_id: report.incident_id,
              latitude: report.latitude,
              longitude: report.longitude,
              location_accuracy: report.location_accuracy,
            }];
          }),
        );
        const matched = candidates.filter(candidate => matchIds.includes(candidate.id));
        if (matched.length > 0) {
          clustered = true;
          const keeper = chooseKeeperIncident(matched);
          incidentId = keeper.id;
          await absorbIncidents(tx, keeper, matched.filter(item => item.id !== keeper.id), now);
        }
      }

      if (!incidentId) {
        incidentId = nanoid();
        await tx`INSERT INTO public.incidents (
          id, category, incident_type, short_label, full_description, tags,
          baltimore_service_candidates, routing_disposition,
          latitude, longitude, location_address, status, severity, credibility_score,
          evidence_count, highest_seriousness, average_ai_confidence, ai_evidence_count, cluster_radius_m,
          last_reported_at, created_at, updated_at)
          VALUES (${incidentId}, ${input.category}, ${incidentType}, ${label}, ${input.user_description}, ${tags},
          ${serviceCandidates}, ${routingDisposition},
          ${input.latitude}, ${input.longitude}, ${input.location_address}, 'reported', 'normal', 0,
          1, ${analysis.seriousness}, ${confidence}, ${confidence === null ? 0 : 1}, ${clusterRadiusMeters(input.location_accuracy)},
          ${now}, ${now}, ${now})`;
      }
      const [report] = await tx<Report[]>`INSERT INTO public.reports (
        id, incident_id, session_id, image_path, image_hash, category, incident_type, short_label,
        full_description, user_description, latitude, longitude, location_accuracy, location_source,
        location_address, ai_confidence, ai_model, user_corrected, created_at, idempotency_key,
        seriousness, analysis_status, context_summary, tags,
        baltimore_service_candidates, routing_disposition, case_score)
        VALUES (${reportId}, ${incidentId}, ${sessionId}, ${analysis.image_path}, ${analysis.image_hash}, ${input.category}, ${incidentType}, ${label},
        ${input.user_description}, ${input.user_description}, ${input.latitude}, ${input.longitude}, ${input.location_accuracy}, ${input.location_source},
        ${input.location_address}, ${confidence}, ${analysis.model}, ${corrected}, ${now}, ${analysis.id},
        ${analysis.seriousness}, ${analysis.analysis_status}, ${analysis.context_summary}, ${tags},
        ${serviceCandidates}, ${routingDisposition}, ${caseScore}) RETURNING *`;
      await tx`UPDATE public.image_analyses SET report_id = ${reportId}, incident_id = ${incidentId},
        latitude = ${input.latitude}, longitude = ${input.longitude}, location_address = ${input.location_address},
        submitted_at = now(), case_score = ${caseScore}
        WHERE id = ${analysis.id} AND session_id = ${sessionId}`;
      await refreshIncidentAggregates(tx, incidentId, now);
      return { report, duplicate: false, clustered };
    });
  }

  static async listIncidents(filters: {
    category?: string; incidentType?: string; tag?: string; commonOnly?: boolean; limit?: number;
  } = {}): Promise<Incident[]> {
    const sql = this.getConnection();
    const category = filters.category ?? null;
    const incidentType = filters.incidentType ?? null;
    const tag = filters.tag ?? null;
    const commonOnly = filters.commonOnly ?? false;
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    return await sql<Incident[]>`SELECT * FROM public.incidents
      WHERE (${category}::text IS NULL OR category = ${category})
        AND (${incidentType}::text IS NULL OR incident_type = ${incidentType})
        AND (${tag}::text IS NULL OR ${tag} = ANY(tags))
        AND status <> 'merged'
        AND (${commonOnly} = false OR evidence_count >= 2)
      ORDER BY updated_at DESC LIMIT ${limit}`;
  }

  static async getReport(id: string): Promise<Report | undefined> {
    if (!/^[A-Za-z0-9_-]{21}$/.test(id)) return undefined;
    const sql = this.getConnection();
    const [report] = await sql<Report[]>`SELECT * FROM public.reports WHERE id = ${id} AND withdrawn = 0`;
    return report;
  }

  static async getIncident(id: string): Promise<Incident | undefined> {
    const sql = this.getConnection();
    const [incident] = await sql<Incident[]>`SELECT * FROM public.incidents WHERE id = ${id}`;
    return incident;
  }

  static async getIncidentReports(incidentId: string): Promise<Report[]> {
    const sql = this.getConnection();
    const reports = await sql<Report[]>`SELECT * FROM public.reports WHERE incident_id = ${incidentId} AND withdrawn = 0 ORDER BY created_at ASC`;
    return reports;
  }
}
