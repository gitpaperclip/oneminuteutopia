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
 *
 * IMPORTANT: This app NEVER calls live Baltimore 311 APIs. All 311 integration
 * is prepare-only (packet generation, form preview, link generation). Users must
 * manually confirm and submit through the city's portal. Never claim "submitted"
 * to any government system.
 */

/**
 * Readiness state for a prepared report.
 *
 * Determines whether the report packet can be prepared for human portal handoff,
 * requires additional user input, or cannot be prepared at all.
 */
export type PreparedReportReadiness =
  /**
   * Report packet is complete and ready for human portal handoff.
   *
   * All required fields are present:
   *   - Valid location (GPS or manual address)
   *   - Matched to a single 311 service
   *   - No emergency condition detected
   *   - No sensitive content requiring review
   *
   * Action: Display prepared 311 packet with intake_url for user to open
   * the Baltimore 311 portal. User completes submission manually.
   */
  | 'ready'

  /**
   * User must choose from multiple eligible 311 services.
   *
   * Example: A sidewalk issue could be DPW (broken sidewalk) or
   * BCDOT (ADA curb ramp). Present service options and descriptions.
   *
   * Action: Display service_options array; user selects one to prepare packet.
   */
  | 'choose_service'

  /**
   * GPS location is unavailable or denied; user must enter address.
   *
   * This is distinct from "no matching service" — the issue category
   * is known, but geolocation is required to route it correctly.
   *
   * Action: Prompt for manual address entry before preparing packet.
   */
  | 'needs_location'

  /**
   * Human review required before preparing packet.
   *
   * Triggers:
   *   - Low AI confidence (<40%) on a serious issue (seriousness >= 7)
   *   - Sensitive content detected (faces, license plates, interior home)
   *   - Ambiguous jurisdiction (city/state/utility boundary)
   *   - Housing or health complaint (may require privacy protection)
   *
   * Action: Show "Submit for review" button. Staff reviews before generating
   * a portal handoff packet. Do NOT prepare 311 packet automatically.
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
   *   - Display 911 call prompt ONLY (no 311 option, no continue URL, no intake_url)
   *   - Save report for internal record
   *   - Do NOT prepare 311 packet
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
   * Action: Thank user, offer to start new report. Do NOT prepare 311 packet.
   */
  | 'not_reportable';

/**
 * Prepared report payload for Baltimore 311 routing.
 *
 * This is the output of the (to-be-implemented) prepare-311 logic.
 * It generates a prepare-only packet for human portal handoff — the app
 * NEVER calls city APIs or claims "submitted."
 */
export interface PreparedReport {
  /**
   * Session-owned report ID from public.reports.id.
   *
   * This is the user's submitted report (after they confirmed category + location).
   * The prepare-311 endpoint keys on this report_id, NOT analysis_id.
   *
   * Mapping: report.idempotency_key = image_analyses.id (uuid), so the prepare
   * endpoint can load the analysis via the report's idempotency_key if needed.
   */
  report_id: string;

  /**
   * Readiness state. See PreparedReportReadiness for semantics.
   */
  readiness: PreparedReportReadiness;

  /**
   * User-facing explanation for the readiness state.
   *
   * Examples:
   *   - ready: "Your report packet is ready. Open the Baltimore 311 portal to submit."
   *   - choose_service: "This could be a DPW or BCDOT issue. Which applies?"
   *   - needs_location: "Location is required to prepare this report."
   *   - manual_review: "This report will be reviewed before preparing a 311 packet."
   *   - emergency: "Call 911 immediately. Do not wait."
   *   - not_reportable: "This does not appear to be a city service issue."
   */
  readiness_message: string;

  /**
   * Matched Baltimore 311 service code (if readiness is 'ready').
   *
   * This is the service type for the prepared packet.
   * Null if readiness is not 'ready'.
   *
   * Examples: 'SW_POTHOLE', 'SW_STREETLIGHT_OUT', 'SW_MISSEDTRASH'
   * (Actual codes TBD by Agent B based on Baltimore 311 catalog)
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
   * External intake URL for this issue type (for human portal handoff).
   *
   * - For 'ready' and 'choose_service': Baltimore 311 portal URL
   * - For 'emergency': null (user must call 911, no web form)
   * - For 'manual_review': null (review first)
   * - For 'not_reportable': null
   *
   * User clicks this link to open the city portal and manually complete submission.
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

  /**
   * Pre-filled form fields for the 311 portal (DEFERRED to Agent B).
   *
   * When readiness is 'ready', this contains the data the user would copy/paste
   * or that the app could display for them to manually enter in the portal.
   *
   * Structure TBD by Agent B based on actual Baltimore 311 form fields.
   * Examples: service_name, description, address, coordinates, photo_url.
   *
   * Null for non-ready states or if Agent B defers this to a later phase.
   */
  prepared_fields?: Record<string, string | number | null> | null;

  /**
   * Required user action after viewing this prepared report (DEFERRED to Agent B).
   *
   * Examples:
   *   - "Open the Baltimore 311 portal and enter the details shown above."
   *   - "Choose a service type to continue."
   *   - "Enter your location to prepare this report."
   *
   * Null if Agent B does not implement this field yet.
   */
  user_action?: string | null;

  /**
   * Legal disclaimer for this prepared report (DEFERRED to Agent B).
   *
   * Example: "This app does not submit reports to the city. You must complete
   * submission through the Baltimore 311 portal. A link opened is not proof
   * of city acceptance."
   *
   * Null if Agent B does not implement this field yet.
   */
  disclaimer?: string | null;
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
 * 10. NEVER claim "submitted" to any government system. The app only prepares
 *     packets for human portal handoff. A link opened or form displayed is NOT
 *     proof of city acceptance.
 * 11. The prepare-311 endpoint receives `report_id` (from public.reports.id),
 *     NOT `analysis_id`. Load the report row, then join to image_analyses via
 *     reports.idempotency_key = image_analyses.id if AI fields are needed.
 * 12. Optional fields (prepared_fields, user_action, disclaimer) may be deferred
 *     to a later phase. Mark them null if not implementing yet.
 */
