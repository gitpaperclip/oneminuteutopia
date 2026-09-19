import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, MAX_IMAGE_BYTES, validateAnalysis, parseGemini, imageMime } from '../lib/hazard-analysis.mjs';
import { ANALYSIS_TIMEOUT_MS, GeminiAnalysisError, GeminiService } from '../lib/gemini.ts';
import { AnalysisStore } from '../lib/analysis-store.ts';
import { fallbackIncidentType, INCIDENT_TYPES } from '../lib/incident-taxonomy.mjs';
import { assertCompleteBaltimoreRouting, baltimoreRouteForIncidentType } from '../lib/baltimore-311-routing.mjs';

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

test('production Gemini service sends the image, strict schema and a bounded single request', async t => {
  configureGemini(t);
  setEnv(t, 'GEMINI_API_KEY', '  test-key\n');
  let calls = 0;
  const signal = new AbortController().signal;
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 18000);
    assert.equal(milliseconds, ANALYSIS_TIMEOUT_MS);
    return signal;
  });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(init.headers['x-goog-api-key'], 'test-key');
    assert.ok(!url.includes('test-key'));
    assert.equal(init.signal, signal);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body);
    const config = body.generationConfig;
    assert.deepEqual(config.responseJsonSchema.required, ['category', 'incident_type', 'seriousness', 'ai_confidence', 'context_summary', 'context_tags']);
    assert.equal(config.responseJsonSchema.additionalProperties, false);
    assert.deepEqual(config.responseJsonSchema.properties.category.enum, CATEGORIES);
    assert.deepEqual(config.responseJsonSchema.properties.incident_type.enum, INCIDENT_TYPES);
    assert.deepEqual(config.responseJsonSchema.properties.seriousness, { type: ['integer', 'null'], minimum: 0, maximum: 10 });
    assert.equal(config.responseMimeType, 'application/json');
    assert.equal('responseFormat' in config, false);
    assert.equal('responseSchema' in config, false);
    // Gemini 3.x rejects candidateCount (HTTP 400), so it must be omitted.
    assert.equal('candidateCount' in config, false);
    assert.equal(config.maxOutputTokens, 8192);
    assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'low' });
    assert.equal(body.contents[0].parts[0].inlineData.data, '/9j/');
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.match(body.systemInstruction.parts[0].text, /untrusted observations/);
    return response(aiResponse());
  });
  assert.deepEqual(await GeminiService.analyzeImage(jpeg, 'image/jpeg'), result);
  assert.equal(calls, 1);
});

