/**
 * Baltimore 311 routing and destination selector.
 * Pure deterministic routing decisions based on incident characteristics.
 *
 * Based on docs/baltimore-reporting-catalog.md official catalog.
 */
import { getTaxonomy, requiresEmergency, getUrgency } from './incident-taxonomy.mjs';

/**
 * Official Baltimore destinations with contact information.
 * Last verified: 2026-09-19 per docs/baltimore-reporting-catalog.md
 */
export const DESTINATIONS = Object.freeze({
  '911': {
    id: '911',
    displayName: '911 Emergency',
    jurisdiction: 'city',
    phone: '911',
    intakeUrl: null,
    description: 'Emergency police, fire, rescue, or medical emergency',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://balt311.baltimorecity.gov/',
  },
  '311': {
    id: '311',
    displayName: 'Baltimore 311',
    jurisdiction: 'city',
    phone: '311',
    phoneOutside: '410-396-5352',
    intakeUrl: 'https://balt311.baltimorecity.gov/',
    description: 'Non-emergency city services, potholes, trash, streetlights, and more',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://balt311.baltimorecity.gov/',
  },
  BCDOT: {
    id: 'BCDOT',
    displayName: 'Baltimore City Department of Transportation',
    jurisdiction: 'city',
    phone: null,
    intakeUrl: 'https://transportation.baltimorecity.gov/',
    description: 'Potholes, traffic signals, streetlights, signs, and road conditions',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://transportation.baltimorecity.gov/',
  },
  DPW: {
    id: 'DPW',
    displayName: 'Baltimore City Department of Public Works',
    jurisdiction: 'city',
    phone: '410-396-3310',
    intakeUrl: 'https://publicworks.baltimorecity.gov/',
    description: 'Trash, recycling, water, sewage, drainage, and sanitation',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://publicworks.baltimorecity.gov/',
  },
  DHCD: {
    id: 'DHCD',
    displayName: 'Baltimore City Housing / Code Enforcement',
    jurisdiction: 'city',
    phone: null,
    intakeUrl: 'https://dhcd.baltimorecity.gov/',
    description: 'Vacant buildings, housing code violations, unsafe structures',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://dhcd.baltimorecity.gov/',
  },
  BCHD: {
    id: 'BCHD',
    displayName: 'Baltimore City Health Department',
    jurisdiction: 'city',
    phone: null,
    intakeUrl: 'https://health.baltimorecity.gov/',
    description: 'Rodents, food safety, environmental health, lead concerns',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://health.baltimorecity.gov/',
  },
  'Recreation & Parks': {
    id: 'Recreation & Parks',
    displayName: 'Baltimore City Recreation and Parks',
    jurisdiction: 'city',
    phone: null,
    intakeUrl: 'https://bcrp.baltimorecity.gov/',
    description: 'Park equipment, trails, fields, park lighting, trees in parks',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://bcrp.baltimorecity.gov/',
  },
  BGE: {
    id: 'BGE',
    displayName: 'Baltimore Gas and Electric',
    jurisdiction: 'utility',
    phone: null, // Emergency number on BGE site
    intakeUrl: 'https://www.bge.com/',
    description: 'Downed power lines, gas odor, power outages, damaged utility equipment',
    emergencyNote: 'Call BGE emergency line and 911 for gas odor or downed lines',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://www.bge.com/',
  },
  'Animal Control': {
    id: 'Animal Control',
    displayName: 'Baltimore Animal Care and Control',
    jurisdiction: 'city',
    phone: null,
    intakeUrl: null,
    description: 'Stray, aggressive, or injured animals',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://balt311.baltimorecity.gov/',
  },
  MTA: {
    id: 'MTA',
    displayName: 'Maryland Transit Administration',
    jurisdiction: 'state',
    phone: null,
    intakeUrl: 'https://www.mta.maryland.gov/',
    description: 'Transit buses, light rail, metro, station hazards',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://www.mta.maryland.gov/',
  },
  MDE: {
    id: 'MDE',
    displayName: 'Maryland Department of the Environment',
    jurisdiction: 'state',
    phone: null,
    intakeUrl: 'https://mde.maryland.gov/',
    description: 'Pollution, hazardous waste, environmental violations',
    fallbackTo: '311',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: 'https://mde.maryland.gov/',
  },
  DNR: {
    id: 'DNR',
    displayName: 'Maryland Department of Natural Resources',
    jurisdiction: 'state',
    phone: null,
    intakeUrl: null,
    description: 'Wildlife conflicts, injured wildlife, natural resources',
    requiresHumanConfirmation: true,
    lastVerified: '2026-09-19',
    sourceUrl: null,
  },
});

