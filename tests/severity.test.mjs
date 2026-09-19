import test from 'node:test';
import assert from 'node:assert/strict';
import { severityStyle, severityTone } from '../lib/severity.ts';

test('severity labels use Low / Medium / High / Critical risk', () => {
  assert.equal(severityStyle(1).label, 'Low risk');
  assert.equal(severityStyle(3).label, 'Low risk');
  assert.equal(severityStyle(4).label, 'Medium risk');
  assert.equal(severityStyle(6).label, 'Medium risk');
  assert.equal(severityStyle(7).label, 'High risk');
  assert.equal(severityStyle(8).label, 'High risk');
  assert.equal(severityStyle(9).label, 'Critical risk');
  assert.equal(severityStyle(10).label, 'Critical risk');
  assert.equal(severityStyle(null).label, 'Unscored');
  assert.equal(severityTone(2), 'blue');
  assert.equal(severityTone(5), 'teal');
  assert.equal(severityTone(8), 'amber');
  assert.equal(severityTone(10), 'red');
});

test('severity labels never use bare Low / Moderate / Notable', () => {
  for (const score of [1, 4, 6, 8, 10]) {
    assert.match(severityStyle(score).label, /risk$/);
    assert.equal(/^(Low|Moderate|Notable|High|Critical)$/.test(severityStyle(score).label), false);
  }
});
