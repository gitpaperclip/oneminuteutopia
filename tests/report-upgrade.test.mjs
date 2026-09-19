import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { validateReportInput } from '../lib/report-input.ts';

const migrations = await Promise.all([
  '202609190000_reporting.sql', '202609190001_image_analyses.sql',
  '202609190002_incident_context_and_clustering.sql',
  '202609190003_baltimore_311_routing.sql',
  '202609190004_mock_government_submission.sql',
  '202609190005_mock_agency.sql',
  '202609190006_reports_realtime.sql',
  '202609190007_incident_scoring.sql',
].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

// Historical fixtures intentionally do not derive their schema from the new migrations.
// These are the CREATE definitions in main after PR #7, including retired coordinator data.
const legacySchema = `
  CREATE TABLE reports (
    id TEXT PRIMARY KEY, incident_id TEXT, session_id TEXT NOT NULL,
    image_path TEXT NOT NULL, image_hash TEXT NOT NULL, category TEXT NOT NULL,
    short_label TEXT NOT NULL, full_description TEXT, user_description TEXT,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, location_accuracy DOUBLE PRECISION,
    location_source TEXT, location_address TEXT, ai_confidence DOUBLE PRECISION,
    ai_model TEXT, ai_routing TEXT, user_corrected INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL, withdrawn INTEGER DEFAULT 0, idempotency_key TEXT UNIQUE
  );
  CREATE TABLE incidents (
    id TEXT PRIMARY KEY, category TEXT NOT NULL, short_label TEXT NOT NULL,
    full_description TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    location_address TEXT, status TEXT DEFAULT 'reported', severity TEXT DEFAULT 'normal',
    credibility_score INTEGER DEFAULT 0, evidence_count INTEGER DEFAULT 1,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, is_organizer INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL
  );
  CREATE TABLE status_events (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, old_status TEXT,
    new_status TEXT NOT NULL, actor_session TEXT, actor_type TEXT, reason TEXT,
    created_at BIGINT NOT NULL
  );
`;

// Exact table shape from the supplied original image-analysis overlay, before analysis_status.
const originalOverlay = `
  CREATE TABLE public.image_analyses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id text NOT NULL,
    image_path text NOT NULL UNIQUE, image_hash text NOT NULL,
    category text NOT NULL CHECK (category IN (
      'roads_and_sidewalks', 'traffic_signals_and_streetlights', 'trash_and_sanitation',
      'water_drainage_and_sewage', 'trees_and_public_spaces', 'buildings_and_construction',
      'electricity_and_gas', 'animals', 'fire_injury_or_immediate_threat',
      'other_hazard', 'no_visible_hazard', 'unable_to_assess'
    )),
    seriousness smallint, ai_confidence smallint NOT NULL CHECK (ai_confidence BETWEEN 0 AND 100),
    model text NOT NULL, prompt_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    report_id text UNIQUE, incident_id text,
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    location_address text, submitted_at timestamptz,
    CHECK (
      (category = 'unable_to_assess' AND seriousness IS NULL AND ai_confidence = 0)
      OR (category = 'no_visible_hazard' AND seriousness IS NOT NULL AND seriousness = 0)
      OR (category NOT IN ('unable_to_assess','no_visible_hazard') AND seriousness IS NOT NULL AND seriousness BETWEEN 1 AND 10)
    )
  );
  ALTER TABLE public.image_analyses ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.image_analyses FROM anon, authenticated;
  GRANT ALL ON public.image_analyses TO service_role;
  CREATE INDEX image_analyses_submitted ON public.image_analyses(submitted_at) WHERE report_id IS NOT NULL;
`;

const legacySession = 'SSSSSSSSSSSSSSSSSSSSS';
const legacyReport = 'RRRRRRRRRRRRRRRRRRRRR';
const legacyIncident = 'IIIIIIIIIIIIIIIIIIIII';
const legacyTime = 1789776000123;

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
  await db.exec(legacySchema);
  await db.exec('GRANT ALL ON reports, incidents, sessions, status_events TO anon, authenticated;');
  await db.query('INSERT INTO sessions VALUES ($1,1,$2,$2)', [legacySession, legacyTime]);
  await db.query(`INSERT INTO incidents (id,category,short_label,latitude,longitude,status,created_at,updated_at)
    VALUES ($1,'pothole','Original pothole',39.3,-76.6,'in_progress',$2,$2)`, [legacyIncident, legacyTime]);
  await db.query(`INSERT INTO reports (id,incident_id,session_id,image_path,image_hash,category,short_label,
    user_description,latitude,longitude,ai_confidence,ai_model,created_at,idempotency_key)
    VALUES ($1,$2,$3,'https://storage.example/original.jpg','original-hash','pothole','Original pothole',
    'Existing report must survive',39.3,-76.6,0.88,'original-model',$4,'legacy-idempotency')`,
  [legacyReport, legacyIncident, legacySession, legacyTime]);
  await db.query(`INSERT INTO status_events (id,incident_id,old_status,new_status,actor_session,actor_type,created_at)
    VALUES ('original-event',$1,'reported','in_progress',$2,'organizer',$3)`, [legacyIncident, legacySession, legacyTime]);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  return db;
}

async function migrate(db) {
  for (const migration of migrations) await db.exec(migration);
}