/**
 * Select the appropriate destination for an incident.
 * @param {object} params - Routing parameters
 * @param {string} params.category - AI category from image analysis
 * @param {number|null} params.seriousness - AI seriousness score (0-10)
 * @param {string|null} params.subcategory - Optional Baltimore subcategory
 * @returns {object} Routing recommendation
 */
export function selectDestination({ category, seriousness = null, subcategory = null }) {
  // Safety check: immediate emergencies always go to 911
  if (requiresEmergency(category, seriousness)) {
    return {
      destination: DESTINATIONS['911'],
      reason: 'Emergency response required for life-threatening condition',
      urgency: 'emergency',
      requiresImmediate: true,
      alternates: [],
    };
  }

  const taxonomy = getTaxonomy(category);
  if (!taxonomy) {
    // Unknown category: default to 311
    return {
      destination: DESTINATIONS['311'],
      reason: 'Unknown category - route to 311 for triage',
      urgency: getUrgency(seriousness),
      requiresImmediate: false,
      alternates: [],
    };
  }

  const urgency = getUrgency(seriousness);

  // Get default destination from taxonomy
  const destinationId = taxonomy.defaultDestination;
  if (!destinationId) {
    // No visible hazard or unable to route
    return {
      destination: null,
      reason: category === 'no_visible_hazard'
        ? 'No visible hazard detected'
        : 'Unable to determine destination',
      urgency: urgency || 'none',
      requiresImmediate: false,
      alternates: category === 'unable_to_assess' ? [DESTINATIONS['311']] : [],
    };
  }

  const destination = DESTINATIONS[destinationId];
  const alternates = [];

  // Build alternates list from agencies
  for (const agencyId of taxonomy.agencies || []) {
    if (agencyId !== destinationId && DESTINATIONS[agencyId]) {
      alternates.push(DESTINATIONS[agencyId]);
    }
  }

  // Special routing refinements based on subcategory
  let reason = `${taxonomy.displayName} reports go to ${destination.displayName}`;

  if (category === 'other_hazard') {
    // Other hazards need clarification
    if (subcategory === 'food' || subcategory === 'rodents' || subcategory === 'public_health') {
      const bchd = DESTINATIONS.BCHD;
      return {
        destination: bchd,
        reason: 'Public health concern - route to Health Department',
        urgency,
        requiresImmediate: urgency === 'urgent' || urgency === 'emergency',
        alternates: [DESTINATIONS['311']],
      };
    } else if (subcategory === 'pollution') {
      const mde = DESTINATIONS.MDE;
      return {
        destination: mde,
        reason: 'Environmental pollution - may require Maryland Department of Environment',
        urgency,
        requiresImmediate: false,
        alternates: [DESTINATIONS['311']],
      };
    } else if (subcategory === 'transit') {
      const mta = DESTINATIONS.MTA;
      return {
        destination: mta,
        reason: 'Transit-related issue - route to MTA',
        urgency,
        requiresImmediate: urgency === 'emergency',
        alternates: [DESTINATIONS['911']],
      };
    }
  }

  return {
    destination,
    reason,
    urgency,
    requiresImmediate: urgency === 'urgent' || urgency === 'emergency',
    alternates,
  };
}

/**
 * Get destination by ID.
 * @param {string} destinationId - Destination ID
 * @returns {object|null} Destination or null if not found
 */
export function getDestination(destinationId) {
  return DESTINATIONS[destinationId] || null;
}

/**
 * Get all available destinations.
 * @returns {object[]} Array of all destinations
 */
export function getAllDestinations() {
  return Object.values(DESTINATIONS);
}

/**
 * Format a routing recommendation for display.
 * @param {object} routing - Result from selectDestination
 * @returns {object} Formatted display object
 */
export function formatRoutingDisplay(routing) {
  if (!routing.destination) {
    return {
      primary: null,
      message: routing.reason,
      urgency: routing.urgency,
      callToAction: null,
      alternates: routing.alternates.map(d => ({
        name: d.displayName,
        phone: d.phone,
        url: d.intakeUrl,
      })),
    };
  }

  const dest = routing.destination;
  let callToAction = 'Review and submit report';

  if (routing.requiresImmediate) {
    callToAction = dest.id === '911'
      ? 'Call 911 immediately - do not wait'
      : `Contact ${dest.displayName} immediately`;
  }

  return {
    primary: {
      name: dest.displayName,
      phone: dest.phone || dest.phoneOutside,
      url: dest.intakeUrl,
      description: dest.description,
      emergencyNote: dest.emergencyNote,
    },
    message: routing.reason,
    urgency: routing.urgency,
    callToAction,
    alternates: routing.alternates.map(d => ({
      name: d.displayName,
      phone: d.phone || d.phoneOutside,
      url: d.intakeUrl,
    })),
  };
}
