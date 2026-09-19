import 'server-only';
import postgres from 'postgres';
import { nanoid } from 'nanoid';
import { formatTimestamp } from './utils.ts';
import { HttpError } from './hazard-analysis.mjs';
import { CATEGORY_LABELS } from './analysis-labels.ts';
import type { SavedAnalysis } from './analysis-store.ts';
import type { ReportInput } from './report-input.ts';

export interface Report {
  id: string;
  incident_id: string | null;
  session_id: string;
  image_path: string;
  image_hash: string;
  category: string;
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
}

export interface Incident {
  id: string;
  category: string;
  short_label: string;
  full_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  severity: string;
  credibility_score: number;
  evidence_count: number;
  created_at: number;
  updated_at: number;
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
    await sql`SELECT r.id, a.analysis_status FROM public.reports r FULL JOIN public.image_analyses a ON a.report_id = r.id LIMIT 1`;
    await sql`SELECT id FROM public.sessions LIMIT 1`;
    await sql`SELECT key FROM public.request_limits LIMIT 1`;
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

  static async submitReport(sessionId: string, input: ReportInput): Promise<{ report: Report; duplicate: boolean }> {
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
        return { report, duplicate: true };
      }
      const now = Date.now();
      const incidentId = nanoid();
      const reportId = nanoid();
      const label = CATEGORY_LABELS[input.category];
      const corrected = input.category !== analysis.category ? 1 : 0;
      await tx`INSERT INTO public.incidents (id, category, short_label, full_description, latitude, longitude, location_address, status, created_at, updated_at)
        VALUES (${incidentId}, ${input.category}, ${label}, ${input.user_description}, ${input.latitude}, ${input.longitude}, ${input.location_address}, 'reported', ${now}, ${now})`;
      const [report] = await tx<Report[]>`INSERT INTO public.reports (
        id, incident_id, session_id, image_path, image_hash, category, short_label,
        full_description, user_description, latitude, longitude, location_accuracy, location_source,
        location_address, ai_confidence, ai_model, user_corrected, created_at, idempotency_key,
        seriousness, analysis_status)
        VALUES (${reportId}, ${incidentId}, ${sessionId}, ${analysis.image_path}, ${analysis.image_hash}, ${input.category}, ${label},
        ${input.user_description}, ${input.user_description}, ${input.latitude}, ${input.longitude}, ${input.location_accuracy}, ${input.location_source},
        ${input.location_address}, ${analysis.analysis_status === 'complete' ? analysis.ai_confidence / 100 : null}, ${analysis.model}, ${corrected}, ${now}, ${analysis.id},
        ${analysis.seriousness}, ${analysis.analysis_status}) RETURNING *`;
      await tx`UPDATE public.image_analyses SET report_id = ${reportId}, incident_id = ${incidentId},
        latitude = ${input.latitude}, longitude = ${input.longitude}, location_address = ${input.location_address}, submitted_at = now()
        WHERE id = ${analysis.id} AND session_id = ${sessionId}`;
      return { report, duplicate: false };
    });
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
}
