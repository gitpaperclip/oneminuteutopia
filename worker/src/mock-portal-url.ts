export const ALLOWED_MOCK_PORTAL_HOSTS = [
  'localhost',
  '127.0.0.1',
  'mock-government-page-without-api.vercel.app',
  'mock-second-gov-site-transportation.vercel.app',
] as const;

const ALLOWED_HOSTS = new Set<string>(ALLOWED_MOCK_PORTAL_HOSTS);

function hostnameOf(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
  return parsed.hostname.replace(/\.$/, '').toLowerCase();
}

export function assertAllowedMockPortalUrl(
  raw: string | undefined | null,
  label: string,
): string {
  const url = raw?.trim();
  if (!url) {
    throw new Error(
      `${label} is missing. Playwright only fills allowlisted mock demo hosts (${ALLOWED_MOCK_PORTAL_HOSTS.join(', ')}). Live city URLs are not allowed.`,
    );
  }

  let hostname: string;
  try {
    hostname = hostnameOf(url);
  } catch {
    throw new Error(
      `${label} is not a valid http(s) mock portal URL. Playwright only fills allowlisted demo hosts (${ALLOWED_MOCK_PORTAL_HOSTS.join(', ')}).`,
    );
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(
      `${label} host "${hostname}" is not allowlisted. Playwright only fills known demo hosts (${ALLOWED_MOCK_PORTAL_HOSTS.join(', ')}). Live city URLs are not allowed.`,
    );
  }

  return url;
}

export function resolveMockPortalUrl(
  envName: 'MOCK_GOVERNMENT_URL' | 'MOCK_TRANSPORTATION_URL',
  fallback: string,
): string {
  return assertAllowedMockPortalUrl(
    process.env[envName]?.trim() || fallback,
    envName,
  );
}

export function assertMockPortalUrls(): void {
  resolveMockPortalUrl(
    'MOCK_GOVERNMENT_URL',
    'https://mock-government-page-without-api.vercel.app/',
  );
  resolveMockPortalUrl(
    'MOCK_TRANSPORTATION_URL',
    'https://mock-second-gov-site-transportation.vercel.app/',
  );
}
