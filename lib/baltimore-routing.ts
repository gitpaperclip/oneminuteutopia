import 'server-only';
import type { Report } from './db.ts';
import { CATEGORY_LABELS } from './analysis-labels.ts';

export interface PreparedReport {
  report_id: string;
  readiness: 'ready' | 'emergency_first' | 'needs_review' | 'insufficient_data';
  routing_disposition: '311' | '911' | 'multiple_candidates' | 'no_route';
  department: string | null;
  service_type: string | null;
  alternative_service_types: string[];
  prepared_fields: {
    category: string;
    category_label: string;
    description: string | null;
    location_address: string | null;
    latitude: number | null;
    longitude: number | null;
    seriousness: number | null;
    created_at: number;
  };
  instructions: string | null;
}

interface RoutingRule {
  department: string;
  service_type: string;
  disposition: '311' | '911';
  emergency_threshold?: number;
}

// Baltimore routing catalog based on docs/baltimore-reporting-catalog.md
const ROUTING_CATALOG: Record<string, RoutingRule[]> = {
  roads_and_sidewalks: [
    { department: 'BCDOT', service_type: 'Road or Sidewalk Issue', disposition: '311', emergency_threshold: 8 },
  ],
  traffic_signals_and_streetlights: [
    { department: 'BCDOT', service_type: 'Traffic Signal or Streetlight', disposition: '311', emergency_threshold: 7 },
  ],
  trash_and_sanitation: [
    { department: 'DPW', service_type: 'Illegal Dumping', disposition: '311' },
    { department: 'DPW', service_type: 'Missed Collection', disposition: '311' },
    { department: 'DPW', service_type: 'Dead Animal Removal', disposition: '311' },
  ],
  water_drainage_and_sewage: [
    { department: 'DPW', service_type: 'Water Main Break', disposition: '311', emergency_threshold: 7 },
    { department: 'DPW', service_type: 'Sewer Backup', disposition: '311', emergency_threshold: 8 },
    { department: 'DPW', service_type: 'Storm Drain Obstruction', disposition: '311' },
  ],
  trees_and_public_spaces: [
    { department: 'Recreation and Parks', service_type: 'Fallen Tree', disposition: '311', emergency_threshold: 8 },
    { department: 'Recreation and Parks', service_type: 'Park Equipment Damage', disposition: '311' },
    { department: 'BCDOT', service_type: 'Tree in Right-of-Way', disposition: '311', emergency_threshold: 8 },
  ],
  buildings_and_construction: [
    { department: 'DHCD', service_type: 'Unsafe Building', disposition: '311', emergency_threshold: 8 },
    { department: 'DHCD', service_type: 'Code Violation', disposition: '311' },
    { department: 'DHCD', service_type: 'Vacant Building', disposition: '311' },
  ],
  electricity_and_gas: [
    { department: 'BGE', service_type: 'Gas Odor', disposition: '911' },
    { department: 'BGE', service_type: 'Downed Power Line', disposition: '911' },
    { department: 'BGE', service_type: 'Power Outage', disposition: '311' },
  ],
  animals: [
    { department: 'Animal Care and Control', service_type: 'Stray Animal', disposition: '311' },
    { department: 'Animal Care and Control', service_type: 'Animal Cruelty', disposition: '311' },
    { department: 'Animal Care and Control', service_type: 'Aggressive Animal', disposition: '311', emergency_threshold: 8 },
  ],
  fire_injury_or_immediate_threat: [
    { department: 'BCFD', service_type: 'Fire', disposition: '911' },
    { department: 'BPD', service_type: 'Crime in Progress', disposition: '911' },
    { department: 'BCFD', service_type: 'Medical Emergency', disposition: '911' },
  ],
  other_hazard: [
    { department: '311', service_type: 'General Hazard', disposition: '311' },
  ],
};

export class BaltimoreRoutingService {
  /**
   * Prepare a Baltimore 311 packet from a stored report.
   * Derives routing from trusted stored analysis, not browser-supplied AI fields.
   */
  static prepareReport(report: Report): PreparedReport {
    const rules = ROUTING_CATALOG[report.category] || [];
    
    if (rules.length === 0) {
      return this.createPreparedReport(report, {
        readiness: 'insufficient_data',
        routing_disposition: 'no_route',
        department: null,
        service_type: null,
        alternative_service_types: [],
        instructions: 'This issue type does not have a defined routing path. Contact Baltimore 311 directly for assistance.',
      });
    }

    // Check for emergency conditions
    const seriousness = report.seriousness ?? 0;
    const emergencyRule = rules.find(rule => 
      rule.disposition === '911' || 
      (rule.emergency_threshold !== undefined && seriousness >= rule.emergency_threshold)
    );

    if (emergencyRule) {
      return this.createPreparedReport(report, {
        readiness: 'emergency_first',
        routing_disposition: '911',
        department: emergencyRule.department,
        service_type: emergencyRule.service_type,
        alternative_service_types: [],
        instructions: 'This appears to be an emergency situation. Call 911 immediately. Do not use Baltimore 311 for emergencies.',
      });
    }

    // Multiple candidates require review
    if (rules.length > 1) {
      return this.createPreparedReport(report, {
        readiness: 'needs_review',
        routing_disposition: 'multiple_candidates',
        department: null,
        service_type: null,
        alternative_service_types: rules.map(r => r.service_type),
        instructions: 'Multiple service types match this issue. Please review and select the most appropriate option before submitting to Baltimore 311.',
      });
    }

    // Single clear route
    const primaryRule = rules[0];
    return this.createPreparedReport(report, {
      readiness: 'ready',
      routing_disposition: '311',
      department: primaryRule.department,
      service_type: primaryRule.service_type,
      alternative_service_types: [],
      instructions: null,
    });
  }

  private static createPreparedReport(
    report: Report,
    routing: {
      readiness: PreparedReport['readiness'];
      routing_disposition: PreparedReport['routing_disposition'];
      department: string | null;
      service_type: string | null;
      alternative_service_types: string[];
      instructions: string | null;
    }
  ): PreparedReport {
    return {
      report_id: report.id,
      readiness: routing.readiness,
      routing_disposition: routing.routing_disposition,
      department: routing.department,
      service_type: routing.service_type,
      alternative_service_types: routing.alternative_service_types,
      prepared_fields: {
        category: report.category,
        category_label: CATEGORY_LABELS[report.category] || report.category,
        description: report.user_description,
        location_address: report.location_address,
        latitude: report.latitude,
        longitude: report.longitude,
        seriousness: report.seriousness,
        created_at: report.created_at,
      },
      instructions: routing.instructions,
    };
  }
}
