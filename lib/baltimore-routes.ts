import { CATEGORY_LABELS } from './analysis-labels';

export interface HandoffLink {
  id: string;
  label: string;
  href: string;
  note?: string;
}

const B311: HandoffLink = {
  id: 'b311',
  label: 'Baltimore 311',
  href: 'https://balt311.baltimorecity.gov/',
  note: 'Citywide non-emergency intake',
};

const DPW: HandoffLink = {
  id: 'dpw',
  label: 'Dept. of Public Works',
  href: 'https://publicworks.baltimorecity.gov/',
};

const BCDOT: HandoffLink = {
  id: 'bcdot',
  label: 'Dept. of Transportation',
  href: 'https://transportation.baltimorecity.gov/',
};

const DHCD: HandoffLink = {
  id: 'dhcd',
  label: 'Housing / Code Enforcement',
  href: 'https://dhcd.baltimorecity.gov/',
};

const BCRP: HandoffLink = {
  id: 'bcrp',
  label: 'Recreation & Parks',
  href: 'https://bcrp.baltimorecity.gov/',
};

const BCHD: HandoffLink = {
  id: 'bchd',
  label: 'Health Department',
  href: 'https://health.baltimorecity.gov/',
};

const BCFD: HandoffLink = {
  id: 'bcfd',
  label: 'Fire Department',
  href: 'https://fire.baltimorecity.gov/',
  note: 'Non-emergency only — call 911 if danger',
};

const CALL_911: HandoffLink = {
  id: '911',
  label: 'Call 911',
  href: 'tel:911',
  note: 'Immediate danger, fire, injury, or violence',
};

/** Keys must match lib/analysis-labels.ts / Gemini output. */
const BY_CATEGORY: Record<string, HandoffLink[]> = {
  roads_and_sidewalks: [BCDOT, B311],
  traffic_signals_and_streetlights: [BCDOT, B311],
  trash_and_sanitation: [DPW, B311],
  water_drainage_and_sewage: [DPW, B311],
  trees_and_public_spaces: [BCRP, B311],
  buildings_and_construction: [DHCD, B311],
  electricity_and_gas: [B311, CALL_911],
  animals: [BCHD, B311],
  fire_injury_or_immediate_threat: [CALL_911, BCFD, B311],
  other_hazard: [B311],
  no_visible_hazard: [B311],
  unable_to_assess: [B311],
};

export function handoffsForCategory(category: string): HandoffLink[] {
  const links = BY_CATEGORY[category] ?? [B311];
  if (!links.some((l) => l.id === 'b311')) return [...links, B311];
  return links;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).filter(
  ([key]) => key !== 'unable_to_assess',
);
