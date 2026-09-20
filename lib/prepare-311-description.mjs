/**
 * Deterministic Baltimore 311 report description builder.
 *
 * IMPORTANT: This module prepares descriptions for human review only.
 * This project has no public Baltimore 311 write integration. The resident must
 * review and submit through the official phone or portal flow.
 *
 * Combines: incident label, AI context summary, context tags, user details, evidence count.
 * Does NOT call any model. Sanitizes output. Distinguishes AI vs user-provided text.
 */

import { CONTEXT_TAGS } from './incident-taxonomy.mjs';

/** Maximum description length for practical form entry */
const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Build a complete 311 description from stored report data.
 * 
 * @param {object} params - Report data
 * @param {string} params.incident_type - Normalized incident type
 * @param {string|null} params.context_summary - AI-generated context summary
 * @param {string[]} params.context_tags - AI context tags array
 * @param {string|null} params.user_description - User-provided details
 * @param {number} params.evidence_count - Number of reports in this incident (1 for single)
 * @param {string|null} params.location_address - Location address
 * @returns {string} Formatted description ready for 311 submission
 */
export function build311Description({
  incident_type,
  context_summary = null,
  context_tags = [],
  user_description = null,
  evidence_count = 1,
  location_address = null,
}) {
  const parts = [];

  // 1. Incident label
  const label = incidentTypeLabel(incident_type);
  parts.push(`Issue: ${label}`);

  // 2. AI observations (context summary + tags)
  const aiObservations = buildAIObservations(context_summary, context_tags);
  if (aiObservations) {
    parts.push('');
    parts.push('AI observed:');
    parts.push(aiObservations);
  }

  // 3. User-provided details (clearly separated)
  if (user_description && user_description.trim()) {
    const sanitized = sanitizeText(user_description.trim());
    if (sanitized) {
      parts.push('');
      parts.push('Reporter notes:');
      parts.push(sanitized);
    }
  }

  // 4. Evidence count for super-reports
  if (evidence_count > 1) {
    parts.push('');
    parts.push(`This represents ${evidence_count} nearby reports of the same issue.`);
  }

  // 5. Location
  if (location_address) {
    parts.push('');
    parts.push(`Location: ${sanitizeText(location_address)}`);
  }

  // 6. Source attribution
  parts.push('');
  parts.push('Prepared by One Minute Utopia community reporting app.');

  const full = parts.join('\n');

  // Cap at practical length
  if (full.length > MAX_DESCRIPTION_LENGTH) {
    return full.substring(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
  }

  return full;
}

/**
 * Build AI observations section from context summary and tags.
 * Avoids repetition between summary and tags.
 * 
 * @param {string|null} context_summary - AI context summary
 * @param {string[]} context_tags - AI context tags
 * @returns {string|null} Formatted observations or null
 */
function buildAIObservations(context_summary, context_tags) {
  const parts = [];

  if (context_summary && context_summary.trim()) {
    const sanitized = sanitizeText(context_summary.trim());
    if (sanitized) {
      parts.push(sanitized);
    }
  }

  // Render allowlisted tags as human-readable observations
  const summaryLower = (context_summary || '').toLowerCase();
  const humanReadableTags = (context_tags || [])
    .filter(tag => CONTEXT_TAGS.includes(tag))
    .map(tag => tag.replace(/_/g, ' '))
    .filter(readable => {
      // Avoid repeating tag if it's clearly mentioned in summary
      // Check both original tag and readable form
      const tagLower = readable.toLowerCase();
      // Check if the words in the readable tag appear in the summary
      return !summaryLower.includes(tagLower);
    });

  if (humanReadableTags.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(`Additional details: ${humanReadableTags.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Get human-readable label for an incident type.
 * 
 * @param {string} incident_type - Normalized incident type
 * @returns {string} Human-readable label
 */
function incidentTypeLabel(incident_type) {
  // Convert snake_case to Title Case
  return incident_type
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Sanitize text for 311 description.
 * Removes control characters (except newlines/tabs), HTML, and excess whitespace.
 * 
 * @param {string} text - Raw text
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // Remove control characters except \n and \t
  let clean = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Remove HTML tags
  clean = clean.replace(/<[^>]*>/g, '');

  // Normalize whitespace - collapse multiple spaces/newlines/tabs into single space
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

/**
 * Validate user-provided description input.
 * 
 * @param {string|null} text - User input
 * @returns {{ valid: boolean, error?: string, sanitized?: string }}
 */
export function validateUserDescription(text) {
  if (!text) {
    return { valid: true, sanitized: null };
  }

  if (typeof text !== 'string') {
    return { valid: false, error: 'Description must be text' };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: true, sanitized: null };
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return { valid: false, error: `Description too long (maximum ${MAX_DESCRIPTION_LENGTH} characters)` };
  }

  const sanitized = sanitizeText(trimmed);
  return { valid: true, sanitized };
}

/**
 * Build emergency guidance for immediate threats.
 * 
 * @param {string} category - AI category
 * @param {number|null} seriousness - AI seriousness score (0-10)
 * @returns {string|null} Emergency guidance or null
 */
export function buildEmergencyGuidance(category, seriousness = null) {
  if (category === 'fire_injury_or_immediate_threat') {
    return 'EMERGENCY: Call 911 immediately. Do not wait to prepare a report. ' +
           'Active fire, smoke, serious injury, violence, or immediate danger requires emergency response.';
  }

  if (seriousness !== null && seriousness >= 9) {
    return 'EMERGENCY: This appears to be a life-threatening condition. ' +
           'Call 911 immediately if anyone is in danger or if conditions are actively dangerous.';
  }

  return null;
}
