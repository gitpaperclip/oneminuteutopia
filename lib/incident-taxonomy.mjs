/**
 * Incident taxonomy for Baltimore City routing.
 * Pure deterministic mapping from AI categories to Baltimore-specific subcategories
 * and recommended destinations.
 *
 * Based on docs/baltimore-reporting-catalog.md routing taxonomy.
 */

/**
 * Baltimore-specific subcategories mapped from AI image categories.
 * Each category has possible subcategories, default destination, and escalation rules.
 */
export const BALTIMORE_TAXONOMY = Object.freeze({
  roads_and_sidewalks: {
    displayName: 'Roads and sidewalks',
    subcategories: ['pothole', 'sidewalk', 'curb_ramp', 'debris', 'sinkhole', 'bridge', 'crosswalk'],
    defaultDestination: '311',
    escalateWhen: 'collision risk, collapse, or injury',
    escalateTo: '911',
    agencies: ['BCDOT', '311'],
  },
  traffic_signals_and_streetlights: {
    displayName: 'Traffic signals and streetlights',
    subcategories: ['signal_out', 'stuck_signal', 'dark_streetlight', 'sign_missing', 'crosswalk_signal'],
    defaultDestination: '311',
    escalateWhen: 'active traffic conflict or crash',
    escalateTo: '911',
    agencies: ['BCDOT', '311'],
  },
  trash_and_sanitation: {
    displayName: 'Trash and sanitation',
    subcategories: ['dumping', 'missed_pickup', 'overflowing_bin', 'litter', 'graffiti', 'dead_animal'],
    defaultDestination: '311',
    escalateWhen: 'hazardous waste, active exposure, or fire',
    escalateTo: '911',
    agencies: ['DPW', '311'],
  },
  water_drainage_and_sewage: {
    displayName: 'Water, drainage, and sewage',
    subcategories: ['main_break', 'sewer_backup', 'blocked_inlet', 'flooding', 'sewage_discharge'],
    defaultDestination: '311',
    escalateWhen: 'flooding threatens people or property',
    escalateTo: '911',
    agencies: ['DPW', '311'],
  },
  trees_and_public_spaces: {
    displayName: 'Trees and public spaces',
    subcategories: ['fallen_tree', 'limb', 'park_equipment', 'trail', 'field', 'park_light'],
    defaultDestination: '311',
    escalateWhen: 'live wire or immediate collapse',
    escalateTo: '911',
    agencies: ['Recreation & Parks', 'BCDOT', 'BGE', '311'],
  },
  buildings_and_construction: {
    displayName: 'Buildings and construction',
    subcategories: ['vacant_building', 'collapse_risk', 'code_violation', 'blocked_exit', 'unpermitted_work'],
    defaultDestination: 'DHCD',
    escalateWhen: 'collapse, fire, or exposed wiring',
    escalateTo: '911',
    agencies: ['DHCD', '311'],
  },
  electricity_and_gas: {
    displayName: 'Electricity and gas',
    subcategories: ['gas_odor', 'downed_wire', 'pole', 'outage', 'damaged_utility_equipment'],
    defaultDestination: 'BGE',
    escalateWhen: 'always treat gas odor/downed energized wire as urgent',
    escalateTo: '911',
    agencies: ['BGE', '911'],
  },
  animals: {
    displayName: 'Animals',
    subcategories: ['stray', 'aggressive', 'injured_domestic', 'bite', 'wildlife'],
    defaultDestination: 'Animal Control',
    escalateWhen: 'attack or immediate danger',
    escalateTo: '911',
    agencies: ['Animal Control', 'BCHD', 'DNR'],
  },
  fire_injury_or_immediate_threat: {
    displayName: 'Fire, injury, or immediate threat',
    subcategories: ['fire', 'smoke', 'crash_injury', 'violence', 'active_hazard'],
    defaultDestination: '911',
    escalateWhen: 'immediately',
    escalateTo: '911',
    agencies: ['BCFD', 'BPD', '911'],
    noAutomatedSubmission: true,
  },
  other_hazard: {
    displayName: 'Other hazard',
    subcategories: ['food', 'rodents', 'lead', 'pollution', 'transit', 'accessibility', 'public_health'],
    defaultDestination: '311',
    escalateWhen: 'immediate threat',
    escalateTo: '911',
    agencies: ['BCHD', 'MDE', 'MTA', '311'],
  },
  no_visible_hazard: {
    displayName: 'No visible hazard',
    subcategories: [],
    defaultDestination: null,
    escalateWhen: null,
    escalateTo: null,
    agencies: [],
  },
  unable_to_assess: {
    displayName: 'Unable to assess',
    subcategories: [],
    defaultDestination: '311',
    escalateWhen: 'if clarified as immediate threat',
    escalateTo: '911',
    agencies: ['311'],
  },
});

/**
 * Get taxonomy information for a category.
 * @param {string} category - AI category from image analysis
 * @returns {object|null} Taxonomy entry or null if unknown
 */
export function getTaxonomy(category) {
  if (!category || typeof category !== 'string') return null;
  return BALTIMORE_TAXONOMY[category] || null;
}

/**
 * Check if a category requires emergency (911) response.
 * @param {string} category - AI category
 * @param {number|null} seriousness - AI seriousness score (0-10)
 * @returns {boolean} True if 911 should be called immediately
 */
export function requiresEmergency(category, seriousness = null) {
  if (category === 'fire_injury_or_immediate_threat') return true;
  if (seriousness !== null && seriousness >= 9) return true; // life-threatening
  return false;
}

/**
 * Check if a category requires urgent action (but not necessarily 911).
 * @param {string} category - AI category
 * @returns {boolean} True if immediate action needed
 */
export function requiresUrgent(category) {
  // Electricity/gas is always urgent but routes to BGE (who may direct to 911)
  return category === 'electricity_and_gas';
}

/**
 * Get urgency level from seriousness score.
 * @param {number|null} seriousness - AI seriousness score (0-10)
 * @returns {'emergency'|'urgent'|'routine'|'none'|null}
 */
export function getUrgency(seriousness) {
  if (seriousness === null) return null;
  if (seriousness >= 9) return 'emergency'; // 9-10: life-threatening
  if (seriousness >= 5) return 'urgent'; // 5-8: substantial to serious injury potential
  if (seriousness >= 1) return 'routine'; // 1-4: minor concern to plausible minor injury
  return 'none'; // 0: no visible hazard
}

/**
 * Validate and normalize a subcategory for a given category.
 * @param {string} category - AI category
 * @param {string} subcategory - User-selected or inferred subcategory
 * @returns {string|null} Normalized subcategory or null if invalid
 */
export function validateSubcategory(category, subcategory) {
  if (!category || !subcategory) return null;
  const taxonomy = getTaxonomy(category);
  if (!taxonomy) return null;
  const normalized = subcategory.toLowerCase().replace(/[^a-z_]/g, '');
  return taxonomy.subcategories.includes(normalized) ? normalized : null;
}

/**
 * Get all valid categories.
 * @returns {string[]} Array of valid category keys
 */
export function getCategories() {
  return Object.keys(BALTIMORE_TAXONOMY);
}
