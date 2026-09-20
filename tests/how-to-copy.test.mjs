import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOW_TO_COPY, HOW_TO_PRIVACY } from '../lib/how-to-copy.ts';

const panelSource = readFileSync(new URL('../components/HowToPanel.tsx', import.meta.url), 'utf8');
const copySource = readFileSync(new URL('../lib/how-to-copy.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('how-to heading and title are Jake lean copy', () => {
  assert.equal(HOW_TO_COPY.openLabel, 'How to use');
  assert.equal(HOW_TO_COPY.title, 'One Minute Utopia');
});

test('how-to has no civic-street / hazards subtitle or similar fluff', () => {
  assert.equal('what' in HOW_TO_COPY, false);
  assert.doesNotMatch(copySource, /civic|hazard|Baltimore|AI assist|street issues/i);
  assert.doesNotMatch(panelSource, /HOW_TO_COPY\.what|leave-copy/);
});

test('how-to steps are the three numbered one-liners', () => {
  assert.deepEqual([...HOW_TO_COPY.steps], [
    'Snap a photo',
    'Review your submission',
    'Save your report and get quick access to relevant agency contact information',
  ]);
});

test('how-to privacy disclaimer bolds the lead and underlines any', () => {
  assert.equal(
    HOW_TO_PRIVACY,
    'Your location is recorded with your report. Do not upload or share any potentially compromising information.',
  );
  assert.equal(HOW_TO_COPY.privacyLead, 'Your location is recorded with your report. Do not upload or share ');
  assert.equal(HOW_TO_COPY.privacyEmphasis, 'any');
  assert.equal(HOW_TO_COPY.privacyTail, ' potentially compromising information.');
  assert.match(panelSource, /<strong>\{HOW_TO_COPY\.privacyLead\}<\/strong>/);
  assert.match(panelSource, /<u>\{HOW_TO_COPY\.privacyEmphasis\}<\/u>/);
});

test('how-to keeps the 911 safety line and drops 311 / map lectures', () => {
  assert.equal(HOW_TO_COPY.emergency, 'If the situation is dangerous, get to safety and contact 911.');
  assert.equal('mapHint' in HOW_TO_COPY, false);
  assert.equal('demo' in HOW_TO_COPY, false);
  assert.doesNotMatch(copySource, /311|mapHint|I see this too|city portal|prepare/i);
  assert.doesNotMatch(panelSource, /mapHint|HOW_TO_COPY\.demo|info-note|311|city portal/i);
  assert.doesNotMatch(HOW_TO_COPY.steps.join(' '), /311|city portal|prepare/i);
});

test('info panel and its copy are centered in the viewport', () => {
  assert.match(cssSource, /\.info-overlay\s*\{[^}]*align-items:\s*center;/s);
  assert.match(cssSource, /\.info-card\s*\{[^}]*text-align:\s*center;/s);
  assert.match(cssSource, /\.info-card-head\s*\{[^}]*text-align:\s*center;/s);
  assert.match(cssSource, /\.info-steps\s*\{[^}]*text-align:\s*center;/s);
  assert.match(cssSource, /\.info-steps\s*\{[^}]*counter-reset:\s*info-step;/s);
});

test('capture (i) control wins over btn-ghost padding for a true 44 center', () => {
  assert.match(cssSource, /\.btn-ghost\.capture-info\s*\{[^}]*padding:\s*0;/s);
  assert.match(cssSource, /\.btn-ghost\.capture-info\s*\{[^}]*place-items:\s*center;/s);
  assert.match(cssSource, /\.btn-ghost\.capture-info\s*\{[^}]*width:\s*44px;/s);
  assert.match(cssSource, /\.btn-ghost\.capture-info\s*\{[^}]*height:\s*44px;/s);
});
