import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReport } from '../lib/report-pipeline.ts';
import { AnalysisStorageError } from '../lib/analysis-store.ts';

const jpeg = Buffer.from([255, 216, 255]);
const image = { path: 'https://test.supabase.co/storage/v1/object/public/report-photos/photo.jpg', hash: 'saved-image-hash' };
const assessment = { category: 'roads_and_sidewalks', seriousness: 6, ai_confidence: 80 };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createServices(overrides = {}) {
  const savedInputs = [];
  const deletedImages = [];
  const services = {
    storage: {
      saveImage: async () => image,
      deleteImage: async path => { deletedImages.push(path); },
      ...overrides.storage,
    },
    gemini: {
      getModel: () => 'gemini-2.5-flash',
      analyzeImage: async () => assessment,
      ...overrides.gemini,
    },
    analyses: {
      save: async input => { savedInputs.push(input); return { id: 'saved-analysis', report_id: null, ...input }; },
      ...overrides.analyses,
    },
  };
  return { services, savedInputs, deletedImages };
}

test('storage and AI start concurrently, and review waits for the durable assessment', async () => {
  const storage = deferred();
  const gemini = deferred();
  const persistence = deferred();
  const calls = [];
  const { services } = createServices({
    storage: { saveImage: (bytes, mime) => {
      assert.equal(bytes, jpeg); assert.equal(mime, 'image/jpeg');
      calls.push('storage'); return storage.promise;
    } },
    gemini: { analyzeImage: (bytes, mime) => {
      assert.equal(bytes, jpeg); assert.equal(mime, 'image/jpeg');
      calls.push('gemini'); return gemini.promise;
    } },
    analyses: { save: input => { calls.push('persist'); return persistence.promise.then(() => ({ id: 'saved-analysis', ...input })); } },
  });
  let returned = false;
  const pending = prepareReport(jpeg, 'session-owner', services).then(value => { returned = true; return value; });
  assert.deepEqual(calls, ['storage', 'gemini']);
  gemini.resolve(assessment);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['storage', 'gemini']);
  storage.resolve(image);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['storage', 'gemini', 'persist']);
  assert.equal(returned, false);
  persistence.resolve();
  const value = await pending;
  assert.equal(value.success, true);
  assert.equal(value.analysis_id, 'saved-analysis');
  assert.equal(value.analysis_status, 'complete');
  assert.deepEqual(value.analysis, assessment);
  assert.equal('warning' in value, false);
  assert.ok(Number.isInteger(value.processing_ms) && value.processing_ms >= 0);
});

test('AI outages, timeouts and invalid responses preserve a manually reportable photo', async () => {
  for (const failure of [
    new Error('GEMINI_API_KEY is not configured'),
    new DOMException('Deadline exceeded', 'TimeoutError'),
    new Error('Gemini request failed'),
    new Error('AI returned an invalid assessment'),
  ]) {
    const { services, savedInputs } = createServices({ gemini: { analyzeImage: async () => { throw failure; } } });
    const value = await prepareReport(jpeg, 'session-owner', services);
    assert.equal(value.success, true);
    assert.equal(value.analysis_status, 'unavailable');
    assert.equal(value.image_path, image.path);
    assert.deepEqual(value.analysis, { category: 'unable_to_assess', seriousness: null, ai_confidence: 0 });
    assert.match(value.warning, /manual report/);
    assert.equal(savedInputs.length, 1);
    assert.equal(savedInputs[0].analysis_status, 'unavailable');
    assert.equal(savedInputs[0].session_id, 'session-owner');
    assert.equal(savedInputs[0].model, 'gemini-2.5-flash');
    assert.equal(savedInputs[0].image_hash, image.hash);
  }
});

test('a completed but uncertain model response stays distinct from a service outage', async () => {
  const uncertain = { category: 'unable_to_assess', seriousness: null, ai_confidence: 0 };
  const { services, savedInputs } = createServices({ gemini: { analyzeImage: async () => uncertain } });
  const value = await prepareReport(jpeg, 'session-owner', services);
  assert.deepEqual(value.analysis, uncertain);
  assert.equal(value.analysis_status, 'complete');
  assert.equal(savedInputs[0].analysis_status, 'complete');
  assert.equal('warning' in value, false);
});

