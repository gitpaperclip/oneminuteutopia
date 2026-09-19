import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReport } from '../lib/report-pipeline.ts';
import { AnalysisStorageError } from '../lib/analysis-store.ts';
import { GeminiAnalysisError, GeminiService } from '../lib/gemini.ts';
import { normalizedTags } from '../lib/incident-taxonomy.mjs';
import { baltimoreRouteForIncidentType } from '../lib/baltimore-311-routing.mjs';

const jpeg = Buffer.from([255, 216, 255]);
const image = { path: 'https://test.supabase.co/storage/v1/object/public/report-photos/photo.jpg', hash: 'saved-image-hash' };
const assessment = {
  category: 'roads_and_sidewalks', incident_type: 'pothole', seriousness: 6, ai_confidence: 80,
  context_summary: 'A pothole is visible in the roadway.', context_tags: ['roadway'],
};
const unavailable = {
  category: 'unable_to_assess', incident_type: 'unable_to_assess', seriousness: null, ai_confidence: 0,
  context_summary: 'Image analysis was unavailable.', context_tags: [], tags: ['unable_to_assess'],
  baltimore_service_candidates: [], routing_disposition: 'manual_review',
};

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
      save: async input => {
        savedInputs.push(input);
        const route = baltimoreRouteForIncidentType(input.incident_type);
        return {
          id: 'saved-analysis', report_id: null, ...input,
          tags: normalizedTags(input.incident_type, input.context_tags),
          baltimore_service_candidates: [...route.service_types], routing_disposition: route.disposition,
        };
      },
      ...overrides.analyses,
    },
  };
  return { services, savedInputs, deletedImages };
}

test('storage and AI start concurrently, and review waits for the durable assessment', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
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
    analyses: { save: input => { calls.push('persist'); return persistence.promise.then(() => ({
      id: 'saved-analysis', ...input, tags: normalizedTags(input.incident_type, input.context_tags),
      baltimore_service_candidates: [...baltimoreRouteForIncidentType(input.incident_type).service_types],
      routing_disposition: baltimoreRouteForIncidentType(input.incident_type).disposition,
    })); } },
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
  assert.deepEqual(value.analysis, {
    ...assessment, tags: ['pothole', 'roadway'],
    baltimore_service_candidates: ['TRM-Potholes', 'TRM-Pickup Pothole'], routing_disposition: '311',
  });
  assert.equal('warning' in value, false);
  assert.equal(warnings.mock.callCount(), 0);
  assert.ok(Number.isInteger(value.processing_ms) && value.processing_ms >= 0);
});

test('AI outages, timeouts and invalid responses preserve a manually reportable photo with a correlated diagnostic', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  for (const failure of [
    new GeminiAnalysisError('configuration'),
    new GeminiAnalysisError('timeout'),
    new GeminiAnalysisError('rate_limited', 429),
    new GeminiAnalysisError('invalid_response'),
  ]) {
    const warningsBefore = warnings.mock.callCount();
    const { services, savedInputs } = createServices({ gemini: { analyzeImage: async () => { throw failure; } } });
    const value = await prepareReport(jpeg, 'session-owner', services);
    assert.equal(value.success, true);
    assert.equal(value.analysis_status, 'unavailable');
    assert.equal(value.image_path, image.path);
    assert.deepEqual(value.analysis, unavailable);
    assert.match(value.warning, /manual report/);
    assert.equal(savedInputs.length, 1);
    assert.equal(savedInputs[0].analysis_status, 'unavailable');
    assert.equal(savedInputs[0].session_id, 'session-owner');
    assert.equal(savedInputs[0].model, 'gemini-2.5-flash');
    assert.equal(savedInputs[0].image_hash, image.hash);
    assert.equal(warnings.mock.callCount(), warningsBefore + 1);
    const [event, serialized] = warnings.mock.calls.at(-1).arguments;
    const diagnostic = JSON.parse(serialized);
    assert.equal(event, 'image_analysis_unavailable');
    assert.equal(diagnostic.analysis_id, value.analysis_id);
    assert.equal(diagnostic.model, 'gemini-2.5-flash');
    assert.equal(diagnostic.code, failure.code);
    assert.equal(diagnostic.http_status, failure.httpStatus);
    assert.ok(Number.isInteger(diagnostic.processing_ms) && diagnostic.processing_ms >= 0);
  }
});

test('a completed but uncertain model response stays distinct from a service outage', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const uncertain = {
    category: 'unable_to_assess', incident_type: 'unable_to_assess', seriousness: null, ai_confidence: 0,
    context_summary: 'The image is too unclear to assess.', context_tags: [],
  };
  const { services, savedInputs } = createServices({ gemini: { analyzeImage: async () => uncertain } });
  const value = await prepareReport(jpeg, 'session-owner', services);
  assert.deepEqual(value.analysis, {
    ...uncertain, tags: ['unable_to_assess'],
    baltimore_service_candidates: [], routing_disposition: 'manual_review',
  });
  assert.equal(value.analysis_status, 'complete');
  assert.equal(savedInputs[0].analysis_status, 'complete');
  assert.equal('warning' in value, false);
  assert.equal(warnings.mock.callCount(), 0);
});

