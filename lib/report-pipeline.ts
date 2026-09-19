import 'server-only';
import { GeminiService } from './gemini.ts';
import { AnalysisStore, AnalysisStorageError } from './analysis-store.ts';
import { StorageService } from './storage.ts';
import type { AnalysisResult } from './gemini.ts';

const dependencies = { gemini: GeminiService, analyses: AnalysisStore, storage: StorageService };

export async function prepareReport(buffer: Buffer, sessionId: string, services = dependencies) {
  const started = performance.now();
  // Attach both rejection handlers immediately. A provider outage never loses a stored photo.
  const [image, assessment] = await Promise.allSettled([
    services.storage.saveImage(buffer, 'image/jpeg'),
    services.gemini.analyzeImage(buffer, 'image/jpeg'),
  ]);
  if (image.status === 'rejected') throw new Error('Photo storage failed');
  const complete = assessment.status === 'fulfilled';
  const analysis: AnalysisResult = complete ? assessment.value : { category: 'unable_to_assess', seriousness: null, ai_confidence: 0 };
  const analysis_status = complete ? 'complete' : 'unavailable';
  let model = 'unavailable';
  try { model = services.gemini.getModel(); } catch { /* Invalid AI configuration still permits manual reporting. */ }
  let saved;
  try {
    saved = await services.analyses.save({ ...analysis, analysis_status, session_id: sessionId,
      image_path: image.value.path, image_hash: image.value.hash, model });
  } catch (error) {
    // Only clean up a definitively rejected write. A timed-out save may have committed.
    if (error instanceof AnalysisStorageError && [400, 401, 403, 404].includes(error.status)) {
      await services.storage.deleteImage(image.value.path).catch(() => undefined);
    }
    throw error;
  }
  return {
    success: true, image_path: saved.image_path, image_hash: saved.image_hash,
    analysis_id: saved.id, analysis: { category: saved.category, seriousness: saved.seriousness, ai_confidence: saved.ai_confidence },
    analysis_status, processing_ms: Math.round(performance.now() - started),
    ...(!complete ? { warning: 'AI analysis is unavailable. Choose the issue category to continue with a manual report.' } : {}),
  };
}
