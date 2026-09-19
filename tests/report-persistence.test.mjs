import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseService } from '../lib/db.ts';
import { validateReportInput } from '../lib/report-input.ts';

const migrations = await Promise.all(['202609190000_reporting.sql', '202609190001_image_analyses.sql'].map(name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

// Run production tagged SQL against an isolated PostgreSQL engine, including its real transactions.
function connect(db) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  sql.begin = fn => db.transaction(tx => fn(connect(tx)));
  return sql;
}

const input = { analysis_id: '11111111-1111-4111-8111-111111111111', category: 'roads_and_sidewalks', location_source: 'gps', latitude: 0, longitude: 0, location_accuracy: 4 };
async function setup(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of migrations) await db.exec(migration);
  t.mock.method(DatabaseService, 'getConnection', () => connect(db));
  const session = await DatabaseService.createSession();
  await db.query(`INSERT INTO image_analyses (id, session_id, image_path, image_hash, category, seriousness, ai_confidence, model, prompt_version)
    VALUES ($1,$2,'https://storage.example/photo.jpg','saved-hash','roads_and_sidewalks',6,81,'gemini-test','1')`, [input.analysis_id, session]);
  return { db, session };
}

test('migrations are repeatable and browser roles cannot read reports, sessions or analyses', async t => {
  const { db } = await setup(t);
  for (const migration of migrations) await db.exec(migration);
  await DatabaseService.testConnection();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    for (const table of ['reports', 'sessions', 'image_analyses', 'request_limits']) await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
    await db.exec('RESET ROLE');
  }
  await assert.rejects(db.query(`UPDATE image_analyses SET seriousness=0`), /check constraint/);
});

test('submission reads trusted image and scores, records corrections, and saves a durable receipt', async t => {
  const { db, session } = await setup(t);
  const clean = validateReportInput({ ...input, category: 'other_hazard', seriousness: 10, ai_confidence: 100, image_path: 'https://attacker.example', user_corrected: false, short_label: 'forged' });
  const { report } = await DatabaseService.submitReport(session, clean);
  assert.equal(report.image_path, 'https://storage.example/photo.jpg');
  assert.equal(report.image_hash, 'saved-hash');
  assert.equal(report.seriousness, 6);
  assert.equal(report.ai_confidence, 0.81);
  assert.equal(report.category, 'other_hazard');
  assert.equal(report.short_label, 'Other hazard');
  assert.equal(report.user_corrected, 1);
  assert.equal(report.latitude, 0);
  assert.equal((await DatabaseService.getReport(report.id)).id, report.id);
  const saved = (await db.query('SELECT * FROM image_analyses')).rows[0];
  assert.equal(saved.category, 'roads_and_sidewalks');
  assert.equal(saved.report_id, report.id);
  assert.ok(saved.submitted_at);
});

test('concurrent retries return one receipt and one incident', async t => {
  const { db, session } = await setup(t);
  const result = await Promise.all([1,2,3].map(() => DatabaseService.submitReport(session, validateReportInput(input))));
  assert.equal(new Set(result.map(r => r.report.id)).size, 1);
  assert.equal(result.filter(r => !r.duplicate).length, 1);
  for (const table of ['reports','incidents']) assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 1);
});

test('report insert failure rolls back incident and link, then retry succeeds', async t => {
  const { db, session } = await setup(t);
  await db.exec(`ALTER TABLE reports ADD CONSTRAINT force_failure CHECK (category <> 'roads_and_sidewalks')`);
  await assert.rejects(DatabaseService.submitReport(session, validateReportInput(input)), /force_failure/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM incidents')).rows[0].n, 0);
  assert.equal((await db.query('SELECT report_id FROM image_analyses')).rows[0].report_id, null);
  await db.exec('ALTER TABLE reports DROP CONSTRAINT force_failure');
  assert.equal((await DatabaseService.submitReport(session, validateReportInput(input))).duplicate, false);
});

test('unowned analysis creates nothing and an AI-outage manual report has no AI score', async t => {
  const { db, session } = await setup(t);
  await assert.rejects(DatabaseService.submitReport('different-session', validateReportInput(input)), e => e.status === 404);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM incidents')).rows[0].n, 0);
  await db.exec("UPDATE image_analyses SET category='unable_to_assess', seriousness=null, ai_confidence=0, analysis_status='unavailable'");
  const { report } = await DatabaseService.submitReport(session, validateReportInput({ ...input, location_source: 'manual', location_address: 'Main Street' }));
  assert.equal(report.ai_confidence, null);
  assert.equal(report.seriousness, null);
  assert.equal(report.latitude, null);
  assert.equal(report.analysis_status, 'unavailable');
});

test('session validation and persistent hourly limit survive independent calls', async t => {
  const { db, session } = await setup(t);
  assert.equal(await DatabaseService.validateSession(session), true);
  assert.equal(await DatabaseService.validateSession('forged'), false);
  assert.equal(await DatabaseService.checkRateLimit(session, 'upload', 2), true);
  assert.equal(await DatabaseService.checkRateLimit(session, 'upload', 2), true);
  assert.equal(await DatabaseService.checkRateLimit(session, 'upload', 2), false);
  await db.exec('UPDATE request_limits SET reset_at=0');
  assert.equal(await DatabaseService.checkRateLimit(session, 'upload', 2), true);
});
