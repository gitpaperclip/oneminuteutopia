import { CATEGORY_LABELS } from './analysis-labels.ts';

/** Public map chrome and selected-sheet copy. Edit here — not Contacts. */
export const MAP_COPY = {
  title: 'Incident map',
  configErrorTitle: 'Map style is not configured',
  configErrorBody:
    'Set NEXT_PUBLIC_MAP_STYLE_URL to an OpenMapTiles-compatible MapLibre style. Do not put private tokens in client code.',
  apiErrorTitle: 'Could not load incidents',
  emptyTitle: 'No incidents in this view',
  emptyBody: 'Pan the map or submit a photo report with GPS. This map only shows saved incidents.',
  unmappedTitle: 'Saved incidents have no map coordinates',
  unmappedBody: 'Reports in this view are missing a centroid latitude and longitude.',
  truncated:
    'Showing the most recently updated incidents in this view. Zoom in to load a smaller area.',
  locate: 'My location',
  report: 'Report',
  filters: 'Filters',
  resetFilters: 'Reset',
  superReportsOnly: 'Super-reports only',
  allCategories: 'All categories',
  seeThisToo: 'I see this too',
  confirmed: 'You confirmed this issue',
  removeConfirmation: 'Remove confirmation',
  confirmationHint:
    'A community confirmation is not a photo report, a vote, or a city filing.',
  loading: 'Loading incidents…',
  clusterNote:
    'Nearby dots are grouped for display only. Database super-reports stay the source of truth.',
} as const;

const GENERIC_TYPES = new Set([
  'other_hazard',
  'no_visible_hazard',
  'unable_to_assess',
]);

export function humanizeSlug(value: string | null | undefined): string {
  if (!value) return 'Unspecified';
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function incidentSheetTitle(incident: {
  short_label: string;
  incident_type: string | null;
  category: string;
}): string {
  const type = incident.incident_type;
  if (
    type &&
    !type.endsWith('_unspecified') &&
    type !== incident.category &&
    !GENERIC_TYPES.has(type)
  ) {
    return humanizeSlug(type);
  }
  const label = incident.short_label?.trim();
  if (label) return label;
  return CATEGORY_LABELS[incident.category] ?? humanizeSlug(incident.category);
}

export function incidentSheetDescription(incident: {
  full_description: string | null;
}): string | null {
  const text = incident.full_description?.trim();
  return text || null;
}

export function superReportBadge(evidenceCount: number): string {
  return `Super-report (${evidenceCount})`;
}

export function confirmationTotalLabel(count: number): string {
  if (count === 1) return '1 community confirmation';
  return `${count} community confirmations`;
}

export function unmappedEmptyBody(count: number): string {
  const noun = count === 1 ? 'incident' : 'incidents';
  return `${count} ${noun} loaded from the database, but none include a centroid lat/lon. Submit a report with GPS to drop a pin.`;
}
