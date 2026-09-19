import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, MAX_IMAGE_BYTES, validateAnalysis, parseGemini, imageMime } from '../lib/hazard-analysis.mjs';
import { ANALYSIS_TIMEOUT_MS, GeminiService } from '../lib/gemini.ts';
import { AnalysisStore } from '../lib/analysis-store.ts';

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
  setEnv(t, 'GEMINI_API_KEY', 'test-key');
  setEnv(t, 'GEMINI_MODEL', model);
}

function configureSupabase(t) {
  setEnv(t, 'SUPABASE_URL', 'https://test.supabase.co');
  setEnv(t, 'SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
  setEnv(t, 'SUPABASE_SECRET_KEY', undefined);
}

const result = { category: 'roads_and_sidewalks', seriousness: 6, ai_confidence: 80 };
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
      ? { category, seriousness: null, ai_confidence: 0 }
      : { category, seriousness: category === 'no_visible_hazard' ? 0 : 1, ai_confidence: 100 };
    assert.deepEqual(validateAnalysis(value), value);
  }
});

test('invalid scores, unexpected fields and impossible category/score combinations are rejected', () => {
  const invalid = [
    null, [], 'hazard', {}, { ...result, category: 'invented' },
    { ...result, seriousness: 11 }, { ...result, seriousness: 0 },
    { ...result, seriousness: null }, { ...result, seriousness: 2.5 },
    { ...result, seriousness: '6' }, { ...result, ai_confidence: '80' },
    { ...result, ai_confidence: 101 }, { ...result, ai_confidence: -1 },
    { ...result, ai_confidence: 1.5 }, { ...result, ai_confidence: NaN },
    { ...result, routing: '911' }, { ...result, category: 'unable_to_assess' },
    { category: 'unable_to_assess', seriousness: null, ai_confidence: 80 },
    { ...result, category: 'no_visible_hazard' },
  ];
  for (const value of invalid) assert.throws(() => validateAnalysis(value), { status: 502 });
});

test('Gemini response parser reads final output parts and ignores private thoughts', () => {
  const data = aiResponse();
  data.candidates[0].content.parts = [
    { thought: true, text: 'Not part of the answer' },
    { text: '{"category":"roads_and_sidewalks",' },
    { text: '"seriousness":6,"ai_confidence":80}' },
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

test('production Gemini service sends the image, strict schema and a bounded single request', async t => {
  configureGemini(t);
  let calls = 0;
  const signal = new AbortController().signal;
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 8000);
    assert.equal(milliseconds, ANALYSIS_TIMEOUT_MS);
    return signal;
  });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(init.headers['x-goog-api-key'], 'test-key');
    assert.ok(!url.includes('test-key'));
    assert.equal(init.signal, signal);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body);
    const config = body.generationConfig;
    assert.deepEqual(config.responseFormat.text.schema.required, ['category', 'seriousness', 'ai_confidence']);
    assert.equal(config.responseFormat.text.schema.additionalProperties, false);
    assert.deepEqual(config.responseFormat.text.schema.properties.category.enum, CATEGORIES);
    assert.equal(config.responseFormat.text.mimeType, 'application/json');
    assert.equal(config.candidateCount, 1);
    assert.equal(config.maxOutputTokens, 256);
    assert.equal(config.thinkingConfig.thinkingBudget, 0);
    assert.equal(body.contents[0].parts[0].inlineData.data, '/9j/');
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.match(body.systemInstruction.parts[0].text, /untrusted observations/);
    return response(aiResponse());
  });
  assert.deepEqual(await GeminiService.analyzeImage(jpeg, 'image/jpeg'), result);
  assert.equal(calls, 1);
});

test('model configuration is respected without sending incompatible thinking options', async t => {
  configureGemini(t, '  gemini-custom-model  ');
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(url, /gemini-custom-model:generateContent$/);
    assert.ok(!('thinkingConfig' in JSON.parse(init.body).generationConfig));
    return response(aiResponse());
  });
  await GeminiService.analyzeImage(jpeg, 'image/jpeg');
});

test('invalid input and missing credentials fail before calling Gemini', async t => {
  configureGemini(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Must not fetch'); });
  for (const [bytes, mime] of [
    [Buffer.alloc(0), 'image/jpeg'], [Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/jpeg'],
    [jpeg, 'image/png'], [Buffer.from('not an image'), 'image/heic'],
  ]) {
    await assert.rejects(() => GeminiService.analyzeImage(bytes, mime));
  }
  setEnv(t, 'GEMINI_MODEL', '../invalid/model');
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), /model ID/);
  setEnv(t, 'GEMINI_API_KEY', undefined);
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), /not configured/);
  assert.equal(calls, 0);
});

test('HTTP rate limiting and provider failure are rejected without retries or leaking response details', async t => {
  configureGemini(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return response({ error: { message: 'private provider details' } }, 429);
  });
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { message: 'Gemini request failed' });
  assert.equal(calls, 1);
});

test('the production timeout signal aborts the request and no second request is attempted', async t => {
  configureGemini(t);
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 8000);
    return controller.signal;
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      queueMicrotask(() => controller.abort(new DOMException('AI request expired', 'TimeoutError')));
    });
  });
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

test('invalid Gemini output is rejected by the production service, not just by its standalone validator', async t => {
  configureGemini(t);
  t.mock.method(globalThis, 'fetch', async () => response(aiResponse({ ...result, seriousness: 99 })));
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { status: 502 });
});

test('Supabase persists the assessment using server credentials', async t => {
  configureSupabase(t);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://test.supabase.co/rest/v1/image_analyses');
    assert.equal(init.headers.apikey, 'server-secret');
    assert.equal(init.headers.Authorization, 'Bearer server-secret');
    assert.equal(init.cache, 'no-store');
    const data = JSON.parse(init.body);
    assert.equal(data.seriousness, 6);
    assert.equal(data.ai_confidence, 80);
    assert.equal(data.analysis_status, 'complete');
    assert.equal(data.prompt_version, '1');
    assert.ok(!('overall_danger' in data));
    return response([{ id: 'saved', ...data }], 201);
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
    return response([{ id: 'saved', ...data }], 201);
  });
  await AnalysisStore.save({
    ...storedInput, category: 'unable_to_assess', seriousness: null, ai_confidence: 0, analysis_status: 'unavailable',
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
