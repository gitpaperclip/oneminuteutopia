import { HttpError } from './hazard-analysis.mjs';

export async function readLimitedBody(req: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(req.headers.get('content-length'));
  if (length > limit) throw new HttpError(413, 'Upload is too large. Choose a smaller photo.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'Request body is missing.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'Upload is too large. Choose a smaller photo.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function checkRequestOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, 'Please submit from this website.');
}
