import 'server-only';
import sharp from 'sharp';
import { HttpError, imageMime } from './hazard-analysis.mjs';

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export async function normalizeImage(input: Buffer): Promise<Buffer> {
  if (!input.length || input.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Photo must be between 1 byte and 3 MB after resizing.');
  imageMime(input);
  try {
    // Re-encode server-side too: never trust client compression or retain location EXIF.
    return await sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' })
      .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).timeout({ seconds: 5 }).toBuffer();
  } catch {
    throw new HttpError(415, 'This photo could not be read. Choose a valid JPEG, PNG, or WebP image.');
  }
}
