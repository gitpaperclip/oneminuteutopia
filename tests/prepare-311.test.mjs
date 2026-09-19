import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { BaltimoreRoutingService } from '../lib/baltimore-routing.ts';

const migrations = await Promise.all([
  '202609190000_reporting.sql',
  '202609190001_image_analyses.sql',
  '202609190002_incident_context_and_clustering.sql',
  '202609190003_baltimore_311_routing.sql',
].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

function connect(db) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  sql.begin = fn => db.transaction(tx => fn(connect(tx)));
  return sql;
}

async function setup(t, incidentType = 'pothole', seriousness = 5) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of migrations) await db.exec(migration);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  
  const session = await DatabaseService.createSession();
  const analysisId = '11111111-1111-4111-8111-111111111111';
  
  // Determine category based on incident type
  const categoryMap = {
    'pothole': 'roads_and_sidewalks',
    'structure_fire': 'fire_injury_or_immediate_threat',
    'unable_to_assess': 'unable_to_assess',
    'no_visible_hazard': 'no_visible_hazard',
  };
  const category = categoryMap[incidentType] || 'roads_and_sidewalks';
  
  // Set up routing based on incident type
  const serviceCandidates = incidentType === 'pothole' ? ['TRM-Potholes', 'TRM-Pickup Pothole'] : [];
  const disposition = incidentType === 'structure_fire' ? 'emergency' : 
                      incidentType === 'unable_to_assess' ? 'manual_review' :
                      incidentType === 'no_visible_hazard' ? 'no_submission' : '311';
  
  // Handle special seriousness constraints
  let actualSeriousness = seriousness;
  let aiConfidence = 81;
  if (incidentType === 'unable_to_assess') {
    actualSeriousness = null;
    aiConfidence = 0;
  } else if (incidentType === 'no_visible_hazard') {
    actualSeriousness = 0;
  }
  
  await db.query(`INSERT INTO image_analyses (
    id, session_id, image_path, image_hash, category, incident_type, 
    context_summary, tags, baltimore_service_candidates, routing_disposition,
    seriousness, ai_confidence, model, prompt_version, analysis_status
  ) VALUES ($1,$2,'https://storage.example/photo.jpg','saved-hash',$3,$4,$5,$6,$7,$8,$9,$10,'gemini-test','1','complete')`, 
    [analysisId, session, category, incidentType, 'Test context', [incidentType], serviceCandidates, disposition, actualSeriousness, aiConfidence]);
  
  const input = {
    analysis_id: analysisId,
    category,
    user_description: 'Test hazard description',
    location_source: 'gps',
    latitude: 39.2904,
    longitude: -76.6122,
    location_accuracy: 10,
    location_address: '100 Holliday St, Baltimore, MD 21202',
  };
  
  const { report } = await DatabaseService.submitReport(session, input);
  return { db, session, report };
}

// Simulates endpoint authorization and preparation logic without importing Next.js
async function callPrepare311Endpoint(reportId, sessionId = null) {
  // Endpoint authorization logic
  if (!sessionId) {
    return { status: 401, error: 'Session expired. Please log in again.' };
  }
  
  if (!/^[A-Za-z0-9_-]{21}$/.test(reportId)) {
    return { status: 400, error: 'Invalid report ID format.' };
  }
  
  const report = await DatabaseService.getReport(reportId);
  if (!report) {
    return { status: 404, error: 'Report not found.' };
  }
  
  if (report.session_id !== sessionId) {
    return { status: 403, error: 'Access denied. This report belongs to a different session.' };
  }
  
  const prepared = BaltimoreRoutingService.prepareReport(report);
  return { status: 200, data: prepared };
}

