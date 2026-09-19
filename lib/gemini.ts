import 'server-only';

import { PROMPT, SCHEMA, parseGemini, imageMime, MAX_IMAGE_BYTES } from './hazard-analysis.mjs';

export const ANALYSIS_TIMEOUT_MS = 18_000;
const DEFAULT_MODEL = 'gemini-3.8-flash';

type FailureCode = 'configuration' | 'credentials' | 'invalid_request' | 'rate_limited'
  | 'model_unavailable' | 'provider_unavailable' | 'timeout' | 'network_error'
  | 'blocked_response' | 'output_truncated' | 'invalid_response';

const KEY_FAILURES = new Set([
  'API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_SERVICE_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED',
  'API_KEY_ANDROID_APP_BLOCKED', 'API_KEY_IOS_APP_BLOCKED',
]);
const SAFE_PROVIDER_REASONS = new Set([
  ...KEY_FAILURES, 'SERVICE_DISABLED', 'BILLING_DISABLED', 'CONSUMER_INVALID',
]);

export class GeminiAnalysisError extends Error {
  readonly code: FailureCode;
  readonly httpStatus?: number;
  readonly providerReason?: string;
  readonly finishReason?: string;
  readonly thoughtsTokenCount?: number;
  readonly candidatesTokenCount?: number;

  constructor(
    code: FailureCode,
    httpStatus?: number,
    providerReason?: string,
    finishReason?: string,
    thoughtsTokenCount?: number,
    candidatesTokenCount?: number,
  ) {
    super(`Gemini analysis failed (${code})`);
    this.name = 'GeminiAnalysisError';
    this.code = code;
    this.httpStatus = httpStatus;
    // Never retain arbitrary provider text, which can echo request data or credentials.
    this.providerReason = providerReason && SAFE_PROVIDER_REASONS.has(providerReason) ? providerReason : undefined;
    this.finishReason = finishReason;
    this.thoughtsTokenCount = thoughtsTokenCount;
    this.candidatesTokenCount = candidatesTokenCount;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

async function requestFailure(response: Response): Promise<GeminiAnalysisError> {
  const body = await response.json().catch(() => null);
  const details = record(record(body).error).details;
  const reason = Array.isArray(details)
    ? details.map(detail => record(detail).reason).find((value): value is string =>
      typeof value === 'string' && SAFE_PROVIDER_REASONS.has(value))
    : undefined;
  const status = response.status;
  let code: FailureCode = 'invalid_request';
  if ((reason && KEY_FAILURES.has(reason)) || status === 401 || status === 403) code = 'credentials';
  else if (status === 429) code = 'rate_limited';
  else if (status === 404) code = 'model_unavailable';
  else if (status >= 500) code = 'provider_unavailable';
  return new GeminiAnalysisError(code, status, reason);
}

export interface AnalysisResult {
  category: string;
  incident_type: string;
  seriousness: number | null;
  ai_confidence: number;
  context_summary: string;
  context_tags: string[];
}

export class GeminiService {
  static getModel(): string {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) {
      throw new GeminiAnalysisError('configuration');
    }
    return model;
  }

  static async analyzeImage(imageBuffer: Buffer, mimeType: string): Promise<AnalysisResult> {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new GeminiAnalysisError('configuration');
    if (imageBuffer.length > MAX_IMAGE_BYTES || imageBuffer.length === 0) throw new Error('Image size is invalid');
    // The upload route decodes and normalizes the image before calling this service.
    if (imageMime(imageBuffer) !== mimeType) {
      throw new Error('Image content does not match its file type');
    }
    const model = this.getModel();
    const signal = AbortSignal.timeout(ANALYSIS_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal,
          cache: 'no-store',
          redirect: 'error',
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: PROMPT }] },
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBuffer.toString('base64') } }] }],
            generationConfig: {
              // Gemini 3.x rejects candidateCount; earlier models require it.
              ...(model.startsWith('gemini-3.') ? {} : { candidateCount: 1 }),
              // Gemini 3.8 Flash thinking (even on 'low') plus JSON output requires more headroom.
              // For models without thinking or with thinking disabled, 8192 is safely above need.
              maxOutputTokens: 8192,
              // Flash 2.5 otherwise spends a variable budget thinking before a small classification.
              ...(['gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(model)
                ? { thinkingConfig: { thinkingBudget: 0 } }
                : {}),
              ...(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'].includes(model)
                ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } }
                : {}),
              // Gemini 3.8 Flash enables thinking by default; 'low' provides fast inference with thinking headroom.
              ...(model.startsWith('gemini-3.8-flash')
                ? { thinkingConfig: { thinkingLevel: 'low' } }
                : {}),
              // Use the established generateContent JSON Schema fields.
              responseMimeType: 'application/json',
              responseJsonSchema: SCHEMA,
            },
          }),
        },
      );
      if (!response.ok) throw await requestFailure(response);
      const data: unknown = await response.json().catch(() => {
        throw new GeminiAnalysisError('invalid_response');
      });
      const candidates = record(data).candidates;
      const finishReason = Array.isArray(candidates) ? record(candidates[0]).finishReason : undefined;
      const usage = record(data).usageMetadata;
      const thoughtsToken = record(usage).thoughtsTokenCount;
      const thoughtsTokenCount = typeof thoughtsToken === 'number' ? thoughtsToken : undefined;
      const candidatesToken = record(usage).candidatesTokenCount;
      const candidatesTokenCount = typeof candidatesToken === 'number' ? candidatesToken : undefined;
      if (record(record(data).promptFeedback).blockReason ||
        ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT'].includes(String(finishReason))) {
        throw new GeminiAnalysisError('blocked_response', undefined, undefined, String(finishReason), thoughtsTokenCount, candidatesTokenCount);
      }
      if (finishReason === 'MAX_TOKENS') throw new GeminiAnalysisError('output_truncated', undefined, undefined, String(finishReason), thoughtsTokenCount, candidatesTokenCount);
      try {
        return parseGemini(data) as AnalysisResult;
      } catch {
        throw new GeminiAnalysisError('invalid_response', undefined, undefined, String(finishReason), thoughtsTokenCount, candidatesTokenCount);
      }
    } catch (error) {
      // The same deadline covers both the request and reading its response body.
      if (signal.aborted) throw new GeminiAnalysisError('timeout');
      if (error instanceof GeminiAnalysisError) throw error;
      throw new GeminiAnalysisError('network_error');
    }
  }
}
