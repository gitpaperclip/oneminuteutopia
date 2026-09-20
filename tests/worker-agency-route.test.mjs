import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIncident } from '../worker/src/agency-route.ts';

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
    mock_agency: null,
    ...overrides,
  };
}

test('roads and sidewalks file to the transportation mock site', () => {
  const route = routeIncident(incident());
  assert.equal(route?.agency, 'transportation');
  assert.equal(route?.openButtonName, 'Report a Roadway Hazard');
  assert.match(route?.url ?? '', /mock-second-gov-site-transportation/);
});

test('streetlights file to the transportation mock site', () => {
  const route = routeIncident(incident({
    category: 'traffic_signals_and_streetlights',
    incident_type: 'broken_streetlight',
    short_label: 'Traffic signals and streetlights',
  }));
  assert.equal(route?.agency, 'transportation');
});

test('litter and sanitation file to the general City 311 mock site', () => {
  const route = routeIncident(incident({
    category: 'trash_and_sanitation',
    incident_type: 'illegal_dumping',
    short_label: 'Trash and sanitation',
  }));
  assert.equal(route?.agency, 'general');
  assert.equal(route?.openButtonName, 'Report an Issue');
  assert.match(route?.url ?? '', /mock-government-page-without-api/);
});

test('other hazard with a pothole description files to transportation', () => {
  const route = routeIncident(
    incident({
      category: 'other_hazard',
      incident_type: 'other_hazard',
      short_label: 'Other hazard',
    }),
    'Large pothole in the travel lane',
  );
  assert.equal(route?.agency, 'transportation');
});

test('other hazard without a roadway hint files to general 311', () => {
  const route = routeIncident(
    incident({
      category: 'other_hazard',
      incident_type: 'other_hazard',
      short_label: 'Other hazard',
    }),
    'Graffiti on a park bench',
  );
  assert.equal(route?.agency, 'general');
});

test('fires and other civic issues file to the general City 311 mock site', () => {
  assert.equal(routeIncident(incident({
    category: 'fire_injury_or_immediate_threat',
    incident_type: 'structure_fire',
    routing_disposition: 'emergency',
  }))?.agency, 'general');
  assert.equal(routeIncident(incident({ category: 'no_visible_hazard' }))?.agency, 'general');
  assert.equal(routeIncident(incident({ routing_disposition: 'emergency' }))?.agency, 'transportation');
  assert.equal(routeIncident(incident({ routing_disposition: 'no_submission' }))?.agency, 'transportation');
});
