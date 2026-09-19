export const CATEGORIES: readonly string[];
export const MAX_IMAGE_BYTES: number;
export const SCHEMA: {
  type: string;
  additionalProperties: boolean;
  properties: Record<string, unknown>;
  required: string[];
};
export const PROMPT_VERSION: string;
export const PROMPT: string;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string);
}

export function validateAnalysis(value: unknown): {
  category: string;
  incident_type: string;
  seriousness: number | null;
  ai_confidence: number;
  context_summary: string;
  context_tags: string[];
};

export function parseGemini(data: unknown): {
  category: string;
  incident_type: string;
  seriousness: number | null;
  ai_confidence: number;
  context_summary: string;
  context_tags: string[];
};

export function imageMime(bytes: Buffer | Uint8Array): string;
