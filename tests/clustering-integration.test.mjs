import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { validateReportInput } from '../lib/report-input.ts';

const migrations = await Promise.all([
  '202609190000_reporting.sql',
  '202609190001_image_analyses.sql',
  '202609190002_incident_context_and_clustering.sql',
  '202609190003_baltimore_311_routing.sql',
  '202609190004_mock_government_submission.sql',
  '202609190005_mock_agency.sql',
  '202609190006_reports_realtime.sql',
].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

// Run production tagged SQL against an isolated PostgreSQL engine, including its real transactions.
function connect(db) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  sql.begin = fn => db.transaction(tx => fn(connect(tx)));
  return sql;
}

// Helper to setup test database and create a session with analysis
async function setup(t, analysisId = '11111111-1111-4111-8111-111111111111', category = 'roads_and_sidewalks') {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of migrations) await db.exec(migration);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  const session = await DatabaseService.createSession();
  const incidentType = category === 'roads_and_sidewalks' ? 'roads_and_sidewalks_unspecified' :
    category === 'trash_and_sanitation' ? 'trash_and_sanitation_unspecified' : `${category}_unspecified`;
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo.jpg','saved-hash',$3,$4,'Test image',$5,$6,'gemini-test','1')`, 
    [analysisId, session, category, incidentType, 6, 81]);
  return { db, session };
}

test('two nearby same-type reports within 72h cluster into one incident with two evidence records', async t => {
  const { db, session } = await setup(t);
  
  // Create first report at location (39.29, -76.61) - Baltimore
  const input1 = {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Large pothole',
    latitude: 39.29,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  const incident1Id = report1.incident_id;
  
  // Create second analysis for same session
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',7,85,'gemini-test','1')`, [analysis2Id, session]);
  
  // Create second report ~100m away (within 150m threshold) and same category
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Another pothole nearby',
    latitude: 39.29, // Same latitude
    longitude: -76.6095, // ~100m away (roughly 0.0005 degrees longitude at this latitude ≈ 100m)
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St near Oak'
  };
  
  const { report: report2 } = await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Both reports should link to the same incident
  assert.equal(report2.incident_id, incident1Id, 'Second report should cluster to first incident');
  assert.notEqual(report1.id, report2.id, 'Reports should have different IDs');
  
  // Check incident evidence count
  const incidents = await db.query('SELECT * FROM incidents WHERE id = $1', [incident1Id]);
  assert.equal(incidents.rows.length, 1, 'Should have exactly one incident');
  assert.equal(incidents.rows[0].evidence_count, 2, 'Incident should have evidence_count of 2');
  assert.equal(incidents.rows[0].mock_status, 'pending');
  assert.equal(incidents.rows[0].mock_reference_id, null);
  assert.equal(incidents.rows[0].mock_agency, null);
  
  // Check that we have two reports for one incident
  const reports = await db.query('SELECT * FROM reports WHERE incident_id = $1 ORDER BY created_at', [incident1Id]);
  assert.equal(reports.rows.length, 2, 'Should have exactly two reports for the incident');
  assert.equal(reports.rows[0].id, report1.id);
  assert.equal(reports.rows[1].id, report2.id);
  
  // Verify only one incident was created
  const allIncidents = await db.query('SELECT COUNT(*)::int AS n FROM incidents');
  assert.equal(allIncidents.rows[0].n, 1, 'Should have created only one incident');
});

