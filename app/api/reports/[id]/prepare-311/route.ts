import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';
import { BaltimoreRoutingService } from '@/lib/baltimore-routing';
import { HttpError } from '@/lib/hazard-analysis.mjs';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/reports/{id}/prepare-311
 * 
 * Prepares a Baltimore 311 packet for HUMAN REVIEW AND MANUAL SUBMISSION ONLY.
 * 
 * CRITICAL: This endpoint does NOT submit to Baltimore 311. It does NOT call any
 * 311 API, Open311 service, or city portal. It ONLY prepares data for the user
 * to review and manually submit themselves. The response is for user review, not
 * a submission confirmation.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Validate report ID format
    if (!/^[A-Za-z0-9_-]{21}$/.test(id)) {
      throw new HttpError(400, 'Invalid report ID format.');
    }

    // Get and validate session
    const sessionId = await SessionService.getSession();
    if (!sessionId) {
      throw new HttpError(401, 'Session expired. Please log in again.');
    }

    // Load the report (withdrawn reports are filtered by getReport)
    const report = await DatabaseService.getReport(id);
    if (!report) {
      throw new HttpError(404, 'Report not found.');
    }

    // Verify ownership - return 404 to avoid leaking report existence
    if (report.session_id !== sessionId) {
      throw new HttpError(404, 'Report not found.');
    }

    // Prepare the 311 packet for human review (does NOT submit)
    const preparedReport = BaltimoreRoutingService.prepareReport(report);

    return NextResponse.json(preparedReport, {
      headers: { 'Cache-Control': 'private, max-age=300' }, // Cache for 5 minutes
    });
  } catch (error) {
    const known = error instanceof HttpError;
    return NextResponse.json(
      { error: known ? error.message : 'Unable to prepare report. Please try again.' },
      { status: known ? error.status : 503 }
    );
  }
}
