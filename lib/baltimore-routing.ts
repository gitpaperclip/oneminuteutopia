import 'server-only';
import type { Report } from './db.ts';
import { CATEGORY_LABELS } from './analysis-labels.ts';
import type { PreparedReport, PreparedReportServiceOption } from './prepared-report-types.ts';

export class BaltimoreRoutingService {
  /**
   * Prepare a Baltimore 311 packet for HUMAN REVIEW ONLY.
   * 
   * CRITICAL: This does NOT submit to Baltimore 311. It prepares data for the user
   * to review and manually submit themselves. No 311 API calls, no Open311, no city portal automation.
   * 
   * Derives routing from trusted stored analysis fields, not browser-supplied AI fields.
   * Implements the frozen contract from lib/prepared-report-types.ts.
   */
  static prepareReport(report: Report): PreparedReport {
    const disposition = report.routing_disposition as '311' | 'manual_review' | 'emergency' | 'no_submission';
    const serviceCandidates = report.baltimore_service_candidates;
    
    // Check for location data
    const hasLocation = (report.latitude !== null && report.longitude !== null) || report.location_address !== null;
    
    let readiness: PreparedReport['readiness'];
    let readinessMessage: string;
    let serviceCode: string | null = null;
    let serviceOptions: PreparedReportServiceOption[] | null = null;
    let intakeUrl: string | null = null;
    let phone: string | null = null;

    switch (disposition) {
      case 'emergency':
        readiness = 'emergency';
        readinessMessage = 'Call 911 immediately. Do not wait.';
        phone = '911';
        break;
      case '311':
        if (!hasLocation) {
          readiness = 'needs_location';
          readinessMessage = 'Location is required to prepare this report.';
        } else if (serviceCandidates.length === 0) {
          readiness = 'manual_review';
          readinessMessage = 'This report will be reviewed before preparing a 311 packet.';
        } else if (serviceCandidates.length === 1) {
          readiness = 'ready';
          readinessMessage = 'Your report packet is ready. Open the Baltimore 311 portal to submit.';
          serviceCode = serviceCandidates[0];
          intakeUrl = 'https://balt311.baltimorecity.gov/citizen/s/';
          phone = '311';
        } else {
          readiness = 'choose_service';
          readinessMessage = 'Multiple services match this issue. Which applies?';
          serviceOptions = serviceCandidates.map(code => ({
            service_code: code,
            service_name: this.getServiceName(code),
            description: `Service type: ${code}`,
            owner: 'Baltimore City',
            response_time: null,
          }));
          intakeUrl = 'https://balt311.baltimorecity.gov/citizen/s/';
          phone = '311';
        }
        break;
      case 'manual_review':
        readiness = 'manual_review';
        readinessMessage = 'This report will be reviewed before preparing a 311 packet.';
        break;
      case 'no_submission':
        readiness = 'not_reportable';
        readinessMessage = 'This does not appear to be a city service issue.';
        break;
      default:
        readiness = 'manual_review';
        readinessMessage = 'This report requires review.';
    }

    return {
      report_id: report.id,
      readiness,
      readiness_message: readinessMessage,
      service_code: serviceCode,
      service_options: serviceOptions,
      jurisdiction: 'city', // Default to city for Baltimore 311 services
      owner: readiness === 'emergency' ? null : 'Baltimore City',
      intake_url: intakeUrl,
      phone,
      last_verified: '2026-09-19', // Current date per workplan
      source_url: 'https://balt311.baltimorecity.gov/',
      prepared_fields: {
        description: report.user_description || '',
        location: report.location_address || '',
        latitude: report.latitude,
        longitude: report.longitude,
        photo_url: report.image_path,
        category: report.category,
        category_label: CATEGORY_LABELS[report.category] || report.category,
        incident_type: report.incident_type || '',
        context_summary: report.context_summary || '',
        seriousness: report.seriousness,
        created_at: report.created_at,
      },
      user_action: readiness === 'ready' 
        ? 'Open the Baltimore 311 portal and enter the details shown above.'
        : null,
      disclaimer: 'This app does not submit reports to the city. You must complete submission through the Baltimore 311 portal. A link opened is not proof of city acceptance.',
    };
  }

  private static getServiceName(code: string): string {
    // Extract readable name from service code
    // TRM-Potholes → Potholes, SW-Illegal Dumping → Illegal Dumping
    return code.replace(/^[A-Z]+-/, '').replace(/-/g, ' ');
  }
}
