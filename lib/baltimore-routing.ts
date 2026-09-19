import 'server-only';
import type { Report } from './db.ts';
import { CATEGORY_LABELS } from './analysis-labels.ts';

/**
 * Prepared 311 report packet for HUMAN REVIEW ONLY.
 * 
 * This is NOT a submission confirmation. The app prepares this data for the user
 * to review and manually submit to Baltimore 311 themselves. No automated submission occurs.
 */
export interface PreparedReport {
  report_id: string;
  readiness: 'ready' | 'choose_service' | 'needs_location' | 'manual_review' | 'emergency' | 'not_reportable';
  routing_disposition: '311' | 'manual_review' | 'emergency' | 'no_submission';
  department: string | null;
  service_type: string | null;
  alternative_service_types: string[];
  prepared_fields: {
    description: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    photo_url: string;
    category: string;
    category_label: string;
    incident_type: string | null;
    context_summary: string | null;
    seriousness: number | null;
    created_at: number;
  };
  user_action: {
    label: string;
    url: string | null;
  } | null;
  disclaimer: string;
}

export class BaltimoreRoutingService {
  /**
   * Prepare a Baltimore 311 packet for HUMAN REVIEW ONLY.
   * 
   * CRITICAL: This does NOT submit to Baltimore 311. It prepares data for the user
   * to review and manually submit themselves. No 311 API calls, no Open311, no city portal automation.
   * 
   * Derives routing from trusted stored analysis fields, not browser-supplied AI fields.
   */
  static prepareReport(report: Report): PreparedReport {
    const disposition = report.routing_disposition as '311' | 'manual_review' | 'emergency' | 'no_submission';
    const serviceCandidates = report.baltimore_service_candidates;
    
    // Check for location data
    const hasLocation = (report.latitude !== null && report.longitude !== null) || report.location_address !== null;
    
    let readiness: PreparedReport['readiness'];
    let serviceType: string | null = null;
    let alternativeServices: string[] = [];
    let userAction: PreparedReport['user_action'] = null;

    switch (disposition) {
      case 'emergency':
        readiness = 'emergency';
        userAction = {
          label: 'Call 911 immediately',
          url: null,
        };
        break;
      case '311':
        if (!hasLocation) {
          readiness = 'needs_location';
        } else if (serviceCandidates.length === 0) {
          readiness = 'manual_review';
        } else if (serviceCandidates.length === 1) {
          readiness = 'ready';
          serviceType = serviceCandidates[0];
          userAction = {
            label: 'Continue in Baltimore 311',
            url: 'https://balt311.baltimorecity.gov/citizen/s/',
          };
        } else {
          readiness = 'choose_service';
          serviceType = serviceCandidates[0]; // First as primary recommendation
          alternativeServices = serviceCandidates.slice(1);
          userAction = {
            label: 'Continue in Baltimore 311',
            url: 'https://balt311.baltimorecity.gov/citizen/s/',
          };
        }
        break;
      case 'manual_review':
        readiness = 'manual_review';
        if (serviceCandidates.length > 0) {
          serviceType = serviceCandidates[0];
          alternativeServices = serviceCandidates.slice(1);
        }
        break;
      case 'no_submission':
        readiness = 'not_reportable';
        break;
      default:
        readiness = 'manual_review';
    }

    // Department extraction (not in stored data, would need mapping)
    const department = null; // Baltimore catalog does not provide department mapping

    return {
      report_id: report.id,
      readiness,
      routing_disposition: disposition,
      department,
      service_type: serviceType,
      alternative_service_types: alternativeServices,
      prepared_fields: {
        description: report.user_description,
        location: report.location_address,
        latitude: report.latitude,
        longitude: report.longitude,
        photo_url: report.image_path,
        category: report.category,
        category_label: CATEGORY_LABELS[report.category] || report.category,
        incident_type: report.incident_type,
        context_summary: report.context_summary,
        seriousness: report.seriousness,
        created_at: report.created_at,
      },
      user_action: userAction,
      disclaimer: 'Prepared by One Minute Utopia. Review and submit through Baltimore 311.',
    };
  }
}
