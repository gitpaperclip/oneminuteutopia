/**
 * Description builder for Baltimore 311 reports.
 * Pure deterministic text generation from incident data.
 *
 * Constructs structured, readable descriptions for submission to Baltimore 311
 * and other agencies, based on AI analysis and user input.
 */
import { getTaxonomy, getUrgency } from './incident-taxonomy.mjs';

/**
 * Build a structured description for a 311 report.
 * @param {object} params - Report parameters
 * @param {string} params.category - AI category
 * @param {number|null} params.seriousness - AI seriousness score (0-10)
 * @param {number} params.aiConfidence - AI confidence (0-100)
 * @param {string|null} params.subcategory - Baltimore subcategory
 * @param {string|null} params.userDescription - User-provided description
 * @param {string|null} params.locationAddress - Location address
 * @param {string|null} params.locationSource - 'gps' | 'manual' | 'photo'
 * @param {boolean} params.categoryWasCorrected - Whether user corrected AI category
 * @returns {string} Formatted description
 */
export function buildDescription({
  category,
  seriousness = null,
  aiConfidence = 0,
  subcategory = null,
  userDescription = null,
  locationAddress = null,
  locationSource = null,
  categoryWasCorrected = false,
}) {
  const parts = [];

  // Header: What type of issue
  const taxonomy = getTaxonomy(category);
  const categoryLabel = taxonomy?.displayName || category;

  if (subcategory) {
    const subcategoryLabel = subcategory.replace(/_/g, ' ');
    parts.push(`Issue type: ${categoryLabel} - ${subcategoryLabel}`);
  } else {
    parts.push(`Issue type: ${categoryLabel}`);
  }

  // Assessment summary
  if (category !== 'unable_to_assess' && category !== 'no_visible_hazard') {
    const urgency = getUrgency(seriousness);
    if (urgency && urgency !== 'none') {
      const urgencyLabels = {
        emergency: 'Emergency (life-threatening)',
        urgent: 'Urgent (substantial injury potential)',
        routine: 'Routine maintenance',
      };
      parts.push(`Priority: ${urgencyLabels[urgency] || urgency}`);
    }

    // Include seriousness and confidence for transparency
    if (seriousness !== null) {
      parts.push(`AI assessment: seriousness ${seriousness}/10, confidence ${aiConfidence}%`);
    }

    if (categoryWasCorrected) {
      parts.push('(Category corrected by reporter)');
    }
  } else if (category === 'unable_to_assess') {
    parts.push('AI was unable to assess this image');
    parts.push('Category selected manually by reporter');
  }

  // User description
  if (userDescription && userDescription.trim()) {
    parts.push('');
    parts.push('Reporter description:');
    parts.push(userDescription.trim());
  }

  // Location information
  if (locationAddress) {
    parts.push('');
    parts.push(`Location: ${locationAddress}`);
    if (locationSource === 'gps') {
      parts.push('(GPS coordinates provided)');
    } else if (locationSource === 'manual') {
      parts.push('(Address entered manually)');
    }
  }

  // Timestamp
  parts.push('');
  parts.push(`Reported: ${new Date().toISOString().split('T')[0]}`);
  parts.push('Source: One Minute Utopia community reporting app');

  return parts.join('\n');
}

/**
 * Build a short title for a report.
 * @param {object} params - Report parameters
 * @param {string} params.category - AI category
 * @param {string|null} params.subcategory - Baltimore subcategory
 * @param {string|null} params.locationAddress - Location address
 * @returns {string} Short title (suitable for subject line)
 */
export function buildTitle({ category, subcategory = null, locationAddress = null }) {
  const taxonomy = getTaxonomy(category);
  const categoryLabel = taxonomy?.displayName || category;

  let title = categoryLabel;

  if (subcategory) {
    const subcategoryLabel = subcategory.replace(/_/g, ' ');
    title = `${subcategoryLabel} - ${categoryLabel}`;
  }

  // Add brief location if available
  if (locationAddress) {
    // Take first part of address (street name/number, not full address)
    const shortLocation = locationAddress.split(',')[0]?.trim();
    if (shortLocation && shortLocation.length < 50) {
      title = `${title} at ${shortLocation}`;
    }
  }

  // Truncate if too long
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }

  return title;
}

