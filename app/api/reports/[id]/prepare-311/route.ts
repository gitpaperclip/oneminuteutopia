import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';
import { BaltimoreRoutingService } from '@/lib/baltimore-routing';
import { HttpError } from '@/lib/hazard-analysis.mjs';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

    // Load the report
    const report = await DatabaseService.getReport(id);
    if (!report) {
      throw new HttpError(404, 'Report not found.');
    }

    // Verify ownership
    if (report.session_id !== sessionId) {
      throw new HttpError(403, 'Access denied. This report belongs to a different session.');
    }

    // Check if report is withdrawn
    if (report.withdrawn !== 0) {
      throw new HttpError(410, 'This report has been withdrawn.');
    }

    // Prepare the 311 packet
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
