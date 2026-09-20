export interface BaltimoreAddressSuggestion {
  address: string;
  latitude: number;
  longitude: number;
}

const GEOCODER_URL =
  'https://egis.baltimorecity.gov/egis/rest/services/Locator/EGISCompositeLocator/GeocodeServer/findAddressCandidates';

const BALTIMORE_BOUNDS = {
  minLatitude: 39.19,
  maxLatitude: 39.38,
  minLongitude: -76.72,
  maxLongitude: -76.52,
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseBaltimoreCandidates(value: unknown): BaltimoreAddressSuggestion[] {
  if (!value || typeof value !== 'object') return [];
  const candidates = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];

  const seen = new Set<string>();
  const suggestions: BaltimoreAddressSuggestion[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    const location = item.location && typeof item.location === 'object'
      ? item.location as Record<string, unknown>
      : {};
    const address = typeof item.address === 'string' ? item.address.trim() : '';
    const score = finiteNumber(item.score);
    const longitude = finiteNumber(location.x);
    const latitude = finiteNumber(location.y);
    if (!address || score === null || score < 60 || latitude === null || longitude === null) continue;
    if (
      latitude < BALTIMORE_BOUNDS.minLatitude ||
      latitude > BALTIMORE_BOUNDS.maxLatitude ||
      longitude < BALTIMORE_BOUNDS.minLongitude ||
      longitude > BALTIMORE_BOUNDS.maxLongitude
    ) continue;
    const key = address.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ address, latitude, longitude });
    if (suggestions.length === 5) break;
  }
  return suggestions;
}

export async function findBaltimoreAddresses(query: string): Promise<BaltimoreAddressSuggestion[]> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('SingleLine', query);
  url.searchParams.set('f', 'json');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('maxLocations', '5');
  url.searchParams.set('outFields', 'Match_addr,City,State');

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Baltimore geocoder returned ${response.status}.`);
  return parseBaltimoreCandidates(await response.json());
}
