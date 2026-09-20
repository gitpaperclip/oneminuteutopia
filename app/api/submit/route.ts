import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';
import { validateReportInput } from '@/lib/report-input';
import { checkRequestOrigin, readLimitedBody } from '@/lib/request-body';
import { HttpError } from '@/lib/hazard-analysis.mjs';

export const runtime = 'nodejs';

function safeErrorField(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.slice(0, maxLength);
}

function logUnexpectedSubmitError(error: unknown): void {
  const value = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {};
  console.error('report_submit_failed', JSON.stringify({
    name: error instanceof Error ? error.name : 'UnknownError',
    message: safeErrorField(error instanceof Error ? error.message : undefined),
    code: safeErrorField(value.code, 32),
    schema: safeErrorField(value.schema_name, 64),
    table: safeErrorField(value.table_name, 64),
    column: safeErrorField(value.column_name, 64),
    constraint: safeErrorField(value.constraint_name, 96),
  }));
}

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
    if (!known) logUnexpectedSubmitError(error);
    return NextResponse.json({ error: known ? error.message : 'Your report could not be saved. Please retry; your photo is still ready.' }, { status: known ? error.status : 503 });
  }
}
