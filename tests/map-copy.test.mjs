import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmationTotalLabel,
  humanizeSlug,
  incidentSheetDescription,
  incidentSheetTitle,
  superReportBadge,
} from '../lib/map-copy.ts';

test('sheet title prefers a specific incident type over a category duplicate', () => {
  assert.equal(incidentSheetTitle({
    short_label: 'Roads and sidewalks',
    incident_type: 'pothole',
    category: 'roads_and_sidewalks',
  }), 'Pothole');
});

test('sheet title uses short_label when the type is unspecified', () => {
  assert.equal(incidentSheetTitle({
    short_label: 'Roads and sidewalks',
    incident_type: 'roads_and_sidewalks_unspecified',
    category: 'roads_and_sidewalks',
  }), 'Roads and sidewalks');
});

test('sheet description is the human note, not taxonomy tags', () => {
  assert.equal(incidentSheetDescription({ full_description: '  Deep hole on E Pratt  ' }), 'Deep hole on E Pratt');
  assert.equal(incidentSheetDescription({ full_description: '   ' }), null);
});

test('super-report badge uses Super-report (N)', () => {
  assert.equal(superReportBadge(2), 'Super-report (2)');
  assert.notEqual(superReportBadge(2), 'Super-report · 2 evidence');
});

test('confirmation copy is a count, not a vote', () => {
  assert.equal(confirmationTotalLabel(0), '0 community confirmations');
  assert.equal(confirmationTotalLabel(1), '1 community confirmation');
  assert.equal(confirmationTotalLabel(12), '12 community confirmations');
  assert.equal(humanizeSlug('illegal_dumping'), 'Illegal Dumping');
});
