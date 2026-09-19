import 'server-only';

import { PROMPT, SCHEMA, parseGemini, imageMime, MAX_IMAGE_BYTES } from './hazard-analysis.mjs';

export const ANALYSIS_TIMEOUT_MS = 8_000;
const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface AnalysisResult {
  category: string;
  seriousness: number | null;
  ai_confidence: number;
}

export class GeminiService {
  static getModel(): string {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) {
      throw new Error('GEMINI_MODEL must be a model ID');
    }
    return model;
  }

  static async analyzeImage(imageBuffer: Buffer, mimeType: string): Promise<AnalysisResult> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not configured');
    if (imageBuffer.length > MAX_IMAGE_BYTES || imageBuffer.length === 0) throw new Error('Image size is invalid');
    // The upload route decodes and normalizes the image before calling this service.
    if (imageMime(imageBuffer) !== mimeType) {
      throw new Error('Image content does not match its file type');
    }
    const model = this.getModel();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
        cache: 'no-store',
        redirect: 'error',
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBuffer.toString('base64') } }] }],
          generationConfig: {
            candidateCount: 1,
            maxOutputTokens: 256,
            // Flash 2.5 otherwise spends a variable budget thinking before a small classification.
            ...(['gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(model)
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
            responseFormat: { text: { mimeType: 'application/json', schema: SCHEMA } },
          },
        }),
      },
    );
    if (!response.ok) throw new Error('Gemini request failed');
    return parseGemini(await response.json()) as AnalysisResult;
  }
}
