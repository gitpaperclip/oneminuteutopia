import 'server-only';
import { PROMPT_VERSION, validateAnalysis } from './hazard-analysis.mjs';
import { normalizedTags } from './incident-taxonomy.mjs';
import { baltimoreRouteForIncidentType } from './baltimore-311-routing.mjs';
import type { AnalysisResult } from './gemini';

export interface SavedAnalysis extends AnalysisResult {
  id: string;
  session_id: string;
  image_path: string;
  image_hash: string;
  context_summary: string;
  context_tags: string[];
  tags: string[];
  baltimore_service_candidates: string[];
  routing_disposition: '311' | 'manual_review' | 'emergency' | 'no_submission';
  model: string;
  report_id: string | null;
  analysis_status: 'complete' | 'unavailable';
}

export class AnalysisStorageError extends Error {
  status: number;
  constructor(status: number) {
    super('Supabase analysis storage request failed');
    this.status = status;
  }
}

// This module is imported only by server routes. No service credential reaches the browser.
export class AnalysisStore {
  private static async request(query: string, init: RequestInit = {}) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase analysis storage is not configured');
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/image_analyses${query}`, {
      ...init,
      headers: {
        apikey: key,
        ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new AnalysisStorageError(response.status);
    return response.json() as Promise<SavedAnalysis[]>;
  }

  static async save(data: AnalysisResult & { session_id: string; image_path: string; image_hash: string; model: string; analysis_status: 'complete' | 'unavailable' }) {
    validateAnalysis({
      category: data.category, incident_type: data.incident_type,
      seriousness: data.seriousness, ai_confidence: data.ai_confidence,
      context_summary: data.context_summary, context_tags: data.context_tags,
    });
    const tags = normalizedTags(data.incident_type, data.context_tags);
    const route = baltimoreRouteForIncidentType(data.incident_type);
    if (!route) throw new Error('Analysis incident type has no Baltimore routing contract');
    const [saved] = await this.request('', {
      method: 'POST', body: JSON.stringify({
        ...data, tags, prompt_version: PROMPT_VERSION,
        baltimore_service_candidates: route.service_types,
        routing_disposition: route.disposition,
      }),
    });
    if (!saved?.id) throw new Error('Analysis was not saved');
    return saved;
  }

  static async getOwned(id: string, sessionId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid analysis ID');
    const [saved] = await this.request(`?id=eq.${encodeURIComponent(id)}&session_id=eq.${encodeURIComponent(sessionId)}&select=*`);
    if (!saved) throw new Error('Analysis not found');
    return saved;
  }

}
