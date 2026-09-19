import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { DatabaseService, type Incident } from '@/lib/db';
import { CONTEXT_TAGS, INCIDENT_TYPES } from '@/lib/incident-taxonomy.mjs';
import { HttpError } from '@/lib/hazard-analysis.mjs';
import { displayMockReference, parseMockReference } from '@/lib/mock-agency';
import { GOVERNMENT_REPORT_THRESHOLD } from '@/lib/incident-scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function optionalPreset(value: string | null, allowed: readonly string[], label: string): string | undefined {
  if (!value) return undefined;
  if (!allowed.includes(value)) throw new HttpError(400, `Unknown ${label} filter.`);
  return value;
}

function publicIncident(incident: Incident) {
  return {
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
    cluster_radius_m: incident.cluster_radius_m,
    is_super_report: incident.evidence_count >= 2,
    mock_reference_id: displayMockReference(incident.mock_reference_id),
    mock_submitted_at: incident.mock_submitted_at,
    mock_status: incident.mock_status ?? 'pending',
    mock_error: incident.mock_error,
    mock_agency: incident.mock_agency
      ?? parseMockReference(incident.mock_reference_id).agency,
    incident_score: incident.incident_score ?? 0,
    report_count: incident.report_count ?? incident.evidence_count,
    government_report_status: incident.government_report_status ?? 'not_ready',
    ready_for_government: (incident.incident_score ?? 0) >= GOVERNMENT_REPORT_THRESHOLD
      || incident.government_report_status === 'ready_to_submit',
  };
}

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams;
    
    // Check if requesting a specific incident with its reports
    const incidentId = query.get('id');
    if (incidentId) {
      const incident = await DatabaseService.getIncident(incidentId);
      if (!incident) {
        return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
      }
      const reports = await DatabaseService.getIncidentReports(incidentId);
      return NextResponse.json(
        { 
          incident: publicIncident(incident),
          reports: reports.map(report => ({
            id: report.id,
            incident_id: report.incident_id,
            image_path: report.image_path,
            category: report.category,
            incident_type: report.incident_type,
            short_label: report.short_label,
            user_description: report.user_description,
            latitude: report.latitude,
            longitude: report.longitude,
            location_address: report.location_address,
            ai_confidence: report.ai_confidence,
            seriousness: report.seriousness,
            case_score: report.case_score,
            analysis_status: report.analysis_status,
            tags: report.tags,
            baltimore_service_candidates: report.baltimore_service_candidates,
            routing_disposition: report.routing_disposition,
            created_at: report.created_at,
          })),
          evidence_count: reports.length
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    
    // Otherwise, list incidents with filters
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
      incidents: incidents.map(incident => publicIncident(incident)),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof HttpError;
    return NextResponse.json(
      { error: known ? error.message : 'Incident data is temporarily unavailable.' },
      { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
