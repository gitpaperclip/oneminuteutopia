import { NextRequest, NextResponse } from 'next/server';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { DatabaseService } from '@/lib/db';
import { CONTEXT_TAGS, INCIDENT_TYPES } from '@/lib/incident-taxonomy.mjs';
import { HttpError } from '@/lib/hazard-analysis.mjs';
import {
  parseBboxQuery, parseBooleanQuery, parseLimitQuery,
  toMapIncident, toPublicIncidentReports, type MapIncidentsResponse,
} from '@/lib/map-incident-types';

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
    const incidentId = query.get('id');
    if (incidentId) {
      const incident = await DatabaseService.getIncident(incidentId);
      if (!incident) {
        return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
      }
      const reports = await DatabaseService.getIncidentReports(incidentId);
      return NextResponse.json(
        {
          incident: toMapIncident(incident),
          reports: toPublicIncidentReports(reports),
          evidence_count: reports.length,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const category = optionalPreset(query.get('category'), Object.keys(CATEGORY_LABELS), 'category');
    const incidentType = optionalPreset(query.get('incident_type'), INCIDENT_TYPES, 'incident type');
    const tag = optionalPreset(query.get('tag'), [...INCIDENT_TYPES, ...CONTEXT_TAGS], 'tag');
    const commonOnly = parseBooleanQuery(query.get('common_only'), 'common_only');
    const includeUnlocated = parseBooleanQuery(query.get('include_unlocated'), 'include_unlocated');
    const bbox = parseBboxQuery(query);
    const limit = parseLimitQuery(query.get('limit'));
    const incidents = await DatabaseService.listIncidents({
      category, incidentType, tag, commonOnly, includeUnlocated, limit, ...bbox,
    });
    const body: MapIncidentsResponse = { incidents: incidents.map(toMapIncident) };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof HttpError;
    return NextResponse.json(
      { error: known ? error.message : 'Incident data is temporarily unavailable.' },
      { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