test('an invalid model setting cannot block a manually reportable saved photo', async () => {
  const configurationError = new Error('GEMINI_MODEL must be a model ID');
  const { services, savedInputs } = createServices({ gemini: {
    analyzeImage: async () => { throw configurationError; },
    getModel: () => { throw configurationError; },
  } });
  const value = await prepareReport(jpeg, 'session-owner', services);
  assert.equal(value.success, true);
  assert.equal(value.analysis_status, 'unavailable');
  assert.deepEqual(value.analysis, { category: 'unable_to_assess', seriousness: null, ai_confidence: 0 });
  assert.equal(savedInputs[0].model, 'unavailable');
  assert.equal(savedInputs[0].image_path, image.path);
  assert.match(value.warning, /manual report/);
});

test('review returns the fields from the persisted analysis, not an unsaved draft', async () => {
  const durable = { category: 'other_hazard', seriousness: 3, ai_confidence: 65 };
  const { services } = createServices({ analyses: { save: async input => ({
    ...input, ...durable, id: 'durable-row-id', image_path: 'stored-photo-url', image_hash: 'stored-photo-hash',
  }) } });
  const value = await prepareReport(jpeg, 'session-owner', services);
  assert.equal(value.analysis_id, 'durable-row-id');
  assert.equal(value.image_path, 'stored-photo-url');
  assert.equal(value.image_hash, 'stored-photo-hash');
  assert.deepEqual(value.analysis, durable);
});

test('a failed photo upload never saves an analysis or returns success', async () => {
  const { services, savedInputs, deletedImages } = createServices({ storage: {
    saveImage: async () => { throw new Error('Storage unavailable'); },
  } });
  await assert.rejects(prepareReport(jpeg, 'session-owner', services), /Photo storage failed/);
  assert.deepEqual(savedInputs, []);
  assert.deepEqual(deletedImages, []);
});

test('simultaneous photo and AI failures are both handled and never save a draft', async () => {
  const { services, savedInputs } = createServices({
    storage: { saveImage: async () => { throw new Error('Storage unavailable'); } },
    gemini: { analyzeImage: async () => { throw new Error('AI unavailable'); } },
  });
  await assert.rejects(prepareReport(jpeg, 'session-owner', services), /Photo storage failed/);
  assert.deepEqual(savedInputs, []);
});

test('a definitively rejected analysis write fails and cleans up its unused photo', async () => {
  for (const status of [400, 401, 403, 404]) {
    const failure = new AnalysisStorageError(status);
    const { services, deletedImages } = createServices({ analyses: {
      save: async () => { throw failure; },
    } });
    await assert.rejects(prepareReport(jpeg, 'session-owner', services), error => error === failure);
    assert.deepEqual(deletedImages, [image.path]);
  }
});

test('ambiguous upstream write errors preserve the photo in case the write committed', async () => {
  const failures = [
    new Error('Supabase analysis storage request failed'),
    ...[500, 502, 503, 504].map(status => new AnalysisStorageError(status)),
  ];
  for (const failure of failures) {
    const { services, deletedImages } = createServices({ analyses: { save: async () => { throw failure; } } });
    await assert.rejects(prepareReport(jpeg, 'session-owner', services), error => error === failure);
    assert.deepEqual(deletedImages, []);
  }
});

test('a timed-out save fails without deleting a photo that might have been committed', async () => {
  const failure = new DOMException('Persistence deadline', 'TimeoutError');
  const { services, deletedImages } = createServices({ analyses: { save: async () => { throw failure; } } });
  await assert.rejects(prepareReport(jpeg, 'session-owner', services), error => error === failure);
  assert.deepEqual(deletedImages, []);
});

test('cleanup failure cannot turn a rejected save into a successful report', async () => {
  const failure = new AnalysisStorageError(403);
  const { services } = createServices({
    analyses: { save: async () => { throw failure; } },
    storage: { deleteImage: async () => { throw new Error('Cleanup unavailable'); } },
  });
  await assert.rejects(prepareReport(jpeg, 'session-owner', services), error => error === failure);
});
