import test from 'node:test';
import assert from 'node:assert/strict';
import { HOW_TO_COPY } from '../lib/how-to-copy.ts';

test('how-to heading and title are short product labels', () => {
  assert.equal(HOW_TO_COPY.heading, 'How to use');
  assert.equal(HOW_TO_COPY.title, 'One Minute Utopia');
});

test('how-to steps are one-liners', () => {
  assert.deepEqual(HOW_TO_COPY.steps, [
    'Snap a photo',
    'Review your submission',
    'Save your report and get quick access to relevant agency contact information',
  ]);
});

test('how-to privacy marks location as recorded and underlines any', () => {
  assert.equal(HOW_TO_COPY.location, 'Your location is recorded with your report.');
  assert.equal(HOW_TO_COPY.privacyLead, 'Do not upload or share ');
  assert.equal(HOW_TO_COPY.privacyAny, 'any');
  assert.equal(HOW_TO_COPY.privacyRest, ' potentially compromising information.');
});

test('how-to keeps 911 and drops 311 / portal lecture', () => {
  assert.equal(HOW_TO_COPY.emergency, 'If the situation is dangerous, get to safety and contact 911.');
  const blob = JSON.stringify(HOW_TO_COPY);
  assert.doesNotMatch(blob, /311/);
  assert.doesNotMatch(blob, /civic reporting/i);
  assert.doesNotMatch(blob, /submit yourself/i);
  assert.doesNotMatch(blob, /city portal/i);
  assert.doesNotMatch(blob, /prepare/i);
});
