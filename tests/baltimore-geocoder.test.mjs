import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBaltimoreCandidates } from '../lib/baltimore-geocoder.ts';

test('Baltimore geocoder candidates become deduplicated map coordinates', () => {
  const suggestions = parseBaltimoreCandidates({ candidates: [
    { address: '100 HOLLIDAY ST, Baltimore, MD', score: 97.5, location: { x: -76.6105, y: 39.2909 } },
    { address: '100 HOLLIDAY ST, Baltimore, MD', score: 96, location: { x: -76.6104, y: 39.2908 } },
    { address: 'Washington, DC', score: 100, location: { x: -77.0369, y: 38.9072 } },
    { address: 'Weak match', score: 25, location: { x: -76.61, y: 39.29 } },
  ] });

  assert.deepEqual(suggestions, [{
    address: '100 HOLLIDAY ST, Baltimore, MD',
    latitude: 39.2909,
    longitude: -76.6105,
  }]);
});

test('malformed geocoder responses are ignored', () => {
  assert.deepEqual(parseBaltimoreCandidates(null), []);
  assert.deepEqual(parseBaltimoreCandidates({ candidates: [{ address: 'No coordinates', score: 100 }] }), []);
});
