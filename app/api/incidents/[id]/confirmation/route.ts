import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/db';
import { HttpError } from '@/lib/hazard-analysis.mjs';
import { confirmationsUnavailableMessage, isMissingConfirmationsSchema } from '@/lib/confirmation-schema';
import { checkRequestOrigin } from '@/lib/request-body';
import { SessionService } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INCIDENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

async function readIncidentId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!INCIDENT_ID.test(id)) throw new HttpError(404, 'Incident not found');
  return id;
}

function jsonError(error: unknown, fallback: string) {
  if (isMissingConfirmationsSchema(error)) {
    return NextResponse.json(
      { error: confirmationsUnavailableMessage() },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const known = error instanceof HttpError;
  return NextResponse.json(
    { error: known ? error.message : fallback },
    { status: known ? error.status : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const incidentId = await readIncidentId(params);
    const sessionId = await SessionService.getSession();
    const state = await DatabaseService.getIncidentConfirmation(incidentId, sessionId);
    if (!state) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error, 'Confirmation data is temporarily unavailable.');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkRequestOrigin(req);
    const incidentId = await readIncidentId(params);
    const sessionId = await SessionService.getOrCreateSession();
    await SessionService.setSessionCookie(sessionId);
    if (!await DatabaseService.checkRateLimit(sessionId, 'confirm', 60)) {
      throw new HttpError(429, 'Too many confirmations. Please try again later.');
    }
    const state = await DatabaseService.confirmIncident(incidentId, sessionId);
    const response = NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
    return SessionService.attachCookie(response, sessionId);
  } catch (error) {
    return jsonError(error, 'Could not save that confirmation.');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkRequestOrigin(req);
    const incidentId = await readIncidentId(params);
    const sessionId = await SessionService.getSession();
    if (!sessionId) throw new HttpError(401, 'No confirmation to remove.');
    const state = await DatabaseService.unconfirmIncident(incidentId, sessionId);
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error, 'Could not remove that confirmation.');
  }
}
