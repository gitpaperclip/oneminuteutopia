import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_COPY,
  confirmationTotalLabel,
  humanizeSlug,
  incidentSheetDescription,
  incidentSheetTitle,
  superReportBadge,
} from '../lib/map-copy.ts';
import { confirmationsUnavailableMessage, isMissingConfirmationsSchema } from '../lib/confirmation-schema.ts';

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
  assert.equal(MAP_COPY.seeThisToo, 'I see this too');
  assert.equal(MAP_COPY.unseeThis, 'Unsee');
});

test('missing confirmation table is a clear schema error', () => {
  assert.equal(isMissingConfirmationsSchema({ code: '42P01', message: 'relation "incident_confirmations" does not exist' }), true);
  assert.equal(isMissingConfirmationsSchema({ code: '42703', message: 'column "confirmation_count" does not exist' }), true);
  assert.equal(isMissingConfirmationsSchema(new Error('timeout')), false);
  assert.match(confirmationsUnavailableMessage(), /incident_confirmations/);
});
