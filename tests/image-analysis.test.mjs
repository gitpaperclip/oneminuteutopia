import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, MAX_IMAGE_BYTES, PROMPT, validateAnalysis, parseGemini, imageMime } from '../lib/hazard-analysis.mjs';
import { ANALYSIS_TIMEOUT_MS, GeminiAnalysisError, GeminiService } from '../lib/gemini.ts';
import { AnalysisStore } from '../lib/analysis-store.ts';
import { CONTEXT_TAGS, fallbackIncidentType } from '../lib/incident-taxonomy.mjs';
import { assertCompleteBaltimoreRouting, baltimoreRouteForIncidentType } from '../lib/baltimore-311-routing.mjs';
import { caseScoreFromAnalysis } from '../lib/incident-scoring.ts';

const originalEnvironments = new WeakMap();
function setEnv(t, key, value) {
  let originals = originalEnvironments.get(t);
  if (!originals) {
    originals = new Map();
    originalEnvironments.set(t, originals);
    t.after(() => {
      for (const [name, original] of originals) {
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
      }
    });
  }
  if (!originals.has(key)) originals.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function configureGemini(t, model) {
  setEnv(t, 'GOOGLE_CLOUD_PROJECT', 'test-project');
  setEnv(t, 'GOOGLE_CLOUD_LOCATION', 'global');
  setEnv(t, 'GOOGLE_SERVICE_ACCOUNT_JSON', JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' }));
  setEnv(t, 'GOOGLE_APPLICATION_CREDENTIALS', undefined);
  setEnv(t, 'GEMINI_MODEL', model);
}

function vertexFactory(handler) {
  return options => ({ generateContent: request => handler(options, request) });
}

function configureSupabase(t) {
  setEnv(t, 'SUPABASE_URL', 'https://test.supabase.co');
  setEnv(t, 'SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
  setEnv(t, 'SUPABASE_SECRET_KEY', undefined);
}

const result = {
  category: 'roads_and_sidewalks', incident_type: 'pothole',
  seriousness: 6, ai_confidence: 80,
  context_summary: 'A pothole is visible in the roadway.', context_tags: ['roadway'],
};
const jpeg = Buffer.from([255, 216, 255]);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const aiResponse = (value = result) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
});
const storedInput = {
  ...result, session_id: 'session', image_path: '/uploads/a.jpg', image_hash: 'hash', model: 'test-model',
  analysis_status: 'complete',
};

test('all 12 categories obey the distinct hazardous, clear and unassessable contracts', () => {
  assert.equal(CATEGORIES.length, 12);
  for (const category of CATEGORIES) {
    const value = category === 'unable_to_assess'
      ? { category, incident_type: 'unable_to_assess', seriousness: null, ai_confidence: 0, context_summary: 'The image cannot be assessed.', context_tags: [] }
      : { category, incident_type: fallbackIncidentType(category), seriousness: category === 'no_visible_hazard' ? 0 : 1, ai_confidence: 100, context_summary: 'Visible context was assessed.', context_tags: [] };
    assert.deepEqual(validateAnalysis(value), value);
  }
});

test('every fine-grained incident type has an explicit Baltimore disposition', () => {
  assert.equal(assertCompleteBaltimoreRouting(), true);
  assert.equal(baltimoreRouteForIncidentType('pothole').service_types[0], 'TRM-Potholes');
  assert.equal(baltimoreRouteForIncidentType('garbage_fire').disposition, 'emergency');
});

test('invalid scores, unexpected fields and impossible category/score combinations are rejected', () => {
  const invalid = [
    null, [], 'hazard', {}, { ...result, category: 'invented' },
    { ...result, seriousness: 11 }, { ...result, seriousness: 0 },
    { ...result, seriousness: null }, { ...result, seriousness: 2.5 },
    { ...result, seriousness: '6' }, { ...result, ai_confidence: '80' },
    { ...result, ai_confidence: 101 }, { ...result, ai_confidence: -1 },
    { ...result, ai_confidence: 1.5 }, { ...result, ai_confidence: NaN },
    { ...result, incident_type: 'garbage_fire' }, { ...result, context_summary: '' },
    { ...result, context_tags: ['invented'] }, { ...result, context_tags: ['roadway', 'roadway'] },
    { ...result, routing: '911' }, { ...result, category: 'unable_to_assess' },
    { ...result, category: 'unable_to_assess', incident_type: 'unable_to_assess', seriousness: null, ai_confidence: 80 },
    { ...result, category: 'no_visible_hazard' },
  ];
  for (const value of invalid) assert.throws(() => validateAnalysis(value), { status: 502 });
});

test('Gemini response parser reads final output parts and ignores private thoughts', () => {
  const data = aiResponse();
  data.candidates[0].content.parts = [
    { thought: true, text: 'Not part of the answer' },
    { text: JSON.stringify(result).slice(0, 80) },
    { text: JSON.stringify(result).slice(80) },
  ];
  assert.deepEqual(parseGemini(data), result);
});

test('refusal, truncation, malformed provider responses and invalid JSON never become low risk', () => {
  const invalid = [
    undefined, {}, { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: JSON.stringify(result) }] } }] },
    { candidates: [{ finishReason: 'STOP' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'bad json' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: ' '.repeat(4097) }] } }] },
    aiResponse({ ...result, seriousness: 99 }),
  ];
  for (const value of invalid) assert.throws(() => parseGemini(value), { status: 502 });
});

