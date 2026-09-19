import 'server-only';
import type { Report } from './db.ts';
import { CATEGORY_LABELS } from './analysis-labels.ts';

export interface PreparedReport {
  report_id: string;
  readiness: 'ready' | 'emergency_first' | 'needs_review' | 'insufficient_data';
  routing_disposition: '311' | 'manual_review' | 'emergency' | 'no_submission';
  service_request_types: string[];
  prepared_fields: {
    category: string;
    category_label: string;
    incident_type: string | null;
    context_summary: string | null;
    description: string | null;
    location_address: string | null;
    latitude: number | null;
    longitude: number | null;
    seriousness: number | null;
    created_at: number;
  };
  instructions: string | null;
}

export class BaltimoreRoutingService {
  /**
   * Prepare a Baltimore 311 packet from a stored report.
   * Derives routing from trusted stored analysis fields, not browser-supplied AI fields.
   */
  static prepareReport(report: Report): PreparedReport {
    const disposition = report.routing_disposition as '311' | 'manual_review' | 'emergency' | 'no_submission';
    const serviceCandidates = report.baltimore_service_candidates;
    
    let readiness: PreparedReport['readiness'];
    let instructions: string | null = null;

    switch (disposition) {
      case 'emergency':
        readiness = 'emergency_first';
        instructions = 'This appears to be an emergency situation. Call 911 immediately. Do not use Baltimore 311 for emergencies.';
        break;
      case '311':
        readiness = serviceCandidates.length > 0 ? 'ready' : 'needs_review';
        if (serviceCandidates.length === 0) {
          instructions = 'No specific service request types were identified. Contact Baltimore 311 directly for assistance.';
        }
        break;
      case 'manual_review':
        readiness = 'needs_review';
        instructions = serviceCandidates.length > 1
          ? 'Multiple service types match this issue. Please review and select the most appropriate option before submitting to Baltimore 311.'
          : 'This report requires review before submission to Baltimore 311.';
        break;
      case 'no_submission':
        readiness = 'insufficient_data';
        instructions = 'This issue type is not suitable for 311 submission. Contact Baltimore 311 directly if assistance is needed.';
        break;
      default:
        readiness = 'needs_review';
        instructions = 'Unable to determine appropriate routing. Contact Baltimore 311 directly for assistance.';
    }

    return {
      report_id: report.id,
      readiness,
      routing_disposition: disposition,
      service_request_types: serviceCandidates,
      prepared_fields: {
        category: report.category,
        category_label: CATEGORY_LABELS[report.category] || report.category,
        incident_type: report.incident_type,
        context_summary: report.context_summary,
        description: report.user_description,
        location_address: report.location_address,
        latitude: report.latitude,
        longitude: report.longitude,
        seriousness: report.seriousness,
        created_at: report.created_at,
      },
      instructions,
    };
  }
}
