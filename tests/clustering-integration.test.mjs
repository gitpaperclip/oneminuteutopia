import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { validateReportInput } from '../lib/report-input.ts';
import { shiftLatitude } from '../lib/incident-clustering.ts';

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
    location_accuracy: 15.11206436258455,
    location_source: 'gps',
    location_address: 'Main St'
  };
  
  const { report: report1 } = await DatabaseService.submitReport(session, validateReportInput(input1));
  const incident1Id = report1.incident_id;
  
  // Create second analysis for same session
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo2.jpg','saved-hash-2','roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',7,85,'gemini-test','1')`, [analysis2Id, session]);
  
  // Second report ~43m away. 10m GPS accuracy uses the 25m floor, so the
  // 2× circles overlap (25m + 25m) even though the old 150m cutoff is gone.
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Another pothole nearby',
    latitude: 39.29,
    longitude: -76.6095,
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
  assert.equal(incidents.rows[0].cluster_radius_m, 30, 'Fractional GPS accuracy stores a rounded radius');
  assert.equal(incidents.rows[0].report_count, 1, 'Same session should count once toward incident_score');
  assert.equal(incidents.rows[0].government_report_status, 'ready_to_submit');
  assert.equal(incidents.rows[0].mock_status, 'pending');
  assert.equal(incidents.rows[0].mock_reference_id, null);
  assert.equal(incidents.rows[0].mock_agency, null);
  assert.equal(incidents.rows[0].confirmation_count, 0);
  
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

test('reports whose accuracy circles do not overlap stay separate', async t => {
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
  
  // ~170m away, 10m accuracy → 25m floor each, no overlap.
  const input2 = {
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Different pothole',
    latitude: 39.29,
    longitude: -76.608,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Oak St'
  };
  
  const { report: report2 } = await DatabaseService.submitReport(session, validateReportInput(input2));
  
  assert.notEqual(report2.incident_id, report1.incident_id, 'Non-overlapping GPS circles should create separate incidents');
  
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
  assert.equal(incidents.rows[0].report_count, 1, 'Same session still counts as one independent score');
  
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
    latitude: 39.2902,
    longitude: -76.61,
    location_accuracy: 10,
    location_source: 'gps',
    location_address: 'Main St at 2nd Ave'
  };
  
  await DatabaseService.submitReport(session, validateReportInput(input2));
  
  // Incident coordinates should be averaged between the two reports
  const incident = await db.query('SELECT * FROM incidents WHERE id = $1', [report1.incident_id]);
  const expectedLat = (39.29 + 39.2902) / 2;
  const expectedLon = -76.61;
  assert.ok(Math.abs(incident.rows[0].latitude - expectedLat) < 0.0001, 'Incident latitude should be average of reports');
  assert.ok(Math.abs(incident.rows[0].longitude - expectedLon) < 0.0001, 'Incident longitude should be average of reports');
  // Address keeps the first report's address
  assert.equal(incident.rows[0].location_address, 'Main St at 1st Ave', 'Incident address should match first report');
});

async function insertRoadsAnalysis(db, id, session, hash) {
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, incident_type, context_summary, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,$3,$4,'roads_and_sidewalks','roads_and_sidewalks_unspecified','Test image',6,82,'gemini-test','1')`,
  [id, session, `https://storage.example/${hash}.jpg`, hash]);
}

test('precise GPS reports 100m apart do not cluster', async t => {
  const { db, session } = await setup(t);
  const origin = { latitude: 39.29, longitude: -76.61, location_accuracy: 8, location_source: 'gps', location_address: 'Main St' };
  const { report: first } = await DatabaseService.submitReport(session, validateReportInput({
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'North pothole',
    ...origin,
  }));
  const secondSession = await DatabaseService.createSession();
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await insertRoadsAnalysis(db, analysis2Id, secondSession, 'saved-hash-2');
  const { report: second } = await DatabaseService.submitReport(secondSession, validateReportInput({
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'South pothole',
    ...origin,
    latitude: shiftLatitude(origin.latitude, 100),
  }));
  assert.notEqual(second.incident_id, first.incident_id);
});

