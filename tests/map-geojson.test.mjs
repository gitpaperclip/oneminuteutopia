import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSING_SERIOUSNESS_COLOR,
  incidentsToGeoJSON,
  pointColorExpression,
  seriousnessProperty,
} from '../lib/map-geojson.ts';

const pin = {
  id: 'inc_1',
  category: 'roads_and_sidewalks',
  incident_type: 'pothole',
  short_label: 'Roads and sidewalks',
  full_description: 'Hole in the lane',
  latitude: 39.2904,
  longitude: -76.6122,
  location_address: null,
  status: 'reported',
  severity: 'normal',
  evidence_count: 1,
  confirmation_count: 0,
  highest_seriousness: null,
  average_ai_confidence: null,
  tags: ['pothole'],
  routing_disposition: '311',
  created_at: 1,
  updated_at: 1,
  last_reported_at: 1,
  is_super_report: false,
};

test('GeoJSON coordinates are [longitude, latitude]', () => {
  const geo = incidentsToGeoJSON([pin], () => false);
  assert.deepEqual(geo.features[0].geometry.coordinates, [-76.6122, 39.2904]);
});

test('missing seriousness is omitted and not coerced to 0', () => {
  assert.equal(seriousnessProperty(null), undefined);
  assert.equal(seriousnessProperty(undefined), undefined);
  assert.equal(seriousnessProperty(Number.NaN), undefined);
  assert.equal(seriousnessProperty(0), 0);
  const geo = incidentsToGeoJSON([pin], () => false);
  assert.equal('seriousness' in geo.features[0].properties, false);
});

test('point color expression falls back to gray, not low-risk blue', () => {
  const expression = JSON.stringify(pointColorExpression());
  assert.match(expression, new RegExp(MISSING_SERIOUSNESS_COLOR));
  assert.equal(expression.includes('"#2563eb"]'), false);
});
