import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayMockReference,
  mockAgencyLabel,
  parseMockReference,
} from '../lib/mock-agency.ts';

test('parseMockReference splits an agency-prefixed confirmation', () => {
  assert.deepEqual(parseMockReference('transportation:MOCK-99'), {
    agency: 'transportation',
    reference: 'MOCK-99',
  });
  assert.deepEqual(parseMockReference('general:ABC'), {
    agency: 'general',
    reference: 'ABC',
  });
  assert.deepEqual(parseMockReference('MOCK-99'), {
    agency: null,
    reference: 'MOCK-99',
  });
});

test('mockAgencyLabel prefers the stored agency then the reference prefix', () => {
  assert.equal(
    mockAgencyLabel('transportation', 'general:ABC'),
    'Riverton Department of Transportation',
  );
  assert.equal(mockAgencyLabel(null, 'general:ABC'), 'City 311');
  assert.equal(mockAgencyLabel(null, 'MOCK-99'), 'mock city portal');
});

test('displayMockReference strips the agency prefix for the receipt', () => {
  assert.equal(displayMockReference('transportation:MOCK-99'), 'MOCK-99');
  assert.equal(displayMockReference('MOCK-99'), 'MOCK-99');
});
