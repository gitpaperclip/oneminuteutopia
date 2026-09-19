import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { DatabaseService } from '@/lib/db';
import { CONTEXT_TAGS, INCIDENT_TYPES } from '@/lib/incident-taxonomy.mjs';
import { HttpError } from '@/lib/hazard-analysis.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function optionalPreset(value: string | null, allowed: readonly string[], label: string): string | undefined {
  if (!value) return undefined;
  if (!allowed.includes(value)) throw new HttpError(400, `Unknown ${label} filter.`);
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams;
    const category = optionalPreset(query.get('category'), Object.keys(CATEGORY_LABELS), 'category');
    const incidentType = optionalPreset(query.get('incident_type'), INCIDENT_TYPES, 'incident type');
    const tag = optionalPreset(query.get('tag'), [...INCIDENT_TYPES, ...CONTEXT_TAGS], 'tag');
    const commonValue = query.get('common_only');
    if (commonValue !== null && commonValue !== 'true' && commonValue !== 'false') {
      throw new HttpError(400, 'common_only must be true or false.');
    }
    const limitValue = query.get('limit');
    const limit = limitValue === null ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError(400, 'limit must be between 1 and 100.');
    }
    const incidents = await DatabaseService.listIncidents({
      category, incidentType, tag, commonOnly: commonValue === 'true', limit,
    });
    return NextResponse.json({
      incidents: incidents.map(incident => ({
        id: incident.id,
        category: incident.category,
        incident_type: incident.incident_type,
        short_label: incident.short_label,
        latitude: incident.latitude,
        longitude: incident.longitude,
        location_address: incident.location_address,
        status: incident.status,
        severity: incident.severity,
        credibility_score: incident.credibility_score,
        evidence_count: incident.evidence_count,
        highest_seriousness: incident.highest_seriousness,
        average_ai_confidence: incident.average_ai_confidence,
        tags: incident.tags,
        baltimore_service_candidates: incident.baltimore_service_candidates,
        routing_disposition: incident.routing_disposition,
        created_at: incident.created_at,
        updated_at: incident.updated_at,
        last_reported_at: incident.last_reported_at,
        is_super_report: incident.evidence_count >= 2,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof HttpError;
    return NextResponse.json(
      { error: known ? error.message : 'Incident data is temporarily unavailable.' },
      { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
