import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { validateReportInput } from '../lib/report-input.ts';
import { HttpError } from '../lib/hazard-analysis.mjs';
import {
  parseBboxQuery, parseBooleanQuery, parseLimitQuery, sliceIncidentsPage,
  toMapIncident, toPublicIncidentReports,
} from '../lib/map-incident-types.ts';

const migrations = await Promise.all([
  '202609190000_reporting.sql',
  '202609190001_image_analyses.sql',
  '202609190002_incident_context_and_clustering.sql',
  '202609190003_baltimore_311_routing.sql',
  '202609190004_mock_government_submission.sql',
  '202609190005_incident_confirmations.sql',
].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

const MAP_INCIDENT_KEYS = [
  'id', 'category', 'incident_type', 'short_label', 'full_description', 'latitude', 'longitude',
  'location_address', 'status', 'severity', 'evidence_count', 'confirmation_count',
  'highest_seriousness', 'average_ai_confidence', 'tags', 'routing_disposition',
  'created_at', 'updated_at', 'last_reported_at', 'is_super_report',
];

function connect(db) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  sql.begin = fn => db.transaction(tx => fn(connect(tx)));
  return sql;
}

async function setup(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of migrations) await db.exec(migration);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  return { db };
}

async function insertAnalysis(db, { id, session, incidentType = 'pothole', category = 'roads_and_sidewalks', seriousness = 6, confidence = 81 }) {
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type,
    seriousness, ai_confidence, context_summary, context_tags, tags, model, prompt_version)
    VALUES ($1,$2,$3,$4,$5,$6,
    $7,$8,'A civic issue is visible.',array['roadway'],array[$6,'roadway'],'gemini-test','2')`,
  [id, session, `https://storage.example/${id}.jpg`, `saved-hash-${id}`, category, incidentType, seriousness, confidence]);
}

function gpsInput(analysisId, latitude, longitude) {
  return validateReportInput({
    analysis_id: analysisId, category: 'roads_and_sidewalks', location_source: 'gps',
    latitude, longitude, location_accuracy: 8,
  });
}

function assertMapIncidentShape(incident) {
  assert.deepEqual(Object.keys(incident).sort(), [...MAP_INCIDENT_KEYS].sort());
  assert.equal('credibility_score' in incident, false);
  assert.equal('session_id' in incident, false);
  assert.equal('baltimore_service_candidates' in incident, false);
}

function assertNoSessionLeak(value, sessionIds) {
  const json = JSON.stringify(value);
  assert.equal(json.includes('session_id'), false);
  for (const sessionId of sessionIds) assert.equal(json.includes(sessionId), false);
}

test('two nearby same-type reports become one mappable super-report', async t => {
  const { db } = await setup(t);
  const sessionA = await DatabaseService.createSession();
  const sessionB = await DatabaseService.createSession();
  await insertAnalysis(db, { id: '11111111-1111-4111-8111-111111111111', session: sessionA });
  await insertAnalysis(db, { id: '22222222-2222-4222-8222-222222222222', session: sessionB, seriousness: 8, confidence: 90 });

  const first = await DatabaseService.submitReport(sessionA, gpsInput('11111111-1111-4111-8111-111111111111', 39.2904, -76.6122));
  const second = await DatabaseService.submitReport(sessionB, gpsInput('22222222-2222-4222-8222-222222222222', 39.2908, -76.6122));
  assert.equal(second.report.incident_id, first.report.incident_id);

  const retry = await DatabaseService.submitReport(sessionA, gpsInput('11111111-1111-4111-8111-111111111111', 39.2904, -76.6122));
  assert.equal(retry.duplicate, true);

  const listed = await DatabaseService.listIncidents({ incidentType: 'pothole', commonOnly: true });
  assert.equal(listed.length, 1);
  const mapped = toMapIncident(listed[0]);
  assertMapIncidentShape(mapped);
  assert.equal(mapped.id, first.report.incident_id);
  assert.equal(mapped.evidence_count, 2);
  assert.equal(mapped.confirmation_count, 0);
  assert.equal(mapped.is_super_report, true);
  assert.equal(mapped.latitude !== null && mapped.longitude !== null, true);
  assertNoSessionLeak({ incidents: [mapped] }, [sessionA, sessionB]);
});

test('default list omits unlocated incidents unless include_unlocated=true', async t => {
  const { db } = await setup(t);
  const locatedSession = await DatabaseService.createSession();
  const unlocatedSession = await DatabaseService.createSession();
  await insertAnalysis(db, { id: '11111111-1111-4111-8111-111111111111', session: locatedSession });
  await insertAnalysis(db, { id: '22222222-2222-4222-8222-222222222222', session: unlocatedSession });

  const located = await DatabaseService.submitReport(locatedSession, gpsInput('11111111-1111-4111-8111-111111111111', 39.29, -76.61));
  const unlocated = await DatabaseService.submitReport(unlocatedSession, validateReportInput({
    analysis_id: '22222222-2222-4222-8222-222222222222', category: 'roads_and_sidewalks',
    location_source: 'manual', location_address: 'Main Street',
  }));

  const pins = await DatabaseService.listIncidents();
  assert.deepEqual(pins.map(item => item.id), [located.report.incident_id]);
  assert.equal(pins.every(item => item.latitude !== null && item.longitude !== null), true);

  const all = await DatabaseService.listIncidents({ includeUnlocated: true });
  assert.equal(all.length, 2);
  assert.ok(all.some(item => item.id === unlocated.report.incident_id && item.latitude === null));
});