test('upgrading main preserves legacy records and timestamps while supporting the new reporting schema', async t => {
  const db = await setup(t);
  const oldReport = (await db.query('SELECT * FROM reports')).rows[0];
  const oldIncident = (await db.query('SELECT * FROM incidents')).rows[0];
  const oldSession = (await db.query('SELECT * FROM sessions')).rows[0];
  const oldEvent = (await db.query('SELECT * FROM status_events')).rows[0];

  await migrate(db);
  await migrate(db);
  await DatabaseService.testConnection();
  assert.deepEqual((await db.query('SELECT * FROM reports')).rows[0], {
    ...oldReport, seriousness: null, analysis_status: null,
    incident_type: 'other_hazard', context_summary: null, tags: ['other_hazard'],
    baltimore_service_candidates: [], routing_disposition: 'manual_review',
    case_score: 0,
  });
  assert.deepEqual((await db.query('SELECT * FROM incidents')).rows[0], {
    ...oldIncident, incident_type: 'other_hazard', tags: ['other_hazard'],
    highest_seriousness: null, average_ai_confidence: null, ai_evidence_count: 0,
    last_reported_at: legacyTime, cluster_radius_m: 150,
    baltimore_service_candidates: [], routing_disposition: 'manual_review',
    mock_reference_id: null, mock_submitted_at: null, mock_status: 'pending', mock_error: null,
    mock_agency: null,
    incident_score: 0, report_count: 1, government_report_status: 'not_ready',
  });
  assert.deepEqual((await db.query('SELECT * FROM sessions')).rows[0], oldSession);
  assert.deepEqual((await db.query('SELECT * FROM status_events')).rows[0], oldEvent);
  assert.equal((await DatabaseService.getReport(legacyReport)).created_at, legacyTime);

  // Retaining an old coordinator column must not be required by the reporting-only runtime.
  const newSession = await DatabaseService.createSession();
  const newRow = (await db.query('SELECT * FROM sessions WHERE id=$1', [newSession])).rows[0];
  assert.equal(newRow.is_organizer, 0);
  assert.equal(await DatabaseService.validateSession(newSession), true);
  assert.equal(await DatabaseService.checkRateLimit(newSession, 'upload', 10), true);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ['reports', 'incidents', 'sessions', 'status_events', 'request_limits', 'image_analyses']) {
      await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
    }
    await db.exec('RESET ROLE');
  }
});

test('upgrading an already-applied overlay preserves its analysis and enables manual fallback submission', async t => {
  const db = await setup(t);
  await db.exec(originalOverlay);
  const analysisId = '11111111-1111-4111-8111-111111111111';
  await db.query(`INSERT INTO image_analyses (id,session_id,image_path,image_hash,category,seriousness,
    ai_confidence,model,prompt_version,created_at,report_id,incident_id,submitted_at)
    VALUES ($1,$2,'https://storage.example/original.jpg','original-hash','roads_and_sidewalks',6,88,
    'original-model','1','2026-09-18T10:00:00.123Z',$3,$4,'2026-09-18T10:01:00.123Z')`,
  [analysisId, legacySession, legacyReport, legacyIncident]);
  const oldAnalysis = (await db.query('SELECT * FROM image_analyses')).rows[0];

  await migrate(db);
  await migrate(db);
  assert.deepEqual((await db.query('SELECT * FROM image_analyses')).rows[0], {
    ...oldAnalysis, analysis_status: 'complete',
    incident_type: 'roads_and_sidewalks_unspecified',
    context_summary: 'Legacy analysis; no image context was captured.',
    context_tags: [], tags: ['roads_and_sidewalks_unspecified'],
    baltimore_service_candidates: [], routing_disposition: 'manual_review',
    case_score: 0.564,
  });
  const retry = await DatabaseService.submitReport(legacySession, validateReportInput({
    analysis_id: analysisId, category: 'roads_and_sidewalks', location_source: 'manual', location_address: 'Original location',
  }));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.report.id, legacyReport);
  assert.equal(retry.report.created_at, legacyTime);

  const manualId = '22222222-2222-4222-8222-222222222222';
  await db.query(`INSERT INTO image_analyses (id,session_id,image_path,image_hash,category,incident_type,seriousness,
    ai_confidence,context_summary,context_tags,tags,model,prompt_version,analysis_status)
    VALUES ($1,$2,'https://storage.example/manual.jpg','manual-hash','unable_to_assess','unable_to_assess',null,0,
    'Image analysis was unavailable.',array[]::text[],array['unable_to_assess'],
    'gemini-2.5-flash','2','unavailable')`, [manualId, legacySession]);
  const { report, duplicate } = await DatabaseService.submitReport(legacySession, validateReportInput({
    analysis_id: manualId, category: 'other_hazard', location_source: 'manual', location_address: 'Main Street',
  }));
  assert.equal(duplicate, false);
  assert.equal(report.analysis_status, 'unavailable');
  assert.equal(report.seriousness, null);
  assert.equal(report.ai_confidence, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reports')).rows[0].n, 2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM incidents')).rows[0].n, 2);
  assert.deepEqual((await db.query('SELECT * FROM image_analyses WHERE id=$1', [analysisId])).rows[0], {
    ...oldAnalysis, analysis_status: 'complete',
    incident_type: 'roads_and_sidewalks_unspecified',
    context_summary: 'Legacy analysis; no image context was captured.',
    context_tags: [], tags: ['roads_and_sidewalks_unspecified'],
    baltimore_service_candidates: [], routing_disposition: 'manual_review',
    case_score: 0.564,
  });
});
