import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialQueue } from '../worker/src/incident-queue.ts';
import { incidentIdFromReportRow } from '../worker/src/report-watch.ts';

test('incidentIdFromReportRow reads the clustered incident from a new report', () => {
  assert.equal(incidentIdFromReportRow({ incident_id: 'inc-1', id: 'rep-1' }), 'inc-1');
  assert.equal(incidentIdFromReportRow({ incident_id: '  inc-2  ' }), 'inc-2');
  assert.equal(incidentIdFromReportRow({ incident_id: '' }), null);
  assert.equal(incidentIdFromReportRow({}), null);
  assert.equal(incidentIdFromReportRow(null), null);
});

test('serial queue runs jobs one at a time and coalesces the same incident', async () => {
  const events = [];
  const queue = createSerialQueue(async (id) => {
    events.push(`start-${id}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push(`end-${id}`);
  });

  await Promise.all([queue.enqueue('a'), queue.enqueue('b'), queue.enqueue('a')]);

  const firstA = events.indexOf('start-a');
  const endA = events.indexOf('end-a');
  const startB = events.indexOf('start-b');
  assert.ok(firstA >= 0 && endA > firstA);
  assert.ok(startB === -1 || startB > endA);
  assert.ok(events.filter((event) => event === 'start-a').length >= 1);
  assert.ok(events.filter((event) => event === 'start-b').length === 1);
});

test('a second insert for an incident already in flight is processed after the first run', async () => {
  let runs = 0;
  let release = () => {};
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const queue = createSerialQueue(async () => {
    runs += 1;
    if (runs === 1) await held;
  });

  const first = queue.enqueue('same');
  await new Promise((resolve) => setTimeout(resolve, 10));
  void queue.enqueue('same');
  release();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(runs, 2);
});
