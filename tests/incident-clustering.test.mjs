import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUSTER_ACCURACY_MULTIPLIER,
  MAX_CLUSTER_RADIUS_METERS,
  MIN_CLUSTER_RADIUS_METERS,
  chooseKeeperIncident,
  clusterRadiusMeters,
  distanceMeters,
  locationCirclesOverlap,
  overlappingIncidentIds,
  shiftLatitude,
} from '../lib/incident-clustering.ts';

const origin = { latitude: 39.29, longitude: -76.61 };

test('2× accuracy is the clustering radius, with a 25m floor and 250m cap', () => {
  assert.equal(CLUSTER_ACCURACY_MULTIPLIER, 2);
  assert.equal(clusterRadiusMeters(10), MIN_CLUSTER_RADIUS_METERS);
  assert.equal(clusterRadiusMeters(20), 40);
  assert.equal(clusterRadiusMeters(80), 160);
  assert.equal(clusterRadiusMeters(200), MAX_CLUSTER_RADIUS_METERS);
  assert.equal(clusterRadiusMeters(null), MIN_CLUSTER_RADIUS_METERS);
  assert.equal(clusterRadiusMeters(0), MIN_CLUSTER_RADIUS_METERS);
});

test('1× accuracy misses typical same-spot GPS jitter; 3× swallows unrelated blocks', () => {
  const here = { ...origin, location_accuracy: 15 };
  const jitter = { latitude: shiftLatitude(origin.latitude, 40), longitude: origin.longitude, location_accuracy: 15 };
  assert.equal(distanceMeters(here.latitude, here.longitude, jitter.latitude, jitter.longitude) > 39, true);
  assert.equal(15 + 15 < 40, true, 'raw 1× circles of 15m do not cover 40m of phone jitter');
  assert.equal(locationCirclesOverlap(here, jitter), true, '2× (30m + 30m) covers the same pothole');

  const west = { ...origin, location_accuracy: 80 };
  const blockAway = {
    latitude: shiftLatitude(origin.latitude, 400),
    longitude: origin.longitude,
    location_accuracy: 80,
  };
  assert.equal(3 * 80 + 3 * 80 > 400, true, 'raw 3× circles of 80m would merge reports 400m apart');
  assert.equal(locationCirclesOverlap(west, blockAway), false, 'capped 2× does not merge a distant block');
});

test('two reports are the same incident when their accuracy circles overlap', () => {
  const first = { ...origin, location_accuracy: 20 };
  const overlapping = {
    latitude: shiftLatitude(origin.latitude, 70),
    longitude: origin.longitude,
    location_accuracy: 20,
  };
  const separate = {
    latitude: shiftLatitude(origin.latitude, 90),
    longitude: origin.longitude,
    location_accuracy: 20,
  };
  assert.equal(locationCirclesOverlap(first, overlapping), true);
  assert.equal(locationCirclesOverlap(first, separate), false);
});

test('A overlapping B and B overlapping D puts A, B, and D in one incident', () => {
  const reportA = { incident_id: 'A', ...origin, location_accuracy: 20 };
  const reportB = {
    incident_id: 'B',
    latitude: shiftLatitude(origin.latitude, 70),
    longitude: origin.longitude,
    location_accuracy: 20,
  };
  const reportD = {
    incident_id: 'D',
    latitude: shiftLatitude(origin.latitude, 140),
    longitude: origin.longitude,
    location_accuracy: 20,
  };
  assert.equal(locationCirclesOverlap(reportA, reportB), true);
  assert.equal(locationCirclesOverlap(reportB, reportD), true);
  assert.equal(locationCirclesOverlap(reportA, reportD), false);

  const bridge = overlappingIncidentIds(reportB, [reportA, reportD]);
  assert.deepEqual(new Set(bridge), new Set(['A', 'D']));
  assert.equal(chooseKeeperIncident([
    { id: 'D', created_at: 30 },
    { id: 'A', created_at: 10 },
    { id: 'B', created_at: 20 },
  ]).id, 'A');
});
