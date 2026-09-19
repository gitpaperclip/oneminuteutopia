import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';
import { normalizeImage, MAX_UPLOAD_BYTES } from '@/lib/image-processing';
import { prepareReport } from '@/lib/report-pipeline';
import { checkRequestOrigin, readLimitedBody } from '@/lib/request-body';
import { HttpError } from '@/lib/hazard-analysis.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  try {
    checkRequestOrigin(req);
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data;')) throw new HttpError(415, 'Upload a photo using the image form.');
    const bytes = await readLimitedBody(req, MAX_UPLOAD_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); }
    catch { throw new HttpError(400, 'The photo upload could not be read. Please retry.'); }
    const file = form.get('image');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a photo to continue.');
    const buffer = await normalizeImage(Buffer.from(await file.arrayBuffer()));
    const sessionId = await SessionService.getOrCreateSession();
    await SessionService.setSessionCookie(sessionId);
    if (!await DatabaseService.checkRateLimit(sessionId, 'upload', 10)) throw new HttpError(429, 'Upload limit reached. Please try again in an hour.');
    const result = await prepareReport(buffer, sessionId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': `prepare;dur=${result.processing_ms}` } });
  } catch (error) {
    const known = error instanceof HttpError;
    return NextResponse.json({ error: known ? error.message : 'The photo could not be saved. Please retry shortly.' }, { status: known ? error.status : 503 });
  }
}
