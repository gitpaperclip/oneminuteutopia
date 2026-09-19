import { CATEGORY_LABELS } from './analysis-labels.ts';

export interface HandoffPhone {
  number: string;
  label?: string;
}

export interface HandoffLink {
  id: string;
  label: string;
  href: string;
  department?: string;
  note?: string;
  phones?: HandoffPhone[];
}

/** Immediate-threat categories or scores that should surface Contact 911. */
export const EXTREME_SERIOUSNESS = 9;
/** Electricity/gas is treated as emergency when severity is High or worse. */
export const ELECTRICITY_HIGH_SERIOUSNESS = 7;

const B311: HandoffLink = {
  id: 'b311',
  label: 'Baltimore 311',
  department: 'Baltimore 311',
  href: 'https://balt311.baltimorecity.gov/',
  phones: [
    { number: '311', label: 'Inside the city' },
    { number: '410-396-5352', label: 'Outside the city' },
  ],
  note: 'Citywide non-emergency intake. This app does not send reports to 311 for you.',
};

const DPW_SOLID: HandoffLink = {
  id: 'dpw-solid',
  label: 'DPW Solid Waste',
  department: 'Baltimore City Department of Public Works',
  href: 'https://publicworks.baltimorecity.gov/',
  phones: [
    { number: '410-396-5134', label: 'Solid waste' },
    { number: '410-396-3310', label: 'Administration' },
  ],
  note: 'Missed trash, dumping, and sanitation conditions',
};

const DPW_WATER: HandoffLink = {
  id: 'dpw-water',
  label: 'DPW Water & Wastewater',
  department: 'Baltimore City Department of Public Works',
  href: 'https://publicworks.baltimorecity.gov/',
  phones: [
    { number: '410-396-3500', label: 'Water and wastewater' },
    { number: '410-396-3310', label: 'Administration' },
  ],
  note: 'Main breaks, sewer backups, drainage, and flooding',
};

const BCDOT: HandoffLink = {
  id: 'bcdot',
  label: 'Dept. of Transportation',
  department: 'Baltimore City Department of Transportation',
  href: 'https://transportation.baltimorecity.gov/',
  note: 'Potholes, signs, signals, and streetlights in the public right-of-way',
};

const DHCD: HandoffLink = {
  id: 'dhcd',
  label: 'Housing / Code Enforcement',
  department: 'Baltimore City Department of Housing and Community Development',
  href: 'https://dhcd.baltimorecity.gov/',
  note: 'Vacant buildings, housing-code, and construction concerns',
};

const BCRP: HandoffLink = {
  id: 'bcrp',
  label: 'Recreation & Parks',
  department: 'Baltimore City Recreation and Parks',
  href: 'https://bcrp.baltimorecity.gov/',
  note: 'Parks, playgrounds, trails, and park trees',
};

const BCHD: HandoffLink = {
  id: 'bchd',
  label: 'Health Department',
  department: 'Baltimore City Health Department',
  href: 'https://health.baltimorecity.gov/',
  note: 'Start with 311 for animal-control intake and environmental health complaints',
};

const BCFD: HandoffLink = {
  id: 'bcfd',
  label: 'Fire Department',
  department: 'Baltimore City Fire Department',
  href: 'https://fire.baltimorecity.gov/',
  note: 'Non-emergency only — call 911 if there is immediate danger',
};

const BPD: HandoffLink = {
  id: 'bpd',
  label: 'Baltimore Police',
  department: 'Baltimore Police Department',
  href: 'https://www.baltimorepolice.org/file-police-report',
  phones: [{ number: '410-637-8875', label: 'Telephone Reporting Unit' }],
  note: 'Eligible non-emergency reports only. Call 911 if there is immediate danger.',
};

const BGE: HandoffLink = {
  id: 'bge',
  label: 'BGE',
  department: 'Baltimore Gas and Electric',
  href: 'https://www.bge.com/',
  note: 'Downed lines, outages, and gas odor. Call 911 if there is immediate danger. Do not approach a downed line.',
};

const CALL_911: HandoffLink = {
  id: '911',
  label: 'Contact 911',
  department: 'Baltimore City 911',
  href: 'tel:911',
  phones: [{ number: '911' }],
  note: 'Immediate danger, fire, injury, or violence',
};

/** Keys must match lib/analysis-labels.ts / Gemini output. */
const BY_CATEGORY: Record<string, HandoffLink[]> = {
  roads_and_sidewalks: [BCDOT, B311],
  traffic_signals_and_streetlights: [BCDOT, B311],
  trash_and_sanitation: [DPW_SOLID, B311],
  water_drainage_and_sewage: [DPW_WATER, B311],
  trees_and_public_spaces: [BCRP, BCDOT, B311],
  buildings_and_construction: [DHCD, B311],
  electricity_and_gas: [BGE, B311],
  animals: [BCHD, B311],
  fire_injury_or_immediate_threat: [CALL_911, BCFD, BPD, B311],
  other_hazard: [B311],
  no_visible_hazard: [B311],
  unable_to_assess: [B311],
};

export function telHref(phone: string): string {
  const trimmed = phone.trim();
  if (/^(911|311|988|211)$/.test(trimmed)) return `tel:${trimmed}`;
  const digits = trimmed.replace(/[^\d+]/g, '');
  return `tel:${digits || trimmed}`;
}

export function isEmergencyHandoff(
  category: string,
  seriousness?: number | null,
): boolean {
  if (category === 'fire_injury_or_immediate_threat') return true;
  const score =
    typeof seriousness === 'number' && Number.isFinite(seriousness) ? seriousness : null;
  if (score != null && score >= EXTREME_SERIOUSNESS) return true;
  if (category === 'electricity_and_gas' && score != null && score >= ELECTRICITY_HIGH_SERIOUSNESS) {
    return true;
  }
  return false;
}

export function handoffsForCategory(category: string): HandoffLink[] {
  const links = BY_CATEGORY[category] ?? [B311];
  if (!links.some((l) => l.id === 'b311')) return [...links, B311];
  return links;
}

export function likelyDepartmentName(category: string): string | null {
  const department = handoffsForCategory(category).find((link) => link.id !== '911');
  return department?.department ?? department?.label ?? null;
}

export function primaryHandoff(category: string, seriousness?: number | null): HandoffLink {
  const links = handoffsForCategory(category);
  if (isEmergencyHandoff(category, seriousness)) {
    return links.find((link) => link.id === '911') ?? CALL_911;
  }
  return links.find((link) => link.id !== '911') ?? links[0] ?? B311;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).filter(
  ([key]) => key !== 'unable_to_assess',
);
