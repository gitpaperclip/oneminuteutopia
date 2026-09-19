/**
 * Prepared Report Contract (Frozen)
 *
 * This module defines the shared types for the prepared-report workflow.
 * It is the contract between:
 *   - Phase 1 image analysis (existing)
 *   - Baltimore 311 preparation logic (Agent B, to be implemented)
 *   - Review and submission UI (existing)
 *
 * Do NOT modify these types without coordinating across all agents (A/B/C/D/E).
 */

/**
 * Readiness state for a prepared report.
 *
 * Determines whether the report can be submitted immediately,
 * requires additional user input, or cannot be submitted at all.
 */
export type PreparedReportReadiness =
  /**
   * Report is complete and ready for immediate 311 submission.
   *
   * All required fields are present:
   *   - Valid location (GPS or manual address)
   *   - Matched to a single 311 service
   *   - No emergency condition detected
   *   - No sensitive content requiring review
   */
  | 'ready'

  /**
   * User must choose from multiple eligible 311 services.
   *
   * Example: A sidewalk issue could be DPW (broken sidewalk) or
   * BCDOT (ADA curb ramp). Present service options and descriptions.
   */
  | 'choose_service'

  /**
   * GPS location is unavailable or denied; user must enter address.
   *
   * This is distinct from "no matching service" — the issue category
   * is known, but geolocation is required to route it correctly.
   */
  | 'needs_location'

  /**
   * Human review required before routing.
   *
   * Triggers:
   *   - Low AI confidence (<40%) on a serious issue (seriousness >= 7)
   *   - Sensitive content detected (faces, license plates, interior home)
   *   - Ambiguous jurisdiction (city/state/utility boundary)
   *   - Housing or health complaint (may require privacy protection)
   *
   * Action: Show user a "Submit for review" button; do NOT auto-route.
   */
  | 'manual_review'

  /**
   * Immediate danger detected; direct user to call 911.
   *
   * Triggers:
   *   - Category: fire_injury_or_immediate_threat
   *   - Seriousness: 9-10
   *   - AI flags: active fire, smoke, explosion, person in danger, violence,
   *     serious injury, gas odor, downed energized wire, live traffic hazard
   *
   * Action:
   *   - Display 911 call prompt ONLY (no 311 option, no continue URL)
   *   - Save report as manual_review disposition
   *   - Do NOT claim "submitted" to any government system
   *
   * Note: This is a safety guardrail, not a dispatch system.
   */
  | 'emergency'

  /**
   * Not a reportable civic issue.
   *
   * Examples:
   *   - No visible hazard (category: no_visible_hazard)
   *   - Private property maintenance (not city jurisdiction)
   *   - Already resolved
   *   - Duplicate of user's own recent report
   *   - Unable to assess and user declined manual category
   *
   * Action: Thank user, offer to start new report, do NOT submit to 311.
   */
  | 'not_reportable';

/**
 * Prepared report payload for Baltimore 311 routing.
 *
 * This is the output of the (to-be-implemented) prepare-311 logic.
 */
export interface PreparedReport {
  /**
   * Unique ID of the saved image analysis.
   *
   * This links to `public.image_analyses.id` (uuid).
   */
  analysis_id: string;

  /**
   * Readiness state. See PreparedReportReadiness for semantics.
   */
  readiness: PreparedReportReadiness;

  /**
   * User-facing explanation for the readiness state.
   *
   * Examples:
   *   - ready: "This report is ready to submit to Baltimore DPW."
   *   - choose_service: "This could be a DPW or BCDOT issue. Which applies?"
   *   - needs_location: "Location is required to route this report."
   *   - manual_review: "This report will be reviewed before routing."
   *   - emergency: "Call 911 immediately. Do not wait."
   *   - not_reportable: "This does not appear to be a city service issue."
   */
  readiness_message: string;

  /**
   * Matched Baltimore 311 service code (if readiness is 'ready').
   *
   * This is the service request type that will be submitted.
   * Null if readiness is not 'ready'.
   *
   * Examples: 'SW_POTHOLE', 'SW_STREETLIGHT_OUT', 'SW_MISSEDTRASH'
   * (Actual codes TBD by Agent B based on Baltimore 311 API/catalog)
   */
  service_code: string | null;

  /**
   * Array of eligible services (if readiness is 'choose_service').
   *
   * Null for all other readiness states.
   */
  service_options: PreparedReportServiceOption[] | null;

  /**
   * Routing jurisdiction: who owns this issue?
   *
   * - 'city': Baltimore City department (most common)
   * - 'state': Maryland state agency (e.g., SHA for state highway)
   * - 'utility': BGE, water utility, etc.
   * - 'regional': MTA, regional authority
   * - 'federal': Federal property (rare)
   * - 'unknown': Cannot determine jurisdiction
   */
  jurisdiction: 'city' | 'state' | 'utility' | 'regional' | 'federal' | 'unknown';

  /**
   * Human-readable owner name.
   *
   * Examples: "Baltimore Department of Public Works", "Maryland SHA",
   * "Baltimore Gas & Electric"
   */
  owner: string | null;

  /**
   * External intake URL for this issue type.
   *
   * - For 'ready' and 'choose_service': Baltimore 311 portal URL
   * - For 'emergency': null (user must call 911, no web form)
   * - For 'manual_review': null (review first)
   * - For 'not_reportable': null
   */
  intake_url: string | null;

  /**
   * Phone number for manual reporting (if applicable).
   *
   * Examples: "311", "410-396-3310", "911"
   */
  phone: string | null;

  /**
   * Date this routing information was last verified (ISO 8601).
   *
   * Used to flag stale mappings. Agent B should populate this.
   */
  last_verified: string | null;

  /**
   * Source documentation URL for this routing decision.
   *
   * Links back to Baltimore 311, agency websites, or catalog docs.
   */
  source_url: string | null;
}

/**
 * A single service option for 'choose_service' readiness.
 */
export interface PreparedReportServiceOption {
  /**
   * Service code (see PreparedReport.service_code).
   */
  service_code: string;

  /**
   * User-facing service name.
   *
   * Example: "Pothole Repair"
   */
  service_name: string;

  /**
   * Short description to help user choose.
   *
   * Example: "For potholes or damaged road surface in the travel lane."
   */
  description: string;

  /**
   * Owning department/agency.
   *
   * Example: "Department of Transportation"
   */
  owner: string;

  /**
   * Estimated response time (optional, human-readable).
   *
   * Example: "3-5 business days"
   */
  response_time: string | null;
}

/**
 * Contract notes for Agent B (prepare-311 implementation):
 *
 * 1. Read `docs/baltimore-reporting-catalog.md` for routing rules.
 * 2. Map existing `category` (from image analysis) to Baltimore subcategories.
 * 3. Apply emergency guardrails (seriousness 9-10 → 'emergency' readiness).
 * 4. Return 'needs_location' if lat/lon are null and location is required.
 * 5. Return 'choose_service' if multiple services match (e.g., sidewalk could be DPW or BCDOT).
 * 6. Return 'manual_review' if:
 *    - AI confidence < 40% and seriousness >= 7
 *    - Housing, health, or sensitive content
 *    - Jurisdiction is ambiguous (city/state boundary)
 * 7. Return 'not_reportable' if category is 'no_visible_hazard' or private property.
 * 8. Do NOT call live Baltimore 311 API (per hard stop).
 * 9. Generate preview/form data only; user must confirm before opening intake_url.
 * 10. Never claim "submitted" unless Baltimore 311 returns a CSR/case number.
 */