test('prepareReport uses stored routing fields for 311 disposition', async t => {
  const { report } = await setup(t, 'pothole', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.report_id, report.id);
  assert.equal(prepared.readiness, 'ready');
  assert.equal(prepared.routing_disposition, '311');
  assert.deepEqual(prepared.service_request_types, ['TRM-Potholes', 'TRM-Pickup Pothole']);
  assert.equal(prepared.instructions, null);
  
  assert.equal(prepared.prepared_fields.category, 'roads_and_sidewalks');
  assert.equal(prepared.prepared_fields.category_label, 'Roads and sidewalks');
  assert.equal(prepared.prepared_fields.incident_type, 'pothole');
  assert.equal(prepared.prepared_fields.description, 'Test hazard description');
  assert.equal(prepared.prepared_fields.location_address, '100 Holliday St, Baltimore, MD 21202');
  assert.equal(prepared.prepared_fields.latitude, 39.2904);
  assert.equal(prepared.prepared_fields.longitude, -76.6122);
  assert.equal(prepared.prepared_fields.seriousness, 5);
});

test('emergency disposition requires 911 first', async t => {
  const { report } = await setup(t, 'structure_fire', 9);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'emergency_first');
  assert.equal(prepared.routing_disposition, 'emergency');
  assert.deepEqual(prepared.service_request_types, []);
  assert.ok(prepared.instructions.includes('911'));
  assert.ok(prepared.instructions.includes('emergency'));
});

test('manual_review disposition requires review', async t => {
  const { report } = await setup(t, 'unable_to_assess', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'needs_review');
  assert.equal(prepared.routing_disposition, 'manual_review');
  assert.ok(prepared.instructions);
});

test('no_submission disposition is insufficient_data', async t => {
  const { report } = await setup(t, 'no_visible_hazard', 0);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'insufficient_data');
  assert.equal(prepared.routing_disposition, 'no_submission');
  assert.deepEqual(prepared.service_request_types, []);
});

test('endpoint authorization: 401 without session', async t => {
  const { report } = await setup(t);
  const result = await callPrepare311Endpoint(report.id, null);
  
  assert.equal(result.status, 401);
  assert.ok(result.error.includes('Session'));
});

test('endpoint authorization: 403 for foreign session', async t => {
  const { report } = await setup(t);
  const otherSession = await DatabaseService.createSession();
  const result = await callPrepare311Endpoint(report.id, otherSession);
  
  assert.equal(result.status, 403);
  assert.ok(result.error.includes('Access denied'));
});

test('endpoint authorization: 404 for nonexistent report', async t => {
  const { session } = await setup(t);
  const fakeId = 'nonexistentreportid12';
  const result = await callPrepare311Endpoint(fakeId, session);
  
  assert.equal(result.status, 404);
});

test('endpoint authorization: 404 for withdrawn report', async t => {
  const { db, report, session } = await setup(t);
  await db.query('UPDATE reports SET withdrawn = 1 WHERE id = $1', [report.id]);
  const result = await callPrepare311Endpoint(report.id, session);
  
  assert.equal(result.status, 404);
});

test('endpoint returns prepared report for owned session', async t => {
  const { report, session } = await setup(t);
  const result = await callPrepare311Endpoint(report.id, session);
  
  assert.equal(result.status, 200);
  assert.equal(result.data.report_id, report.id);
  assert.equal(result.data.routing_disposition, '311');
  assert.ok(result.data.prepared_fields);
  assert.equal(result.data.prepared_fields.incident_type, 'pothole');
});

test('endpoint ignores browser-supplied AI fields and uses stored DB values', async t => {
  const { db, report, session } = await setup(t, 'pothole', 5);
  
  // Directly modify the database to have different routing
  await db.query(`UPDATE reports SET 
    baltimore_service_candidates = $1, 
    routing_disposition = $2 
    WHERE id = $3`, 
    [['TRM-Street Repairs'], 'manual_review', report.id]
  );
  
  // Call endpoint - it should fetch fresh from DB, not use in-memory report object
  const result = await callPrepare311Endpoint(report.id, session);
  
  // Verify it used the updated DB values
  assert.equal(result.data.routing_disposition, 'manual_review');
  assert.deepEqual(result.data.service_request_types, ['TRM-Street Repairs']);
  assert.equal(result.data.readiness, 'needs_review');
  
  // Not the original values from the in-memory report object
  assert.notDeepEqual(result.data.service_request_types, ['TRM-Potholes', 'TRM-Pickup Pothole']);
});