test('bbox list returns only incidents inside the window', async t => {
  const { db } = await setup(t);
  const innerSession = await DatabaseService.createSession();
  const outerSession = await DatabaseService.createSession();
  await insertAnalysis(db, { id: '11111111-1111-4111-8111-111111111111', session: innerSession });
  await insertAnalysis(db, { id: '22222222-2222-4222-8222-222222222222', session: outerSession });

  const inner = await DatabaseService.submitReport(innerSession, gpsInput('11111111-1111-4111-8111-111111111111', 39.2904, -76.6122));
  const outer = await DatabaseService.submitReport(outerSession, gpsInput('22222222-2222-4222-8222-222222222222', 39.40, -76.70));
  assert.notEqual(inner.report.incident_id, outer.report.incident_id);

  const inside = await DatabaseService.listIncidents({
    minLat: 39.28, maxLat: 39.30, minLon: -76.62, maxLon: -76.60,
  });
  assert.deepEqual(inside.map(item => item.id), [inner.report.incident_id]);

  const aroundOuter = await DatabaseService.listIncidents({
    minLat: 39.39, maxLat: 39.41, minLon: -76.71, maxLon: -76.69,
  });
  assert.deepEqual(aroundOuter.map(item => item.id), [outer.report.incident_id]);
});

test('bbox and flag parsers reject inverted or non-numeric values', () => {
  assert.throws(() => parseBboxQuery(new URLSearchParams('min_lat=39&max_lat=38&min_lon=-77&max_lon=-76')), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    return /inverted/.test(error.message);
  });
  assert.throws(() => parseBboxQuery(new URLSearchParams('min_lat=39&max_lat=40&min_lon=not-a-number&max_lon=-76')), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    return /numbers/.test(error.message);
  });
  assert.throws(() => parseBboxQuery(new URLSearchParams('min_lat=39&max_lat=40')), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 400);
    return /requires/.test(error.message);
  });
  assert.deepEqual(parseBboxQuery(new URLSearchParams('min_lat=39&max_lat=40&min_lon=-77&max_lon=-76')), {
    minLat: 39, maxLat: 40, minLon: -77, maxLon: -76,
  });
  assert.equal(parseBboxQuery(new URLSearchParams()), undefined);
  assert.throws(() => parseBooleanQuery('yes', 'include_unlocated'), error => error.status === 400);
  assert.equal(parseBooleanQuery('true', 'include_unlocated'), true);
  assert.equal(parseLimitQuery(null), 50);
  assert.throws(() => parseLimitQuery('0'), error => error.status === 400);
  const page = sliceIncidentsPage(['a', 'b', 'c'], 2);
  assert.deepEqual(page.items, ['a', 'b']);
  assert.equal(page.truncated, true);
  assert.equal(sliceIncidentsPage(['a'], 2).truncated, false);
});

test('missing seriousness stays null on the public map incident', () => {
  const mapped = toMapIncident({
    id: 'incident-unscored',
    category: 'unable_to_assess',
    incident_type: 'unable_to_assess',
    short_label: 'Unable to assess',
    full_description: null,
    latitude: 39.29,
    longitude: -76.61,
    location_address: null,
    status: 'reported',
    severity: 'normal',
    evidence_count: 1,
    confirmation_count: 0,
    highest_seriousness: null,
    average_ai_confidence: null,
    tags: [],
    routing_disposition: 'manual_review',
    created_at: 1,
    updated_at: 1,
    last_reported_at: 1,
  });
  assert.equal(mapped.highest_seriousness, null);
  assert.equal(mapped.is_super_report, false);
});

test('public list and drill-down payloads never include session identifiers', async t => {
  const { db } = await setup(t);
  const session = await DatabaseService.createSession();
  await insertAnalysis(db, { id: '11111111-1111-4111-8111-111111111111', session });
  const { report } = await DatabaseService.submitReport(session, gpsInput('11111111-1111-4111-8111-111111111111', 39.29, -76.61));

  const [incident] = await DatabaseService.listIncidents();
  const listed = { incidents: [toMapIncident(incident)] };
  assertMapIncidentShape(listed.incidents[0]);
  assertNoSessionLeak(listed, [session]);

  const reports = await DatabaseService.getIncidentReports(report.incident_id);
  assert.equal(typeof reports[0].session_id, 'string');
  const publicReports = toPublicIncidentReports(reports);
  assert.equal('session_id' in publicReports[0], false);
  assert.equal('image_hash' in publicReports[0], false);
  assert.equal(publicReports[0].image_path.startsWith('https://'), true);
  assertNoSessionLeak({ incident: toMapIncident(incident), reports: publicReports }, [session]);
});
