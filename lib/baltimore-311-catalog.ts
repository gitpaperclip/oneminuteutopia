import 'server-only';

export const BALTIMORE_311_CATALOG_SOURCE =
  'https://services1.arcgis.com/UWYHeuuJISiGmgXx/ArcGIS/rest/services/311_Customer_Service_Requests_current/FeatureServer/0/query';

export interface Baltimore311Service {
  service_type: string;
  agencies: string[];
  internal_only: boolean;
}

interface ArcGISFeature {
  attributes?: { SRType?: unknown; Agency?: unknown };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  error?: unknown;
}

let cached: { expiresAt: number; services: Baltimore311Service[] } | null = null;

export function isInternalBaltimoreService(serviceType: string): boolean {
  return /\b(?:internal|proactive|use only|creation only|follow-up|escalation|ombudsman review)\b/i.test(serviceType);
}

export async function fetchBaltimore311ServiceCatalog(
  fetcher: typeof fetch = fetch,
): Promise<Baltimore311Service[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.services;
  const query = new URLSearchParams({
    where: '1=1', outFields: 'SRType,Agency', returnGeometry: 'false',
    returnDistinctValues: 'true', orderByFields: 'SRType', f: 'json',
  });
  const response = await fetcher(`${BALTIMORE_311_CATALOG_SOURCE}?${query}`, {
    signal: AbortSignal.timeout(8_000), cache: 'no-store',
  });
  if (!response.ok) throw new Error('Baltimore 311 catalog request failed');
  const data = await response.json() as ArcGISResponse;
  if (!Array.isArray(data.features) || data.error) throw new Error('Baltimore 311 catalog response was invalid');

  const collected = new Map<string, Set<string>>();
  for (const feature of data.features) {
    const serviceType = feature.attributes?.SRType;
    const agency = feature.attributes?.Agency;
    if (typeof serviceType !== 'string' || !serviceType.trim()) continue;
    const name = serviceType.trim();
    const agencies = collected.get(name) ?? new Set<string>();
    if (typeof agency === 'string' && agency.trim()) agencies.add(agency.trim());
    collected.set(name, agencies);
  }
  const services = [...collected.entries()]
    .map(([service_type, agencies]) => ({
      service_type, agencies: [...agencies].sort(),
      internal_only: isInternalBaltimoreService(service_type),
    }))
    .sort((a, b) => a.service_type.localeCompare(b.service_type));
  if (!services.length) throw new Error('Baltimore 311 catalog was empty');
  cached = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, services };
  return services;
}