test('model configuration is respected without sending incompatible thinking options', async t => {
  configureGemini(t);
  let expectedModel;
  let expectedThinking;
  let expectedHasCandidateCount;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${expectedModel}:generateContent`);
    const config = JSON.parse(init.body).generationConfig;
    assert.equal(config.maxOutputTokens, 8192);
    // Gemini 3.x rejects candidateCount (HTTP 400); earlier models require it.
    assert.equal('candidateCount' in config, expectedHasCandidateCount);
    if (expectedHasCandidateCount) assert.equal(config.candidateCount, 1);
    assert.deepEqual(config.thinkingConfig, expectedThinking);
    if (expectedThinking === undefined) assert.equal('thinkingConfig' in config, false);
    return response(aiResponse());
  });
  const models = [
<<<<<<< HEAD
    ['gemini-3.8-flash', { thinkingLevel: 'low' }],
    ['gemini-3.5-flash-lite', { thinkingLevel: 'MINIMAL' }],
    ['gemini-2.5-flash', { thinkingBudget: 0 }],
    ['gemini-2.5-flash-lite', { thinkingBudget: 0 }],
    ['gemini-custom-model', undefined],
    ['gemini-3.1-flash-lite-image', undefined],
    ['gemini-3.5-flash-lite-preview', undefined],
=======
    ['gemini-3.1-flash-lite', { thinkingLevel: 'MINIMAL' }, false],
    ['gemini-3.5-flash-lite', { thinkingLevel: 'MINIMAL' }, false],
    ['gemini-2.5-flash', { thinkingBudget: 0 }, true],
    ['gemini-2.5-flash-lite', { thinkingBudget: 0 }, true],
    ['gemini-3.8-flash', { thinkingLevel: 'low' }, false],
    ['gemini-3.8-flash-lite', { thinkingLevel: 'low' }, false],
    ['gemini-custom-model', undefined, true],
    ['gemini-3.1-flash-lite-image', undefined, false],
    ['gemini-3.5-flash-lite-preview', undefined, false],
>>>>>>> 743bfcd (Fix Gemini 3.8 Flash soft-fail: remove candidateCount, raise tokens and timeout)
  ];
  for (const [model, thinking, hasCandidateCount] of models) {
    expectedModel = model;
    expectedThinking = thinking;
    expectedHasCandidateCount = hasCandidateCount;
    setEnv(t, 'GEMINI_MODEL', `  ${model}  `);
    assert.equal(GeminiService.getModel(), model);
    assert.deepEqual(await GeminiService.analyzeImage(jpeg, 'image/jpeg'), result);
  }
  assert.equal(calls, models.length);
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
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { name: 'GeminiAnalysisError', code: 'configuration' });
  setEnv(t, 'GEMINI_MODEL', undefined);
  for (const key of [undefined, '', '  \n']) {
    setEnv(t, 'GEMINI_API_KEY', key);
    await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { name: 'GeminiAnalysisError', code: 'configuration' });
  }
  assert.equal(calls, 0);
});

test('HTTP failures are classified without retries or retaining provider messages and secrets', async t => {
  configureGemini(t);
  let calls = 0;
  let status;
  let providerReason;
  const privateText = 'private provider details: key=test-key and image=/9j/';
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return response({ error: {
      message: privateText,
      details: [{ reason: providerReason, metadata: { secret: privateText } }],
    } }, status);
  });
  const failures = [
    [400, undefined, 'invalid_request'],
    [400, 'API_KEY_INVALID', 'credentials'],
    [401, undefined, 'credentials'],
    [403, 'SERVICE_DISABLED', 'credentials'],
    [403, 'API_KEY_HTTP_REFERRER_BLOCKED', 'credentials'],
    [404, undefined, 'model_unavailable'],
    [429, undefined, 'rate_limited'],
    [503, undefined, 'provider_unavailable'],
    [500, privateText, 'provider_unavailable'],
  ];
  for (const [httpStatus, reason, code] of failures) {
    status = httpStatus;
    providerReason = reason;
    const callsBefore = calls;
    await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), error => {
      assert.ok(error instanceof GeminiAnalysisError);
      assert.equal(error.code, code);
      assert.equal(error.httpStatus, httpStatus);
      assert.equal(error.providerReason, reason === privateText ? undefined : reason);
      assert.equal(error.message, `Gemini analysis failed (${code})`);
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message, stack: error.stack }), /private provider|test-key|\/9j\//);
      return true;
    });
    assert.equal(calls, callsBefore + 1);
  }
});

test('non-JSON HTTP errors retain their status category without exposing the body', async t => {
  configureGemini(t);
  t.mock.method(globalThis, 'fetch', async () => new Response('private HTML containing test-key', { status: 502 }));
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), {
    name: 'GeminiAnalysisError', code: 'provider_unavailable', httpStatus: 502,
    providerReason: undefined, message: 'Gemini analysis failed (provider_unavailable)',
  });
});

test('network errors become safe diagnostic categories without retaining their original cause', async t => {
  configureGemini(t);
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('private connection URL with key=test-key');
  });
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), error => {
    assert.equal(error.code, 'network_error');
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(`${error.stack} ${JSON.stringify(error)}`, /private connection|test-key/);
    return true;
  });
});

test('the production timeout signal aborts the request and no second request is attempted', async t => {
  configureGemini(t);
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 18000);
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
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { name: 'GeminiAnalysisError', code: 'timeout' });
  assert.equal(calls, 1);
});

for (const status of [200, 429]) {
  test(`the same deadline covers reading a ${status} response body after headers arrive`, async t => {
    configureGemini(t);
    const controller = new AbortController();
    t.mock.method(AbortSignal, 'timeout', milliseconds => {
      assert.equal(milliseconds, 18000);
      return controller.signal;
    });
    let calls = 0;
    let bodyReadStarted = false;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      calls++;
      const body = new ReadableStream({ start(stream) {
        stream.enqueue(new TextEncoder().encode('{'));
        init.signal.addEventListener('abort', () => stream.error(init.signal.reason), { once: true });
      } });
      const reply = new Response(body, { status });
      const readJSON = reply.json.bind(reply);
      reply.json = () => {
        bodyReadStarted = true;
        const pending = readJSON();
        queueMicrotask(() => controller.abort(new DOMException('Response body expired', 'TimeoutError')));
        return pending;
      };
      return reply;
    });
    await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), { name: 'GeminiAnalysisError', code: 'timeout' });
    assert.equal(bodyReadStarted, true);
    assert.equal(calls, 1);
  });
}

test('production parsing distinguishes blocked, truncated and invalid responses', async t => {
  configureGemini(t);
  let currentResponse;
  t.mock.method(globalThis, 'fetch', async () => currentResponse);
  const failures = [
    [{ promptFeedback: { blockReason: 'SAFETY' } }, 'blocked_response'],
    ...['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT']
      .map(finishReason => [{ candidates: [{ finishReason }] }, 'blocked_response']),
    [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'output_truncated'],
    [aiResponse({ ...result, seriousness: 99 }), 'invalid_response'],
    [{ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON: test-key' }] } }] }, 'invalid_response'],
    [{ candidates: [] }, 'invalid_response'],
    [null, 'invalid_response'],
  ];
  for (const [body, code] of failures) {
    currentResponse = response(body);
    await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), {
      name: 'GeminiAnalysisError', code, message: `Gemini analysis failed (${code})`,
    });
  }
  currentResponse = new Response('private invalid JSON: test-key');
  await assert.rejects(() => GeminiService.analyzeImage(jpeg, 'image/jpeg'), {
    name: 'GeminiAnalysisError', code: 'invalid_response', message: 'Gemini analysis failed (invalid_response)',
  });
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
    assert.equal(data.prompt_version, '2');
    assert.equal(data.incident_type, 'pothole');
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
