import test from 'node:test';
import assert from 'node:assert/strict';
import { mockAgencyRoute, routeIncident } from '../worker/src/agency-route.ts';
import {
  ALLOWED_MOCK_PORTAL_HOSTS,
  assertAllowedMockPortalUrl,
  assertMockPortalUrls,
  resolveMockPortalUrl,
} from '../worker/src/mock-portal-url.ts';

const originalEnvironments = new WeakMap();
function setEnv(t, key, value) {
  let originals = originalEnvironments.get(t);
  if (!originals) {
    originals = new Map();
    originalEnvironments.set(t, originals);
    t.after(() => {
      for (const [name, original] of originals) {
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
      }
    });
  }
  if (!originals.has(key)) originals.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('allowlist covers localhost, loopback, and the documented demo hosts', () => {
  assert.deepEqual([...ALLOWED_MOCK_PORTAL_HOSTS], [
    'localhost',
    '127.0.0.1',
    'mock-government-page-without-api.vercel.app',
    'mock-second-gov-site-transportation.vercel.app',
  ]);
});

test('allowlisted demo and local hostnames are accepted by hostname, not path', () => {
  assert.equal(
    assertAllowedMockPortalUrl(
      'https://mock-government-page-without-api.vercel.app/report?x=1',
      'MOCK_GOVERNMENT_URL',
    ),
    'https://mock-government-page-without-api.vercel.app/report?x=1',
  );
  assert.equal(
    assertAllowedMockPortalUrl('http://localhost:4173/form', 'MOCK_GOVERNMENT_URL'),
    'http://localhost:4173/form',
  );
  assert.equal(
    assertAllowedMockPortalUrl('http://127.0.0.1:3000/', 'MOCK_TRANSPORTATION_URL'),
    'http://127.0.0.1:3000/',
  );
  assert.equal(
    assertAllowedMockPortalUrl(
      'https://mock-second-gov-site-transportation.vercel.app/',
      'MOCK_TRANSPORTATION_URL',
    ),
    'https://mock-second-gov-site-transportation.vercel.app/',
  );
});

test('missing or blank mock portal URLs are refused', () => {
  assert.throws(() => assertAllowedMockPortalUrl(undefined, 'MOCK_GOVERNMENT_URL'), /missing/);
  assert.throws(() => assertAllowedMockPortalUrl('   ', 'MOCK_TRANSPORTATION_URL'), /missing/);
});

test('non-allowlisted and live city hosts are refused', () => {
  assert.throws(
    () => assertAllowedMockPortalUrl('https://baltimore311.baltimorecity.gov/', 'MOCK_GOVERNMENT_URL'),
    /not allowlisted/,
  );
  assert.throws(
    () => assertAllowedMockPortalUrl('https://evil.example/mock-government-page-without-api.vercel.app', 'MOCK_GOVERNMENT_URL'),
    /not allowlisted/,
  );
  assert.throws(
    () => assertAllowedMockPortalUrl('javascript:alert(1)', 'MOCK_GOVERNMENT_URL'),
    /not a valid http\(s\)/,
  );
});

test('worker start check accepts defaults and localhost overrides', (t) => {
  setEnv(t, 'MOCK_GOVERNMENT_URL', undefined);
  setEnv(t, 'MOCK_TRANSPORTATION_URL', undefined);
  assert.doesNotThrow(() => assertMockPortalUrls());

  setEnv(t, 'MOCK_GOVERNMENT_URL', 'http://localhost:3001/gov');
  setEnv(t, 'MOCK_TRANSPORTATION_URL', 'http://127.0.0.1:3002/dot');
  assert.doesNotThrow(() => assertMockPortalUrls());
});

test('worker start check refuses a missing resolved URL or a live city override', (t) => {
  setEnv(t, 'MOCK_GOVERNMENT_URL', 'https://seeclickfix.com/baltimore');
  assert.throws(() => assertMockPortalUrls(), /MOCK_GOVERNMENT_URL host "seeclickfix.com" is not allowlisted/);

  setEnv(t, 'MOCK_GOVERNMENT_URL', undefined);
  setEnv(t, 'MOCK_TRANSPORTATION_URL', 'https://311.baltimorecity.gov');
  assert.throws(() => assertMockPortalUrls(), /MOCK_TRANSPORTATION_URL/);
});

test('agency routes keep demo defaults and refuse a non-allowlisted env override', (t) => {
  setEnv(t, 'MOCK_GOVERNMENT_URL', undefined);
  setEnv(t, 'MOCK_TRANSPORTATION_URL', undefined);
  assert.match(mockAgencyRoute('general').url, /mock-government-page-without-api/);
  assert.match(mockAgencyRoute('transportation').url, /mock-second-gov-site-transportation/);

  setEnv(t, 'MOCK_GOVERNMENT_URL', 'https://citistat.baltimorecity.gov/');
  assert.throws(() => mockAgencyRoute('general'), /not allowlisted/);
  assert.throws(
    () => routeIncident({
      category: 'trash_and_sanitation',
      incident_type: 'illegal_dumping',
      short_label: 'Trash',
      routing_disposition: '311',
    }),
    /not allowlisted/,
  );
});

test('resolveMockPortalUrl uses the fallback only when the env value is absent', (t) => {
  setEnv(t, 'MOCK_GOVERNMENT_URL', undefined);
  assert.equal(
    resolveMockPortalUrl('MOCK_GOVERNMENT_URL', 'https://mock-government-page-without-api.vercel.app/'),
    'https://mock-government-page-without-api.vercel.app/',
  );

  setEnv(t, 'MOCK_GOVERNMENT_URL', 'http://localhost/custom');
  assert.equal(
    resolveMockPortalUrl('MOCK_GOVERNMENT_URL', 'https://mock-government-page-without-api.vercel.app/'),
    'http://localhost/custom',
  );
});