test('an invalid model setting cannot block a manually reportable saved photo', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const configurationError = new GeminiAnalysisError('configuration');
  const { services, savedInputs } = createServices({ gemini: {
    analyzeImage: async () => { throw configurationError; },
    getModel: () => { throw configurationError; },
  } });
  const value = await prepareReport(jpeg, 'session-owner', services);
  assert.equal(value.success, true);
  assert.equal(value.analysis_status, 'unavailable');
  assert.deepEqual(value.analysis, unavailable);
  assert.equal(savedInputs[0].model, 'unavailable');
  assert.equal(savedInputs[0].image_path, image.path);
  assert.match(value.warning, /manual report/);
  assert.equal(warnings.mock.callCount(), 1);
  const diagnostic = JSON.parse(warnings.mock.calls[0].arguments[1]);
  assert.equal(diagnostic.code, 'configuration');
  assert.equal(diagnostic.model, 'unavailable');
});

test('an actual provider rejection exposes only safe diagnostics after persisting the manual assessment', async t => {
  const originals = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMINI_MODEL: process.env.GEMINI_MODEL };
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.GEMINI_API_KEY = 'private-api-key';
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  const privateProviderText = 'private-provider-body with private-api-key and secret-session';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: {
    message: privateProviderText,
    details: [{ reason: 'API_KEY_INVALID', metadata: { key: 'private-api-key', session: 'secret-session' } }],
  } }), { status: 400 }));
  let persisted = false;
  const warnings = t.mock.method(console, 'warn', () => { assert.equal(persisted, true); });
  const { services } = createServices({
    gemini: { getModel: () => GeminiService.getModel(), analyzeImage: GeminiService.analyzeImage.bind(GeminiService) },
    analyses: { save: async input => { persisted = true; return { ...input, id: 'saved-failed-assessment' }; } },
  });
  const value = await prepareReport(jpeg, 'secret-session', services);
  assert.equal(value.analysis_status, 'unavailable');
  assert.equal(warnings.mock.callCount(), 1);
  const [event, serialized] = warnings.mock.calls[0].arguments;
  const diagnostic = JSON.parse(serialized);
  assert.equal(event, 'image_analysis_unavailable');
  assert.equal(diagnostic.analysis_id, 'saved-failed-assessment');
  assert.equal(diagnostic.code, 'credentials');
  assert.equal(diagnostic.http_status, 400);
  assert.equal(diagnostic.provider_reason, 'API_KEY_INVALID');
  assert.deepEqual(Object.keys(diagnostic).sort(), ['analysis_id', 'code', 'http_status', 'model', 'processing_ms', 'provider_reason']);
  assert.doesNotMatch(JSON.stringify(warnings.mock.calls[0].arguments), /private-api-key|private-provider-body|secret-session|\/9j\/|photo\.jpg|saved-image-hash/);
  assert.doesNotMatch(JSON.stringify(value), /private-api-key|private-provider-body|secret-session|API_KEY_INVALID|credentials|http_status|provider_reason/);
});

test('unknown errors and forged diagnostic fields cannot leak through logs or the browser response', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const privateText = 'private-api-key and private-provider-body and secret-session';
  const failures = [
    Object.assign(new Error(privateText), { code: privateText, httpStatus: 403, providerReason: privateText }),
    { message: privateText, code: privateText, stack: privateText, providerReason: privateText },
    privateText,
  ];
  for (const failure of failures) {
    const { services } = createServices({ gemini: { analyzeImage: async () => { throw failure; } } });
    const value = await prepareReport(jpeg, 'secret-session', services);
    const logArguments = warnings.mock.calls.at(-1).arguments;
    const diagnostic = JSON.parse(logArguments[1]);
    assert.equal(diagnostic.code, 'unknown');
    assert.equal('http_status' in diagnostic, false);
    assert.equal('provider_reason' in diagnostic, false);
    assert.equal(diagnostic.analysis_id, value.analysis_id);
    assert.doesNotMatch(JSON.stringify(logArguments), /private-api-key|private-provider-body|secret-session/);
    assert.doesNotMatch(JSON.stringify(value), /private-api-key|private-provider-body|secret-session/);
  }
  assert.equal(warnings.mock.callCount(), failures.length);
});

test('review returns the fields from the persisted analysis, not an unsaved draft', async () => {
  const durable = {
    category: 'other_hazard', incident_type: 'other_hazard', seriousness: 3, ai_confidence: 65,
    context_summary: 'Loose debris is visible.', context_tags: ['debris'], tags: ['debris', 'other_hazard'],
    baltimore_service_candidates: ['ECC-Citizen Complaint or Concern'], routing_disposition: 'manual_review',
  };
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
