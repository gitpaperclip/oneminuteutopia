import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { validateReportInput } from '../lib/report-input.ts';
import { toMapIncident } from '../lib/map-incident-types.ts';

const migrations = await Promise.all([
  '202609190000_reporting.sql',
  '202609190001_image_analyses.sql',
  '202609190002_incident_context_and_clustering.sql',
  '202609190003_baltimore_311_routing.sql',
  '202609190004_mock_government_submission.sql',
  '202609190005_incident_confirmations.sql',
  '202609190006_mock_agency.sql',
  '202609190007_reports_realtime.sql',
  '202609190008_incident_scoring.sql',
].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

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

async function insertAnalysis(db, { id, session }) {
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type,
    seriousness, ai_confidence, context_summary, context_tags, tags, model, prompt_version)
    VALUES ($1,$2,$3,$4,'roads_and_sidewalks','pothole',
    6,81,'A civic issue is visible.',array['roadway'],array['pothole','roadway'],'gemini-test','2')`,
  [id, session, `https://storage.example/${id}.jpg`, `saved-hash-${id}`]);
}

test('confirmations increment confirmation_count without changing evidence', async t => {
  const { db } = await setup(t);
  const reporter = await DatabaseService.createSession();
  const viewerA = await DatabaseService.createSession();
  const viewerB = await DatabaseService.createSession();
  await insertAnalysis(db, { id: '11111111-1111-4111-8111-111111111111', session: reporter });
  const { report } = await DatabaseService.submitReport(reporter, validateReportInput({
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    location_source: 'gps',
    latitude: 39.2904,
    longitude: -76.6122,
    location_accuracy: 8,
  }));
  const incidentId = report.incident_id;
  const before = await DatabaseService.getIncident(incidentId);
  assert.equal(before.evidence_count, 1);
  assert.equal(before.confirmation_count, 0);
  assert.equal(toMapIncident(before).is_super_report, false);

  const first = await DatabaseService.confirmIncident(incidentId, viewerA);
  assert.equal(first.confirmation_count, 1);
  assert.equal(first.viewer_confirmed, true);
  assert.equal(first.evidence_count, 1);

  const again = await DatabaseService.confirmIncident(incidentId, viewerA);
  assert.equal(again.confirmation_count, 1);
  assert.equal(again.evidence_count, 1);

  const second = await DatabaseService.confirmIncident(incidentId, viewerB);
  assert.equal(second.confirmation_count, 2);
  assert.equal(second.evidence_count, 1);

  const after = await DatabaseService.getIncident(incidentId);
  assert.equal(after.evidence_count, 1);
  assert.equal(after.confirmation_count, 2);
  assert.equal(after.status, before.status);
  assert.equal(after.routing_disposition, before.routing_disposition);
  assert.equal(after.highest_seriousness, before.highest_seriousness);
  assert.equal(toMapIncident(after).is_super_report, false);

  const reports = await DatabaseService.getIncidentReports(incidentId);
  assert.equal(reports.length, 1);

  const removed = await DatabaseService.unconfirmIncident(incidentId, viewerA);
  assert.equal(removed.confirmation_count, 1);
  assert.equal(removed.viewer_confirmed, false);
  assert.equal(removed.evidence_count, 1);

  const state = await DatabaseService.getIncidentConfirmation(incidentId, viewerA);
  assert.deepEqual(state, { confirmation_count: 1, viewer_confirmed: false });
  const still = await DatabaseService.getIncidentConfirmation(incidentId, viewerB);
  assert.deepEqual(still, { confirmation_count: 1, viewer_confirmed: true });
});

test('unknown incident confirmation is not found', async t => {
  await setup(t);
  const session = await DatabaseService.createSession();
  await assert.rejects(
    () => DatabaseService.confirmIncident('not-a-real-incident-id', session),
    error => error.status === 404,
  );
});

test('confirming without the confirmations migration is a clear schema error', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of migrations.slice(0, 5)) await db.exec(migration);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  const reporter = await DatabaseService.createSession();
  const viewer = await DatabaseService.createSession();
  await insertAnalysis(db, { id: '22222222-2222-4222-8222-222222222222', session: reporter });
  const { report } = await DatabaseService.submitReport(reporter, validateReportInput({
    analysis_id: '22222222-2222-4222-8222-222222222222',
    category: 'roads_and_sidewalks',
    location_source: 'gps',
    latitude: 39.2904,
    longitude: -76.6122,
    location_accuracy: 8,
  }));
  await assert.rejects(
    () => DatabaseService.confirmIncident(report.incident_id, viewer),
    error => error.status === 503 && /incident_confirmations/.test(error.message),
  );
});
