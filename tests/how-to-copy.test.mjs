import test from 'node:test';
import assert from 'node:assert/strict';
import { HOW_TO_COPY } from '../lib/how-to-copy.ts';

test('how-to title matches product name', () => {
  assert.equal(HOW_TO_COPY.title, 'One Minute Utopia');
});

test('how-to explains photo civic reporting with AI assist', () => {
  assert.match(HOW_TO_COPY.what, /photo civic reporting/i);
  assert.match(HOW_TO_COPY.what, /Baltimore/i);
  assert.match(HOW_TO_COPY.what, /AI/i);
});

test('how-to steps cover photo, analysis, and save', () => {
  assert.equal(HOW_TO_COPY.steps.length, 3);
  assert.match(HOW_TO_COPY.steps[0], /photo/i);
  assert.match(HOW_TO_COPY.steps[1], /AI analysis/i);
  assert.match(HOW_TO_COPY.steps[1], /category/i);
  assert.match(HOW_TO_COPY.steps[2], /Save/i);
  assert.match(HOW_TO_COPY.steps[2], /links|contacts/i);
});

test('how-to mentions map confirmations without city-filing claims', () => {
  assert.match(HOW_TO_COPY.mapHint, /I see this too/);
  assert.match(HOW_TO_COPY.demo, /prepares and routes/i);
  assert.match(HOW_TO_COPY.demo, /does not file/i);
  assert.match(HOW_TO_COPY.demo, /live 311/i);
  assert.match(HOW_TO_COPY.emergency, /911/);
  assert.doesNotMatch(HOW_TO_COPY.demo, /submit yourself/i);
  assert.doesNotMatch(HOW_TO_COPY.steps.join(' '), /city portal/i);
});