test('poor GPS reports 180m apart cluster because their accuracy circles overlap', async t => {
  const { db, session } = await setup(t);
  const origin = { latitude: 39.29, longitude: -76.61, location_accuracy: 60, location_source: 'gps', location_address: 'Main St' };
  const { report: first } = await DatabaseService.submitReport(session, validateReportInput({
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Blurry pothole',
    ...origin,
  }));
  const secondSession = await DatabaseService.createSession();
  const analysis2Id = '22222222-2222-4222-8222-222222222222';
  await insertRoadsAnalysis(db, analysis2Id, secondSession, 'saved-hash-2');
  const { report: second } = await DatabaseService.submitReport(secondSession, validateReportInput({
    analysis_id: analysis2Id,
    category: 'roads_and_sidewalks',
    user_description: 'Same pothole, worse GPS',
    ...origin,
    latitude: shiftLatitude(origin.latitude, 180),
  }));
  assert.equal(second.incident_id, first.incident_id);
  const incident = await DatabaseService.getIncident(first.incident_id);
  assert.equal(incident.evidence_count, 2);
});

test('A overlapping B and B overlapping D merge into one incident', async t => {
  const { db, session } = await setup(t);
  const originLat = 39.29;
  const originLon = -76.61;
  const accuracy = 20;
  const { report: reportA } = await DatabaseService.submitReport(session, validateReportInput({
    analysis_id: '11111111-1111-4111-8111-111111111111',
    category: 'roads_and_sidewalks',
    user_description: 'Report A',
    latitude: originLat,
    longitude: originLon,
    location_accuracy: accuracy,
    location_source: 'gps',
    location_address: 'A',
  }));

  const sessionD = await DatabaseService.createSession();
  const analysisD = '22222222-2222-4222-8222-222222222222';
  await insertRoadsAnalysis(db, analysisD, sessionD, 'saved-hash-d');
  const { report: reportD } = await DatabaseService.submitReport(sessionD, validateReportInput({
    analysis_id: analysisD,
    category: 'roads_and_sidewalks',
    user_description: 'Report D',
    latitude: shiftLatitude(originLat, 140),
    longitude: originLon,
    location_accuracy: accuracy,
    location_source: 'gps',
    location_address: 'D',
  }));
  assert.notEqual(reportD.incident_id, reportA.incident_id, 'A and D should start as separate incidents');

  const sessionB = await DatabaseService.createSession();
  const analysisB = '33333333-3333-4333-8333-333333333333';
  await insertRoadsAnalysis(db, analysisB, sessionB, 'saved-hash-b');
  const { report: reportB } = await DatabaseService.submitReport(sessionB, validateReportInput({
    analysis_id: analysisB,
    category: 'roads_and_sidewalks',
    user_description: 'Report B',
    latitude: shiftLatitude(originLat, 70),
    longitude: originLon,
    location_accuracy: accuracy,
    location_source: 'gps',
    location_address: 'B',
  }));

  assert.equal(reportB.incident_id, reportA.incident_id);
  const movedD = await db.query('SELECT incident_id FROM reports WHERE id = $1', [reportD.id]);
  assert.equal(movedD.rows[0].incident_id, reportA.incident_id);
  const keeper = await DatabaseService.getIncident(reportA.incident_id);
  assert.equal(keeper.evidence_count, 3);
  assert.equal(keeper.report_count, 3);
  assert.equal(keeper.status, 'reported');
  const merged = await db.query("SELECT COUNT(*)::int AS n FROM incidents WHERE status = 'merged'");
  assert.equal(merged.rows[0].n, 1);
  const listed = await DatabaseService.listIncidents({ incidentType: 'roads_and_sidewalks_unspecified' });
  assert.deepEqual(listed.map(item => item.id), [keeper.id]);
});
