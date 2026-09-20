import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('receipt keeps user actions and omits internal demo-worker copy', async () => {
  const source = await readFile(new URL('../app/receipt/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /Call 911/);
  assert.match(source, /Other contacts/);
  assert.match(source, /Report this issue/);
  assert.match(source, /handoffsForCategory/);
  assert.equal(source.includes('Prepared for 311'), false);
  assert.equal(source.includes('prepare-311'), false);
  assert.equal(source.includes('demo worker'), false);
  assert.equal(source.includes('Mock city portal'), false);
  assert.equal(source.includes('mock_reference_id'), false);
  assert.equal(source.includes('link.note'), false);
  assert.equal(source.includes('—'), false);
});
