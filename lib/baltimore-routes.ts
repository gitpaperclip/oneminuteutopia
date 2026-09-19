import { CATEGORY_LABELS } from './analysis-labels.ts';

export interface HandoffPhone {
  number: string;
  label?: string;
}

export interface HandoffLink {
  id: string;
  label: string;
  href: string;
  /** Official public reporting/entry URL. Defaults to Baltimore 311 when a department has no dedicated form. */
  reportUrl?: string;
  department?: string;
  note?: string;
  phones?: HandoffPhone[];
}

/** Immediate-threat categories or scores that should surface Contact 911. */
export const EXTREME_SERIOUSNESS = 9;
/** Electricity/gas is treated as emergency when severity is High or worse. */
export const ELECTRICITY_HIGH_SERIOUSNESS = 7;

/** Baltimore 311 citizen service-request portal (stable public entry). */
export const B311_REPORT_URL = 'https://balt311.baltimorecity.gov/citizen/s/';

const B311: HandoffLink = {
  id: 'b311',
  label: 'Baltimore 311',
  department: 'Baltimore 311',
  href: B311_REPORT_URL,
  reportUrl: B311_REPORT_URL,
  phones: [
    { number: '311', label: 'Inside the city' },
    { number: '443-263-2220', label: 'Outside the city' },
  ],
  note: 'Citywide non-emergency intake. This app does not file with Baltimore City.',
};

const DPW_SOLID: HandoffLink = {
  id: 'dpw-solid',
  label: 'DPW Solid Waste',
  department: 'Baltimore City Department of Public Works',
  href: 'https://publicworks.baltimorecity.gov/',
  reportUrl: B311_REPORT_URL,
  phones: [
    { number: '410-396-5134', label: 'Solid waste' },
    { number: '410-396-3310', label: 'Administration' },
  ],
  note: 'Missed trash, dumping, and sanitation. File through Baltimore 311 — DPW has no separate public form.',
};

const DPW_WATER: HandoffLink = {
  id: 'dpw-water',
  label: 'DPW Water & Wastewater',
  department: 'Baltimore City Department of Public Works',
  href: 'https://publicworks.baltimorecity.gov/',
  reportUrl: B311_REPORT_URL,
  phones: [
    { number: '410-396-3500', label: 'Water and wastewater' },
    { number: '410-396-5352', label: 'Water emergencies' },
    { number: '410-396-3310', label: 'Administration' },
  ],
  note: 'Main breaks, sewer backups, drainage, and flooding. File through Baltimore 311.',
};

const BCDOT: HandoffLink = {
  id: 'bcdot',
  label: 'Dept. of Transportation',
  department: 'Baltimore City Department of Transportation',
  href: 'https://transportation.baltimorecity.gov/',
  reportUrl: B311_REPORT_URL,
  note: 'Potholes, signs, signals, and streetlights in the public right-of-way. File through Baltimore 311.',
};

const DHCD: HandoffLink = {
  id: 'dhcd',
  label: 'Housing / Code Enforcement',
  department: 'Baltimore City Department of Housing and Community Development',
  href: 'https://www.baltimorecity.gov/dhcd/property-maintenance-and-code-enforcement',
  reportUrl: B311_REPORT_URL,
  note: 'Vacant buildings, housing-code, and construction concerns. File through Baltimore 311.',
};

const BCRP: HandoffLink = {
  id: 'bcrp',
  label: 'Recreation & Parks',
  department: 'Baltimore City Recreation and Parks',
  href: 'https://bcrp.baltimorecity.gov/',
  reportUrl: B311_REPORT_URL,
  note: 'Parks, playgrounds, trails, and park trees. File through Baltimore 311.',
};

const BCHD: HandoffLink = {
  id: 'bchd',
  label: 'Health Department',
  department: 'Baltimore City Health Department',
  href: 'https://www.baltimorecity.gov/health/our-work/animal-services',
  reportUrl: B311_REPORT_URL,
  note: 'Animal-control and environmental health complaints. File through Baltimore 311.',
};

const BCFD: HandoffLink = {
  id: 'bcfd',
  label: 'Fire Department',
  department: 'Baltimore City Fire Department',
  href: 'https://www.baltimorecity.gov/fire',
  reportUrl: B311_REPORT_URL,
  phones: [{ number: '410-396-5680', label: 'Non-emergency contact' }],
  note: 'Non-emergency only — call 911 if there is immediate danger. File through Baltimore 311.',
};

const BPD: HandoffLink = {
  id: 'bpd',
  label: 'Baltimore Police',
  department: 'Baltimore Police Department',
  href: 'https://www.baltimorepolice.org/file-police-report',
  reportUrl: 'https://www.baltimorepolice.org/file-police-report',
  phones: [{ number: '410-637-8875', label: 'Telephone Reporting Unit' }],
  note: 'Eligible non-emergency reports only. Call 911 if there is immediate danger.',
};

const BGE: HandoffLink = {
  id: 'bge',
  label: 'BGE',
  department: 'Baltimore Gas and Electric',
  href: 'https://www.bge.com/outages-and-safety',
  reportUrl: 'https://secure.bge.com/powerOutages/',
  phones: [
    { number: '877-778-2222', label: 'Outage / downed line' },
    { number: '800-685-0123', label: 'Gas odor' },
  ],
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

export function reportUrlForLink(link: HandoffLink): string {
  if (link.reportUrl) return link.reportUrl;
  if (link.href.startsWith('http')) return link.href;
  return B311_REPORT_URL;
}

/** Official public reporting/entry page for the likely agency (311 fallback when no dedicated form). */
export function agencyReportLink(category: string): HandoffLink {
  const preferred =
    handoffsForCategory(category).find((link) => link.id !== '911') ?? B311;
  const href = reportUrlForLink(preferred);
  return { ...preferred, href, reportUrl: href };
}

/** Chip copy for the analysis page. Opens the official portal; never claims a city filing. */
export function agencyReportingCopy(category: string): { href: string; label: string } {
  const link = agencyReportLink(category);
  const name = link.department ?? link.label;
  return { href: link.href, label: `Open ${name} reporting` };
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
