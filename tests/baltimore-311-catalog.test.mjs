import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchBaltimore311ServiceCatalog, isInternalBaltimoreService,
} from '../lib/baltimore-311-catalog.ts';

test('official Baltimore service rows are deduplicated and agency names are normalized', async () => {
  const fetcher = async () => new Response(JSON.stringify({ features: [
    { attributes: { SRType: 'TRM-Potholes', Agency: ' Transportation  ' } },
    { attributes: { SRType: 'TRM-Potholes', Agency: 'Transportation' } },
    { attributes: { SRType: 'SW-Dirty Alley', Agency: 'Solid Waste' } },
    { attributes: { SRType: 'SW-Dirty Alley Proactive', Agency: 'Solid Waste' } },
  ] }));
  const services = await fetchBaltimore311ServiceCatalog(fetcher);
  assert.deepEqual(services, [
    { service_type: 'SW-Dirty Alley', agencies: ['Solid Waste'], internal_only: false },
    { service_type: 'SW-Dirty Alley Proactive', agencies: ['Solid Waste'], internal_only: true },
    { service_type: 'TRM-Potholes', agencies: ['Transportation'], internal_only: false },
  ]);
});

test('known operational-only labels are excluded from the public catalog by default', () => {
  assert.equal(isInternalBaltimoreService('TEC-Street Repair (Misc) - (Internal DOT USE ONLY)'), true);
  assert.equal(isInternalBaltimoreService('SW-Rat Rubout Follow-up'), true);
  assert.equal(isInternalBaltimoreService('TRM-Potholes'), false);
});
