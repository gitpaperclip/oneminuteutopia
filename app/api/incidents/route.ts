import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { DatabaseService } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const isOrganizer = await SessionService.isOrganizer();

    if (!isOrganizer) {
      return NextResponse.json(
        { error: 'Unauthorized. Organizer access required.' },
        { status: 403 }
      );
    }

    const incidents = DatabaseService.getAllIncidents();
    
    // Get reports for each incident
    const incidentsWithReports = incidents.map(incident => {
      const reports = DatabaseService.getReportsForIncident(incident.id);
      return {
        ...incident,
        reports,
      };
    });

    return NextResponse.json({
      incidents: incidentsWithReports,
    });
  } catch (error) {
    console.error('Incidents fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents' },
      { status: 500 }
    );
  }
}
