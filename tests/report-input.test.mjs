import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeImage } from '../lib/image-processing.ts';
import { validateReportInput } from '../lib/report-input.ts';
import { readLimitedBody, checkRequestOrigin } from '../lib/request-body.ts';

const valid = { analysis_id: '11111111-1111-4111-8111-111111111111', category: 'other_hazard', location_source: 'manual', location_address: 'Main Street' };
test('invalid report fields are rejected and manual corrections drop stale GPS', () => {
  assert.equal(validateReportInput({ ...valid, latitude: 4, longitude: 5, location_accuracy: 10 }).latitude, null);
  for (const update of [{ category: 'unknown' }, { category: 'unable_to_assess' }, { analysis_id: 'forged' }, { latitude: NaN, longitude: 1 }, { latitude: 91, longitude: 1 }, { latitude: 1 }, { location_address: '' }, { user_description: 'a'.repeat(2001) }, { location_accuracy: -1 }, { location_source: 'photo' }]) {
    assert.throws(() => validateReportInput({ ...valid, ...update }));
  }
  assert.throws(() => validateReportInput(null));
  const gps = validateReportInput({ ...valid, location_source: 'gps', location_address: null, latitude: 0, longitude: 0 });
  assert.equal(gps.latitude, 0);
});

test('image normalization really decodes, bounds dimensions and strips EXIF', async () => {
  const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: 'green' } }).jpeg().withExif({ IFD0: { Artist: 'Private metadata' } }).toBuffer();
  const output = await normalizeImage(original);
  const info = await sharp(output).metadata();
  assert.equal(info.width, 1600);
  assert.equal(info.height, 800);
  assert.equal(info.format, 'jpeg');
  assert.equal(info.exif, undefined);
  await assert.rejects(normalizeImage(Buffer.from([255,216,255,0,0,0])), e => e.status === 415);
  await assert.rejects(normalizeImage(Buffer.alloc(3 * 1024 * 1024 + 1)), e => e.status === 413);
});

test('bounded body rejects chunked oversize and origin checks reject cross-site requests', async () => {
  const req = new Request('https://example.test/api/upload', { method: 'POST', body: 'too big' });
  await assert.rejects(readLimitedBody(req, 3), e => e.status === 413);
  const okay = new Request('https://example.test/api/submit', { method: 'POST', body: '{}', headers: { origin: 'https://example.test' } });
  checkRequestOrigin(okay);
  assert.equal(new TextDecoder().decode(await readLimitedBody(okay, 10)), '{}');
  assert.throws(() => checkRequestOrigin(new Request('https://example.test/api/submit', { headers: { origin: 'https://attacker.test' } })), e => e.status === 403);
});
