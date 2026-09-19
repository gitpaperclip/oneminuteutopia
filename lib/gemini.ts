import 'server-only';

import {
  SchemaType, VertexAI,
  type GenerateContentRequest, type GenerateContentResult,
  type GenerationConfig, type ResponseSchema,
} from '@google-cloud/vertexai';
import { PROMPT, GEMINI_SCHEMA, parseGemini, imageMime, MAX_IMAGE_BYTES } from './hazard-analysis.mjs';
import { CONTEXT_TAGS } from './incident-taxonomy.mjs';

export const ANALYSIS_TIMEOUT_MS = 18_000;
export const RATE_LIMIT_MAX_ATTEMPTS = 3;
export const RATE_LIMIT_BACKOFF_BASE_MS = 750;
export const RATE_LIMIT_BACKOFF_CAP_MS = 4_000;
const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_PROJECT = 'project-0e7457ec-0481-4abd-b67';
const DEFAULT_LOCATION = 'global';

type FailureCode = 'configuration' | 'credentials' | 'invalid_request' | 'rate_limited'
  | 'model_unavailable' | 'provider_unavailable' | 'timeout' | 'network_error'
  | 'blocked_response' | 'output_truncated' | 'invalid_response';

type ValidationStage = 'json_parse' | 'contract_validation';
const SAFE_PROVIDER_REASONS = new Set([
  'SERVICE_DISABLED', 'BILLING_DISABLED', 'CONSUMER_INVALID',
]);

// Vertex responseSchema is an OpenAPI-style schema. It is not interchangeable
// with the JSON Schema used by the Gemini Developer API.
const VERTEX_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    category: { type: SchemaType.STRING, enum: [...GEMINI_SCHEMA.properties.category.enum] },
    incident_type: { type: SchemaType.STRING },
    seriousness: { type: SchemaType.INTEGER, nullable: true },
    ai_confidence: { type: SchemaType.INTEGER },
    context_summary: { type: SchemaType.STRING },
    context_tags: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING, enum: [...CONTEXT_TAGS] },
    },
  },
  required: [...GEMINI_SCHEMA.required],
};

export class GeminiAnalysisError extends Error {
  readonly code: FailureCode;
  readonly httpStatus?: number;
  readonly providerReason?: string;
  readonly finishReason?: string;
  readonly thoughtsTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly validationStage?: ValidationStage;

  constructor(
    code: FailureCode,
    httpStatus?: number,
    providerReason?: string,
    finishReason?: string,
    thoughtsTokenCount?: number,
    candidatesTokenCount?: number,
    validationStage?: ValidationStage,
  ) {
    super(`Gemini analysis failed (${code})`);
    this.name = 'GeminiAnalysisError';
    this.code = code;
    this.httpStatus = httpStatus;
    // Never retain arbitrary provider text, which can echo request data.
    this.providerReason = providerReason && SAFE_PROVIDER_REASONS.has(providerReason) ? providerReason : undefined;
    this.finishReason = finishReason;
    this.thoughtsTokenCount = thoughtsTokenCount;
    this.candidatesTokenCount = candidatesTokenCount;
    this.validationStage = validationStage;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function getVertexConfig(): { project: string; location: string; credentials?: object } {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || DEFAULT_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_LOCATION;
  
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountJson) {
    try {
      const credentials = JSON.parse(serviceAccountJson);
      return { project, location, credentials };
    } catch {
      throw new GeminiAnalysisError('configuration');
    }
  }
  
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credentialsPath) {
    return { project, location };
  }
  
  throw new GeminiAnalysisError('configuration');
}

function vertexHttpStatus(error: unknown): number | undefined {
  const value = record(error);
  for (const candidate of [value.code, value.status, value.statusCode]) {
    if (typeof candidate === 'number' && candidate >= 400 && candidate <= 599) return candidate;
    if (typeof candidate === 'string' && /^\d{3}$/.test(candidate)) return Number(candidate);
  }
  const match = error instanceof Error ? error.message.match(/\b([45]\d{2})\b/) : null;
  return match ? Number(match[1]) : undefined;
}

function isProviderRateLimit(error: unknown): boolean {
  if (error instanceof GeminiAnalysisError) return error.code === 'rate_limited';
  return vertexHttpStatus(error) === 429;
}

// Full jitter: sleep in [0, min(cap, base * 2^retryIndex)].
export function rateLimitBackoffMs(retryIndex: number, random = Math.random): number {
  const ceiling = Math.min(RATE_LIMIT_BACKOFF_CAP_MS, RATE_LIMIT_BACKOFF_BASE_MS * (2 ** retryIndex));
  return random() * ceiling;
}

function waitWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort);
  });
}

async function generateContentWithRateLimitRetry(
  generate: () => Promise<GenerateContentResult>,
  signal: AbortSignal,
): Promise<GenerateContentResult> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw signal.reason;
    if (attempt > 0) await waitWithSignal(rateLimitBackoffMs(attempt - 1), signal);
    try {
      return await Promise.race([generate(), timeoutPromise]);
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw signal.reason;
      if (!isProviderRateLimit(error) || attempt === RATE_LIMIT_MAX_ATTEMPTS - 1) throw error;
    }
  }
  throw lastError;
}

export interface AnalysisResult {
  category: string;
  incident_type: string;
  seriousness: number | null;
  ai_confidence: number;
  context_summary: string;
  context_tags: string[];
}

interface VertexModelClient {
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResult>;
}

export type VertexModelFactory = (options: {
  project: string;
  location: string;
  apiEndpoint?: string;
  credentials?: object;
  model: string;
  generationConfig: GenerationConfig;
}) => VertexModelClient;

const createVertexModel: VertexModelFactory = options => {
  const vertexAI = new VertexAI({
    project: options.project,
    location: options.location,
    apiEndpoint: options.apiEndpoint,
    googleAuthOptions: options.credentials ? { credentials: options.credentials } : undefined,
  });
  return vertexAI.getGenerativeModel({
    model: options.model,
    systemInstruction: { role: 'system', parts: [{ text: PROMPT }] },
    generationConfig: options.generationConfig,
  });
};

export class GeminiService {
  static getModel(): string {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) {
      throw new GeminiAnalysisError('configuration');
    }
    return model;
  }

  static async analyzeImage(
    imageBuffer: Buffer,
    mimeType: string,
    modelFactory: VertexModelFactory = createVertexModel,
  ): Promise<AnalysisResult> {
    if (imageBuffer.length > MAX_IMAGE_BYTES || imageBuffer.length === 0) throw new Error('Image size is invalid');
    // The upload route decodes and normalizes the image before calling this service.
    if (imageMime(imageBuffer) !== mimeType) {
      throw new Error('Image content does not match its file type');
    }
    
    const config = getVertexConfig();
    const model = this.getModel();
    const signal = AbortSignal.timeout(ANALYSIS_TIMEOUT_MS);
    
    try {
      const generationConfig: GenerationConfig = {
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
          ? { thinkingConfig: { thinkingLevel: 'minimal' } }
          : {}),
        // Gemini 3.8 Flash enables thinking by default; 'low' provides fast inference with thinking headroom.
        ...(model.startsWith('gemini-3.8-flash')
          ? { thinkingConfig: { thinkingLevel: 'low' } }
          : {}),
        // Use the typed OpenAPI schema required by this Vertex SDK.
        responseMimeType: 'application/json',
        responseSchema: VERTEX_RESPONSE_SCHEMA,
      };
      const generativeModel = modelFactory({
        project: config.project,
        location: config.location,
        // The deprecated Vertex SDK otherwise constructs the invalid
        // global-aiplatform.googleapis.com hostname for the global location.
        apiEndpoint: config.location === 'global' ? 'aiplatform.googleapis.com' : undefined,
        credentials: config.credentials,
        model,
        generationConfig,
      });
      
      const request = {
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBuffer.toString('base64') } }] }],
      };

      const response = await generateContentWithRateLimitRetry(
        () => generativeModel.generateContent(request),
        signal,
      );
      
      const data: unknown = response.response;
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
      } catch (error) {
        const validationStage: ValidationStage = error instanceof Error && error.message.includes('invalid assessment')
          ? 'contract_validation' : 'json_parse';
        throw new GeminiAnalysisError('invalid_response', undefined, undefined, String(finishReason), thoughtsTokenCount, candidatesTokenCount, validationStage);
      }
    } catch (error) {
      // The same deadline covers retries, backoff, the request, and reading its response body.
      if (signal.aborted) throw new GeminiAnalysisError('timeout');
      if (error instanceof GeminiAnalysisError) throw error;
      
      // Map only status metadata; never retain arbitrary provider messages.
      const status = vertexHttpStatus(error);
      if (status === 401 || status === 403) throw new GeminiAnalysisError('credentials', status);
      if (status === 429) throw new GeminiAnalysisError('rate_limited', status);
      if (status === 404) throw new GeminiAnalysisError('model_unavailable', status);
      if (status !== undefined && status >= 500) throw new GeminiAnalysisError('provider_unavailable', status);
      if (status === 400) throw new GeminiAnalysisError('invalid_request', status);
      
      throw new GeminiAnalysisError('network_error');
    }
  }
}
