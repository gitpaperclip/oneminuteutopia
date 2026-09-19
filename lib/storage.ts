import crypto from 'crypto';
import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';

export class StorageService {
  static async saveImage(buffer: Buffer, mimeType: string): Promise<{ path: string; hash: string }> {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Determine file extension
    const ext = mimeType === 'image/jpeg' ? 'jpg' :
                mimeType === 'image/png' ? 'png' :
                mimeType === 'image/webp' ? 'webp' :
                mimeType === 'image/heic' ? 'heic' :
                mimeType === 'image/heif' ? 'heif' : 'jpg';
    
    const filename = `${nanoid()}-${hash.substring(0, 8)}.${ext}`;
    
    // Upload to Vercel Blob
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: mimeType,
    });
    
    return {
      path: blob.url,
      hash,
    };
  }
}
