import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('receipt page no longer shows Prepared for 311 chrome', async () => {
  const source = await readFile(new URL('../app/receipt/[id]/page.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('Prepared for 311'), false);
  assert.equal(source.includes('Copy JSON'), false);
  assert.equal(source.includes('prepare-311'), false);
  assert.equal(source.includes('CopyPacketButton'), false);
  assert.match(source, /Contact 911/);
  assert.match(source, /Mock city portal/);
  assert.match(source, /Contacts/);
  assert.match(source, /handoffsForCategory/);
});
