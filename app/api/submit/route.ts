import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';
import { nanoid } from 'nanoid';

// Rate limiting for submissions
const submitRateLimit = new Map<string, { count: number; resetTime: number }>();
const MAX_SUBMISSIONS_PER_HOUR = 20;

function checkSubmitRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const record = submitRateLimit.get(sessionId);

  if (!record || now > record.resetTime) {
    submitRateLimit.set(sessionId, {
      count: 1,
      resetTime: now + 60 * 60 * 1000,
    });
    return true;
  }

  if (record.count >= MAX_SUBMISSIONS_PER_HOUR) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const sessionId = await SessionService.getSession();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 401 }
      );
    }

    // Rate limiting
    if (!checkSubmitRateLimit(sessionId)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please wait before submitting again.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const {
      image_path,
      image_hash,
      category,
      short_label,
      full_description,
      user_description,
      latitude,
      longitude,
      location_accuracy,
      location_source,
      location_address,
      ai_confidence,
      ai_model,
      ai_routing,
      user_corrected,
      idempotency_key,
    } = body;

    // Validate required fields
    if (!image_path || !image_hash || !category || !short_label) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check for duplicate submission (idempotency)
    if (idempotency_key) {
      const existing = DatabaseService.getReportByIdempotencyKey(idempotency_key);
      if (existing) {
        const incident = DatabaseService.getIncident(existing.incident_id!);
        return NextResponse.json({
          success: true,
          report_id: existing.id,
          incident_id: existing.incident_id,
          incident,
          duplicate: true,
        });
      }
    }

    // Create incident
    const incidentId = DatabaseService.createIncident({
      category,
      short_label,
      full_description,
      latitude,
      longitude,
      location_address,
    });

    // Create report
    const reportId = DatabaseService.createReport({
      session_id: sessionId,
      incident_id: incidentId,
      image_path,
      image_hash,
      category,
      short_label,
      full_description,
      user_description,
      latitude,
      longitude,
      location_accuracy,
      location_source,
      location_address,
      ai_confidence,
      ai_model,
      ai_routing,
      user_corrected: user_corrected ? 1 : 0,
      idempotency_key: idempotency_key || nanoid(),
    });

    const incident = DatabaseService.getIncident(incidentId);

    return NextResponse.json({
      success: true,
      report_id: reportId,
      incident_id: incidentId,
      incident,
    });
  } catch (error) {
    console.error('Submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }
}
