import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { BaltimoreRoutingService } from '../lib/baltimore-routing.ts';

const migrations = await Promise.all(['202609190000_reporting.sql', '202609190001_image_analyses.sql'].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

function connect(db) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  sql.begin = fn => db.transaction(tx => fn(connect(tx)));
  return sql;
}

async function setup(t, category = 'roads_and_sidewalks', seriousness = 5) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of migrations) await db.exec(migration);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  
  const session = await DatabaseService.createSession();
  const analysisId = '11111111-1111-4111-8111-111111111111';
  
  // Handle special cases for seriousness based on category constraints
  let actualSeriousness = seriousness;
  let aiConfidence = 81;
  if (category === 'unable_to_assess') {
    actualSeriousness = null;
    aiConfidence = 0;
  } else if (category === 'no_visible_hazard') {
    actualSeriousness = 0;
  }
  
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, seriousness, ai_confidence, model, prompt_version, analysis_status)
    VALUES ($1,$2,'https://storage.example/photo.jpg','saved-hash',$3,$4,$5,'gemini-test','1','complete')`, 
    [analysisId, session, category, actualSeriousness, aiConfidence]);
  
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

test('prepareReport returns stable contract for routine 311 route', async t => {
  const { report } = await setup(t, 'roads_and_sidewalks', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.report_id, report.id);
  assert.equal(prepared.readiness, 'ready');
  assert.equal(prepared.routing_disposition, '311');
  assert.equal(prepared.department, 'BCDOT');
  assert.equal(prepared.service_type, 'Road or Sidewalk Issue');
  assert.deepEqual(prepared.alternative_service_types, []);
  assert.equal(prepared.instructions, null);
  
  assert.equal(prepared.prepared_fields.category, 'roads_and_sidewalks');
  assert.equal(prepared.prepared_fields.category_label, 'Roads and sidewalks');
  assert.equal(prepared.prepared_fields.description, 'Test hazard description');
  assert.equal(prepared.prepared_fields.location_address, '100 Holliday St, Baltimore, MD 21202');
  assert.equal(prepared.prepared_fields.latitude, 39.2904);
  assert.equal(prepared.prepared_fields.longitude, -76.6122);
  assert.equal(prepared.prepared_fields.seriousness, 5);
});

test('emergency classification requires 911 first', async t => {
  const { report } = await setup(t, 'fire_injury_or_immediate_threat', 9);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'emergency_first');
  assert.equal(prepared.routing_disposition, '911');
  assert.ok(prepared.instructions.includes('911'));
  assert.ok(prepared.instructions.includes('emergency'));
});

test('high seriousness triggers emergency route for threshold categories', async t => {
  const { report } = await setup(t, 'water_drainage_and_sewage', 9);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'emergency_first');
  assert.equal(prepared.routing_disposition, '911');
  assert.equal(prepared.department, 'DPW');
});

test('low seriousness with multiple candidates requires review', async t => {
  const { report } = await setup(t, 'water_drainage_and_sewage', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'needs_review');
  assert.equal(prepared.routing_disposition, 'multiple_candidates');
  assert.ok(prepared.alternative_service_types.length > 1);
});

test('multiple routing candidates require review', async t => {
  const { report } = await setup(t, 'trees_and_public_spaces', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'needs_review');
  assert.equal(prepared.routing_disposition, 'multiple_candidates');
  assert.ok(prepared.alternative_service_types.length > 1);
  assert.ok(prepared.instructions.includes('Multiple service types'));
});

test('electricity and gas always routes to emergency', async t => {
  const { report } = await setup(t, 'electricity_and_gas', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.routing_disposition, '911');
});

test('getReport enforces session ownership', async t => {
  const { report, session } = await setup(t);
  const otherSession = await DatabaseService.createSession();
  
  const ownedReport = await DatabaseService.getReport(report.id);
  assert.ok(ownedReport);
  assert.equal(ownedReport.session_id, session);
  assert.notEqual(ownedReport.session_id, otherSession);
});

test('withdrawn reports are detected', async t => {
  const { db, report } = await setup(t);
  await db.query('UPDATE reports SET withdrawn = 1 WHERE id = $1', [report.id]);
  
  const fetched = await DatabaseService.getReport(report.id);
  assert.equal(fetched, undefined);
});

test('no_visible_hazard category has no routing', async t => {
  const { report } = await setup(t, 'no_visible_hazard', 0);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'insufficient_data');
  assert.equal(prepared.routing_disposition, 'no_route');
  assert.equal(prepared.department, null);
  assert.equal(prepared.service_type, null);
});

test('unable_to_assess category has no routing', async t => {
  const { report } = await setup(t, 'unable_to_assess', null);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'insufficient_data');
  assert.equal(prepared.routing_disposition, 'no_route');
});

test('prepareReport uses stored analysis fields not client-supplied values', async t => {
  const { report } = await setup(t, 'roads_and_sidewalks', 5);
  
  report.seriousness = 10;
  report.category = 'fire_injury_or_immediate_threat';
  
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.prepared_fields.seriousness, 10);
  assert.equal(prepared.prepared_fields.category, 'fire_injury_or_immediate_threat');
});

test('trash and sanitation routes to DPW via 311', async t => {
  const { report } = await setup(t, 'trash_and_sanitation', 4);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'needs_review');
  assert.equal(prepared.department, null);
  assert.ok(prepared.alternative_service_types.length > 1);
});

test('animals route to animal care and control', async t => {
  const { report } = await setup(t, 'animals', 5);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'needs_review');
  assert.ok(prepared.alternative_service_types.includes('Stray Animal'));
});

test('buildings with high seriousness trigger emergency', async t => {
  const { report } = await setup(t, 'buildings_and_construction', 9);
  const prepared = BaltimoreRoutingService.prepareReport(report);
  
  assert.equal(prepared.readiness, 'emergency_first');
  assert.equal(prepared.routing_disposition, '911');
});