test('reports with different categories do not cluster', async t => {
  const { db, session } = await setup(t);
  
  const input1 = {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Pothole',
    latitude: 39.29,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  
  // Create second analysis with different category
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','trash_and_sanitation','trash_and_sanitation_unspecified','Test image',5,80,'gemini-test','1')`, [analysis2Id, session]);
  
  const input2 = {
    analysis_id: analysis2Id,
    category: 'trash_and_sanitation',
    user_description: 'Litter',
    latitude: 39.29, // Same location
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report2 } = await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Should create separate incidents
  assert.notEqual(report2.incident_id, report1.incident_id, 'Different categories should create separate incidents');
  
  const allIncidents = await db.query('SELECT COUNT(*)::int AS n FROM incidents');
  assert.equal(allIncidents.rows[0].n, 2, 'Should have created two separate incidents');
});

test('reports more than 150m apart do not cluster', async t => {
  const { db, session } = await setup(t);
  
  const input1 = {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Pothole',
    latitude: 39.29,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',6,82,'gemini-test','1')`, [analysis2Id, session]);
  
  // ~200m away (0.002 degrees longitude ≈ 200m)
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Different pothole',
    latitude: 39.29,
    longitude: -76.608, // ~200m away
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Oak St'
  };
  
  const { report: report2 } = await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Should create separate incidents
  assert.notEqual(report2.incident_id, report1.incident_id, 'Reports >150m apart should create separate incidents');
  
  const allIncidents = await db.query('SELECT COUNT(*)::int AS n FROM incidents');
  assert.equal(allIncidents.rows[0].n, 2, 'Should have created two separate incidents');
});

test('reports more than 72h apart do not cluster', async t => {
  const { db, session } = await setup(t);
  
  const input1 = {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Pothole',
    latitude: 39.29,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  const incident1Id = report1.incident_id;
  
  // Age the first incident by 73 hours
  const seventyThreeHoursMs = 73 * 60 * 60 * 1000;
  await db.query('UPDATE incidents SET created_at = created_at - $1, updated_at = updated_at - $1 WHERE id = $2', [seventyThreeHoursMs, incident1Id]);
  await db.query('UPDATE reports SET created_at = created_at - $1 WHERE id = $2', [seventyThreeHoursMs, report1.id]);
  
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',6,82,'gemini-test','1')`, [analysis2Id, session]);
  
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Another pothole',
    latitude: 39.29,
    longitude: -76.61, // Same location
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report2 } = await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Should create separate incidents due to time window
  assert.notEqual(report2.incident_id, incident1Id, 'Reports >72h apart should create separate incidents');
  
  const allIncidents = await db.query('SELECT COUNT(*)::int AS n FROM incidents');
  assert.equal(allIncidents.rows[0].n, 2, 'Should have created two separate incidents');
});

test('reports without location coordinates do not cluster', async t => {
  const { db, session } = await setup(t);
  
  // First report with GPS location
  const input1 = {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Pothole',
    latitude: 39.29,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',6,82,'gemini-test','1')`, [analysis2Id, session]);
  
  // Second report with manual location (no coordinates)
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Another pothole',
    latitude: null,
    longitude: null,
    location_accuracy: null,
    location_source: 'manual',
    location_address: 'Main St'
  };
  
  const { report: report2 } = await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Should create separate incidents
  assert.notEqual(report2.incident_id, report1.incident_id, 'Reports without coordinates should create separate incidents');
  
  const allIncidents = await db.query('SELECT COUNT(*)::int AS n FROM incidents');
  assert.equal(allIncidents.rows[0].n, 2, 'Should have created two separate incidents');
});

test('three reports cluster correctly into one incident', async t => {
  const { db, session } = await setup(t);
  
  // Create three nearby reports of same type
  const reports = [];
  const analysisIds = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
  ];
  
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
        VALUES ($1,$2,$3,$4,'roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',6,81,'gemini-test','1')`, [analysisIds[i], session, `https://storage.example/photo${i}.jpg`, `saved-hash-${i}`]);
    }
    
    const input = {
      analysis_id: analysisIds[i],
      category: 'roads_and_sidewalks',
      user_description: `Pothole ${i + 1}`,
      latitude: 39.29,
      longitude: -76.61 + (i * 0.0003), // Each ~30m apart
      location_accuracy: 10,
      location_source: 'gps',
      location_address: `Main St location ${i + 1}`
    };
    
    const { report } = await DatabaseService.submitReport(session, validateReportInput(input));
    reports.push(report);
  }
  
  // All three should share the same incident
  assert.equal(reports[1].incident_id, reports[0].incident_id, 'Second report should cluster to first incident');
  assert.equal(reports[2].incident_id, reports[0].incident_id, 'Third report should cluster to first incident');
  
  // Check incident evidence count
  const incidents = await db.query('SELECT * FROM incidents WHERE id = $1', [reports[0].incident_id]);
  assert.equal(incidents.rows[0].evidence_count, 3, 'Incident should have evidence_count of 3');
  
  // Verify only one incident was created
  const allIncidents = await db.query('SELECT COUNT(*)::int AS n FROM incidents');
  assert.equal(allIncidents.rows[0].n, 1, 'Should have created only one incident');
});

test('clustered incident coordinates are averaged from all reports', async t => {
  const { db, session } = await setup(t);
  
  const input1 = {
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'First pothole',
    latitude: 39.29,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St at 1st Ave'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',6,82,'gemini-test','1')`, [analysis2Id, session]);
  
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Second pothole',
    latitude: 39.2905, // Slightly different
    longitude: -76.6095,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St at 2nd Ave'
  };
  
  await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Incident coordinates should be averaged between the two reports
  const incident = await db.query('SELECT * FROM incidents WHERE id = $1', [report1.incident_id]);
  const expectedLat = (39.29 + 39.2905) / 2; // Average of two latitudes
  const expectedLon = (-76.61 + -76.6095) / 2; // Average of two longitudes
  assert.ok(Math.abs(incident.rows[0].latitude - expectedLat) < 0.0001, 'Incident latitude should be average of reports');
  assert.ok(Math.abs(incident.rows[0].longitude - expectedLon) < 0.0001, 'Incident longitude should be average of reports');
  // Address keeps the first report's address
  assert.equal(incident.rows[0].location_address, 'Main St at 1st Ave', 'Incident address should match first report');
});
