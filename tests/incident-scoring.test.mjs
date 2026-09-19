import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNMENT_REPORT_THRESHOLD,
  calculateCaseScore,
  calculateIncidentDangerLevel,
  calculateIncidentScore,
  caseScoreFromAnalysis,
  evaluateIncidentForSubmission,
  independentCaseScores,
  recalculateIncident,
} from '../lib/incident-scoring.ts';

function assertClose(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${expected}, got ${actual}`,
  );
}

test('traffic light case score is 0.585 and needs two independent reports', () => {
  const caseScore = calculateCaseScore(6, 0.95);
  assertClose(caseScore, 0.585);
  assert.equal(evaluateIncidentForSubmission(caseScore, 'not_ready'), 'not_ready');

  const two = calculateIncidentScore([caseScore, caseScore]);
  assertClose(two, 0.827775);
  assert.ok(two >= GOVERNMENT_REPORT_THRESHOLD);
  assert.equal(evaluateIncidentForSubmission(two, 'not_ready'), 'ready_to_submit');
});

test('trash needs about seven strong independent reports', () => {
  const caseScore = calculateCaseScore(2, 0.90);
  assertClose(caseScore, 0.19);
  assert.equal(evaluateIncidentForSubmission(caseScore, 'not_ready'), 'not_ready');

  const five = calculateIncidentScore(Array(5).fill(caseScore));
  assertClose(five, 0.6513215599, 1e-8);
  assert.ok(five < GOVERNMENT_REPORT_THRESHOLD);

  const seven = calculateIncidentScore(Array(7).fill(caseScore));
  assertClose(seven, 0.7712320753, 1e-8);
  assert.ok(seven >= GOVERNMENT_REPORT_THRESHOLD);
  assert.equal(evaluateIncidentForSubmission(seven, 'not_ready'), 'ready_to_submit');
});

test('ordinary road damage needs about four independent reports', () => {
  const caseScore = calculateCaseScore(3.5, 0.90);
  assertClose(caseScore, 0.3325);
  assert.equal(evaluateIncidentForSubmission(caseScore, 'not_ready'), 'not_ready');

  const three = calculateIncidentScore(Array(3).fill(caseScore));
  assertClose(three, 0.703, 0.002);
  assert.ok(three < GOVERNMENT_REPORT_THRESHOLD);

  const four = calculateIncidentScore(Array(4).fill(caseScore));
  assertClose(four, 0.802, 0.002);
  assert.ok(four >= GOVERNMENT_REPORT_THRESHOLD);
});

test('a severe incident can cross the threshold from one report', () => {
  const caseScore = calculateCaseScore(9, 0.90);
  assertClose(caseScore, 0.855);
  assert.ok(caseScore >= GOVERNMENT_REPORT_THRESHOLD);
  assert.equal(evaluateIncidentForSubmission(caseScore, 'not_ready'), 'ready_to_submit');
});

test('invalid AI values are clamped before scoring', () => {
  assert.equal(calculateCaseScore(15, 1.3), calculateCaseScore(10, 1));
  assert.equal(calculateCaseScore(-4, -0.2), 0);
  assert.equal(caseScoreFromAnalysis(15, 130), calculateCaseScore(10, 1));
});

test('incident danger level is the maximum report danger', () => {
  assert.equal(calculateIncidentDangerLevel([
    { session_id: 'a', seriousness: 4 },
    { session_id: 'b', seriousness: 5 },
    { session_id: 'c', seriousness: 4 },
  ]), 5);
});

test('one session contributes at most one case score to an incident', () => {
  const scores = independentCaseScores([
    { session_id: 'same', case_score: 0.19 },
    { session_id: 'same', case_score: 0.19 },
    { session_id: 'other', case_score: 0.19 },
  ]);
  assert.equal(scores.length, 2);
  const incident = recalculateIncident([
    { session_id: 'same', case_score: 0.19, seriousness: 2 },
    { session_id: 'same', case_score: 0.22, seriousness: 2 },
  ]);
  assert.equal(incident.report_count, 1);
  assertClose(incident.incident_score, 0.22);
  assert.equal(incident.government_report_status, 'not_ready');
});

test('already submitted incidents are not marked ready again', () => {
  assert.equal(evaluateIncidentForSubmission(0.9, 'submitted'), 'submitted');
  assert.equal(evaluateIncidentForSubmission(0.9, 'failed'), 'failed');
  assert.equal(evaluateIncidentForSubmission(0.2, 'not_ready'), 'not_ready');
});

test('empty incident score is 0', () => {
  assert.equal(calculateIncidentScore([]), 0);
  assert.equal(calculateIncidentScore(null), 0);
});