/**
 * Build a summary line for display in lists.
 * @param {object} params - Report parameters
 * @param {string} params.category - AI category
 * @param {number|null} params.seriousness - AI seriousness score
 * @param {string|null} params.subcategory - Baltimore subcategory
 * @returns {string} One-line summary
 */
export function buildSummary({ category, seriousness = null, subcategory = null }) {
  const taxonomy = getTaxonomy(category);
  const categoryLabel = taxonomy?.displayName || category;

  if (category === 'unable_to_assess') {
    return 'Unable to assess - manual category needed';
  }

  if (category === 'no_visible_hazard') {
    return 'No visible hazard detected';
  }

  const urgency = getUrgency(seriousness);
  const urgencyLabel = urgency === 'emergency' ? ' [EMERGENCY]' :
                       urgency === 'urgent' ? ' [URGENT]' :
                       '';

  if (subcategory) {
    const subcategoryLabel = subcategory.replace(/_/g, ' ');
    return `${categoryLabel}: ${subcategoryLabel}${urgencyLabel}`;
  }

  return `${categoryLabel}${urgencyLabel}`;
}

/**
 * Extract key fields for structured 311 API submission.
 * @param {object} params - Report parameters
 * @param {string} params.category - AI category
 * @param {string|null} params.subcategory - Baltimore subcategory
 * @param {string|null} params.userDescription - User-provided description
 * @param {number|null} params.latitude - GPS latitude
 * @param {number|null} params.longitude - GPS longitude
 * @param {string|null} params.locationAddress - Address
 * @returns {object} Structured fields for API submission
 */
export function buildStructuredFields({
  category,
  subcategory = null,
  userDescription = null,
  latitude = null,
  longitude = null,
  locationAddress = null,
}) {
  const taxonomy = getTaxonomy(category);

  return {
    service_code: subcategory || category, // Use subcategory if available
    description: userDescription || `${taxonomy?.displayName || category} reported via photo`,
    lat: latitude,
    long: longitude,
    address_string: locationAddress,
    // Additional fields can be added based on Open311 spec
    media_url: null, // To be filled by caller with uploaded photo URL
  };
}

/**
 * Validate description input before building.
 * @param {string|null} userDescription - User-provided description
 * @returns {object} { valid: boolean, error?: string, sanitized?: string }
 */
export function validateDescriptionInput(userDescription) {
  if (!userDescription) {
    return { valid: true, sanitized: null };
  }

  if (typeof userDescription !== 'string') {
    return { valid: false, error: 'Description must be text' };
  }

  const trimmed = userDescription.trim();

  if (trimmed.length === 0) {
    return { valid: true, sanitized: null };
  }

  if (trimmed.length > 2000) {
    return { valid: false, error: 'Description too long (maximum 2000 characters)' };
  }

  // Basic sanitization: remove control characters except newlines/tabs
  const sanitized = trimmed.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  return { valid: true, sanitized };
}

/**
 * Build emergency guidance text for immediate threats.
 * @param {string} category - AI category
 * @param {number|null} seriousness - AI seriousness score
 * @returns {string|null} Emergency guidance or null if not emergency
 */
export function buildEmergencyGuidance(category, seriousness = null) {
  if (category === 'fire_injury_or_immediate_threat') {
    return 'EMERGENCY: Call 911 immediately. Do not wait to submit a report. ' +
           'Active fire, smoke, explosion, serious injury, violence, or immediate danger ' +
           'requires emergency response.';
  }

  if (category === 'electricity_and_gas') {
    return 'URGENT: Gas odor or downed power lines require immediate action. ' +
           'Call 911 and BGE emergency line. Stay away from downed wires. ' +
           'Never approach or touch a downed power line.';
  }

  if (seriousness !== null && seriousness >= 9) {
    return 'EMERGENCY: This appears to be a life-threatening condition. ' +
           'Call 911 immediately if anyone is in danger or if conditions are actively dangerous.';
  }

  return null;
}
