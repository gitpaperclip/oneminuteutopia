import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';
import { validateReportInput } from '@/lib/report-input';
import { checkRequestOrigin, readLimitedBody } from '@/lib/request-body';
import { HttpError } from '@/lib/hazard-analysis.mjs';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    checkRequestOrigin(req);
    const bytes = await readLimitedBody(req, 16 * 1024);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new HttpError(400, 'Invalid report format.'); }
    const input = validateReportInput(body);
    const sessionId = await SessionService.getSession();
    if (!sessionId) throw new HttpError(401, 'Session expired. Upload the photo again.');
    if (!await DatabaseService.checkRateLimit(sessionId, 'submit', 60)) throw new HttpError(429, 'Too many submissions. Please try again later.');
    const { report, duplicate, clustered } = await DatabaseService.submitReport(sessionId, input);
    return NextResponse.json({
      success: true, report_id: report.id, incident_id: report.incident_id,
      duplicate, clustered, super_report: clustered,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof HttpError;
    return NextResponse.json({ error: known ? error.message : 'Your report could not be saved. Please retry; your photo is still ready.' }, { status: known ? error.status : 503 });
  }
}
