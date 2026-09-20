import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMockFormPayload } from '../worker/src/form-payload.ts';
import { isReadyForMockFiling, skipReason } from '../worker/src/ready-incidents.ts';

function incident(overrides = {}) {
  return {
    id: 'incident-1',
    category: 'roads_and_sidewalks',
    incident_type: 'roads_and_sidewalks_unspecified',
    short_label: 'Roads and sidewalks',
    evidence_count: 2,
    latitude: 39.29,
    longitude: -76.61,
    location_address: 'Main St',
    routing_disposition: '311',
    status: 'reported',
    mock_reference_id: null,
    mock_submitted_at: null,
    mock_status: 'pending',
    mock_error: null,
    incident_score: 0.8,
    government_report_status: 'ready_to_submit',
    ...overrides,
  };
}

test('worker files when incident_score meets the government threshold', () => {
  assert.equal(isReadyForMockFiling(incident()), true);
  assert.equal(skipReason(incident()), null);
});

test('worker files a clustered incident with GPS and no mock confirmation', () => {
  assert.equal(isReadyForMockFiling(incident()), true);
  assert.equal(skipReason(incident()), null);
});

test('worker skips incidents below the government score threshold', () => {
  const row = incident({ incident_score: 0.19, government_report_status: 'not_ready', evidence_count: 1 });
  assert.equal(isReadyForMockFiling(row), false);
  assert.match(skipReason(row) ?? '', /incident_score 0.19/);
});

test('worker files a single severe incident above the threshold', () => {
  const row = incident({
    evidence_count: 1,
    incident_score: 0.855,
    government_report_status: 'ready_to_submit',
  });
  assert.equal(isReadyForMockFiling(row), true);
});

test('worker falls back to evidence_count when incident_score is missing', () => {
  const row = incident({
    incident_score: null,
    government_report_status: 'not_ready',
    evidence_count: 1,
  });
  assert.equal(isReadyForMockFiling(row), false);
  assert.match(skipReason(row) ?? '', /evidence_count 1/);
});

test('worker files on evidence_count when score is missing and the cluster exists', () => {
  const row = incident({
    incident_score: null,
    government_report_status: 'not_ready',
    evidence_count: 2,
  });
  assert.equal(isReadyForMockFiling(row), true);
});

test('worker files emergency incidents when the score is above the threshold', () => {
  const row = incident({
    category: 'fire_injury_or_immediate_threat',
    incident_type: 'structure_fire',
    routing_disposition: 'emergency',
    evidence_count: 1,
    incident_score: 0.99,
    government_report_status: 'ready_to_submit',
  });
  assert.equal(isReadyForMockFiling(row), true);
  assert.equal(skipReason(row), null);
});

test('worker skips not-reportable incidents below the score threshold', () => {
  const row = incident({
    routing_disposition: 'no_submission',
    incident_score: 0,
    government_report_status: 'not_ready',
    evidence_count: 1,
  });
  assert.equal(isReadyForMockFiling(row), false);
  assert.match(skipReason(row) ?? '', /incident_score 0/);
});

test('worker skips incidents that already have a mock reference id', () => {
  const row = incident({ mock_reference_id: 'MOCK-123', mock_status: 'submitted' });
  assert.equal(isReadyForMockFiling(row), false);
  assert.match(skipReason(row) ?? '', /already submitted/);
});

test('worker skips a previous failed mock filing so it does not reopen the browser every poll', () => {
  const row = incident({ mock_status: 'failed', mock_error: 'timeout' });
  assert.equal(isReadyForMockFiling(row), false);
  assert.equal(skipReason(row), 'previous mock filing failed');
});

test('worker skips incidents without coordinates', () => {
  const row = incident({ latitude: null, longitude: null });
  assert.equal(isReadyForMockFiling(row), false);
  assert.equal(skipReason(row), 'missing latitude/longitude');
});


test('worker builds mock form fields from the incident and first attached report', () => {
  const payload = buildMockFormPayload(incident(), [
    {
      image_path: 'https://storage.example/pothole.jpg',
      user_description: 'Large pothole',
      context_summary: 'Broken asphalt in the travel lane.',
      location_address: 'Main St',
    },
  ]);
  assert.equal(payload.latitude, '39.29');
  assert.equal(payload.longitude, '-76.61');
  assert.equal(payload.photoUrl, 'https://storage.example/pothole.jpg');
  assert.match(payload.description, /roads_and_sidewalks_unspecified \(2 nearby reports\)/);
  assert.match(payload.description, /Large pothole/);
});