test('content MIME detection recognizes supported signatures and rejects non-images', () => {
  assert.equal(imageMime(jpeg), 'image/jpeg');
  assert.equal(imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(imageMime(Buffer.from('RIFF0000WEBP')), 'image/webp');
  for (const value of [Buffer.alloc(0), Buffer.from('<svg>'), Buffer.from([137, 80, 78]), Buffer.from('RIFF0000WAVE')]) {
    assert.throws(() => imageMime(value), { status: 415 });
  }
});

test('Vertex service sends the image with a typed provider schema', async t => {
  configureGemini(t);
  let calls = 0;
  const factory = vertexFactory(async (options, request) => {
    calls++;
    assert.equal(options.project, 'test-project');
    assert.equal(options.location, 'global');
    assert.equal(options.apiEndpoint, 'aiplatform.googleapis.com');
    assert.equal(options.model, 'gemini-3.8-flash');
    assert.equal(options.generationConfig.responseMimeType, 'application/json');
    assert.equal(options.generationConfig.responseSchema.type, 'OBJECT');
    assert.equal(options.generationConfig.responseSchema.properties.seriousness.type, 'INTEGER');
    assert.equal(options.generationConfig.responseSchema.properties.seriousness.nullable, true);
    assert.deepEqual(options.generationConfig.responseSchema.properties.context_tags.items.enum, CONTEXT_TAGS);
    assert.equal('candidateCount' in options.generationConfig, false);
    assert.equal(options.generationConfig.maxOutputTokens, 8192);
    assert.deepEqual(options.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
    assert.equal(request.contents[0].parts[0].inlineData.data, '/9j/');
    assert.equal(request.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    return { response: aiResponse() };
  });
  assert.deepEqual(await GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), result);
  assert.equal(calls, 1);
  assert.match(PROMPT, /Allowed context tags: active_flames, smoke, trash/);
});

test('Vertex model configuration uses only compatible thinking options', async t => {
  configureGemini(t);
  const models = [
    ['gemini-3.1-flash-lite', { thinkingLevel: 'minimal' }, false],
    ['gemini-3.5-flash-lite', { thinkingLevel: 'minimal' }, false],
    ['gemini-2.5-flash', { thinkingBudget: 0 }, true],
    ['gemini-3.8-flash', { thinkingLevel: 'low' }, false],
  ];
  for (const [model, thinking, hasCandidateCount] of models) {
    setEnv(t, 'GEMINI_MODEL', model);
    const factory = vertexFactory(async options => {
      assert.equal(options.model, model);
      assert.deepEqual(options.generationConfig.thinkingConfig, thinking);
      assert.equal('candidateCount' in options.generationConfig, hasCandidateCount);
      return { response: aiResponse() };
    });
    assert.deepEqual(await GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), result);
  }
});

test('invalid input and missing Vertex credentials fail before provider invocation', async t => {
  configureGemini(t);
  let calls = 0;
  const factory = vertexFactory(async () => { calls++; throw new Error('Must not call provider'); });
  for (const [bytes, mime] of [
    [Buffer.alloc(0), 'image/jpeg'], [Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/jpeg'],
    [jpeg, 'image/png'], [Buffer.from('not an image'), 'image/heic'],
  ]) await assert.rejects(() => GeminiService.analyzeImage(bytes, mime, factory));
  setEnv(t, 'GEMINI_MODEL', '../invalid/model');
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), { code: 'configuration' });
  setEnv(t, 'GEMINI_MODEL', undefined);
  setEnv(t, 'GOOGLE_SERVICE_ACCOUNT_JSON', undefined);
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), { code: 'configuration' });
  assert.equal(calls, 0);
});

test('Vertex HTTP failures are classified without retaining provider messages', async t => {
  configureGemini(t);
  for (const [status, code] of [[400, 'invalid_request'], [401, 'credentials'], [403, 'credentials'], [404, 'model_unavailable'], [429, 'rate_limited'], [503, 'provider_unavailable']]) {
    const factory = vertexFactory(async () => { throw Object.assign(new Error(`private key=test-key ${status}`), { code: status }); });
    await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), error => {
      assert.ok(error instanceof GeminiAnalysisError);
      assert.equal(error.code, code);
      assert.equal(error.httpStatus, status);
      assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /private key/);
      return true;
    });
  }
});

test('Vertex timeout wins a pending provider request', async t => {
  configureGemini(t);
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, ANALYSIS_TIMEOUT_MS);
    return controller.signal;
  });
  const factory = vertexFactory(() => new Promise(() => undefined));
  queueMicrotask(() => controller.abort(new DOMException('expired', 'TimeoutError')));
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), { code: 'timeout' });
});

test('Vertex parsing distinguishes provider stops, JSON errors and contract errors', async t => {
  configureGemini(t);
  const failures = [
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'blocked_response', undefined],
    [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'output_truncated', undefined],
    [aiResponse({ ...result, seriousness: 99 }), 'invalid_response', 'contract_validation'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] }, 'invalid_response', 'json_parse'],
    [{ candidates: [] }, 'invalid_response', 'json_parse'],
  ];
  for (const [body, code, validationStage] of failures) {
    const factory = vertexFactory(async () => ({ response: body }));
    await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg', factory), error => {
      assert.equal(error.code, code);
      assert.equal(error.validationStage, validationStage);
      return true;
    });
  }
});

test('Supabase persists the assessment using server credentials', async t => {
  configureSupabase(t);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://test.supabase.co/rest/v1/image_analyses?on_conflict=id');
    assert.equal(init.headers.apikey, 'server-secret');
    assert.equal(init.headers.Authorization, 'Bearer server-secret');
    assert.equal(init.cache, 'no-store');
    const data = JSON.parse(init.body);
    assert.match(data.id, /^[0-9a-f-]{36}$/i);
    assert.equal(data.seriousness, 6);
    assert.equal(data.ai_confidence, 80);
    assert.equal(data.analysis_status, 'complete');
    assert.equal(data.prompt_version, '3');
    assert.equal(data.incident_type, 'pothole');
    assert.equal(data.case_score, caseScoreFromAnalysis(6, 80, 'complete'));
    assert.deepEqual(data.tags, ['pothole', 'roadway']);
    assert.deepEqual(data.baltimore_service_candidates, ['TRM-Potholes', 'TRM-Pickup Pothole']);
    assert.equal(data.routing_disposition, '311');
    assert.ok(!('overall_danger' in data));
    return response([{ ...data, id: 'saved' }], 201);
  });
  const saved = await AnalysisStore.save(storedInput);
  assert.equal(saved.id, 'saved');
});

test('Supabase write failure or empty response is never reported as saved', async t => {
  configureSupabase(t);
  const mocked = t.mock.method(globalThis, 'fetch', async () => response({}, 500));
  await assert.rejects(() => AnalysisStore.save(storedInput));
  mocked.mock.mockImplementation(async () => response([]));
  await assert.rejects(() => AnalysisStore.save(storedInput));
});

test('Supabase retries a transient analysis write with one stable id', async t => {
  configureSupabase(t);
  const ids = [];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    ids.push(JSON.parse(init.body).id);
    return calls === 1 ? response({}, 503) : response([{ id: ids[0], ...result }], 201);
  });
  const saved = await AnalysisStore.save(storedInput);
  assert.equal(calls, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(saved.id, ids[0]);
});

test('invalid assessments are rejected before persisting to Supabase', async t => {
  configureSupabase(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Must not fetch'); });
  await assert.rejects(() => AnalysisStore.save({ ...storedInput, seriousness: 99 }), { status: 502 });
  assert.equal(calls, 0);
});

test('manual fallback is saved as unavailable with no fabricated seriousness', async t => {
  configureSupabase(t);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const data = JSON.parse(init.body);
    assert.equal(data.analysis_status, 'unavailable');
    assert.equal(data.category, 'unable_to_assess');
    assert.equal(data.seriousness, null);
    assert.equal(data.ai_confidence, 0);
    assert.equal(data.case_score, 0);
    return response([{ id: 'saved', ...data }], 201);
  });
  await AnalysisStore.save({
    ...storedInput, category: 'unable_to_assess', incident_type: 'unable_to_assess',
    seriousness: null, ai_confidence: 0, context_summary: 'Image analysis was unavailable.',
    context_tags: [], analysis_status: 'unavailable',
  });
});

test('owned analysis lookup includes the session restriction and rejects no match', async t => {
  configureSupabase(t);
  t.mock.method(globalThis, 'fetch', async url => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('id'), 'eq.11111111-1111-4111-8111-111111111111');
    assert.equal(query.get('session_id'), 'eq.session-owner');
    return response([]);
  });
  await assert.rejects(() => AnalysisStore.getOwned('11111111-1111-4111-8111-111111111111', 'session-owner'));
});

test('modern Supabase secret keys are never sent as JWT bearer tokens', async t => {
  configureSupabase(t);
  setEnv(t, 'SUPABASE_SECRET_KEY', 'sb_secret_test');
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.headers.apikey, 'sb_secret_test');
    assert.ok(!('Authorization' in init.headers));
    return response([{ id: 'saved', ...result }]);
  });
  await AnalysisStore.save(storedInput);
});
