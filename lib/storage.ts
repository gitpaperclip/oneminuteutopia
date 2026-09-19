import crypto from 'crypto';
import { put, PutBlobResult } from '@vercel/blob';
import { nanoid } from 'nanoid';

export class StorageService {
  /**
   * Get the Blob store ID from environment variables.
   * Supports both standard OIDC (BLOB_STORE_ID) and custom-prefix OIDC (BLOB_READ_WRITE_TOKEN_STORE_ID).
   */
  private static getStoreId(): string | undefined {
    return process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;
  }

  /**
   * Check if we should use private access mode.
   * Private mode is preferred when using OIDC authentication.
   */
  private static shouldUsePrivateAccess(): boolean {
    const storeId = this.getStoreId();
    return !!storeId;
  }

  static async saveImage(buffer: Buffer, mimeType: string): Promise<{ path: string; hash: string }> {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Determine file extension
    const ext = mimeType === 'image/jpeg' ? 'jpg' :
                mimeType === 'image/png' ? 'png' :
                mimeType === 'image/webp' ? 'webp' :
                mimeType === 'image/heic' ? 'heic' :
                mimeType === 'image/heif' ? 'heif' : 'jpg';
    
    const filename = `${nanoid()}-${hash.substring(0, 8)}.${ext}`;
    
    // Prepare options for Blob upload
    const storeId = this.getStoreId();
    const usePrivateAccess = this.shouldUsePrivateAccess();
    
    const options: {
      access: 'public' | 'private';
      contentType: string;
      storeId?: string;
    } = {
      access: usePrivateAccess ? 'private' : 'public',
      contentType: mimeType,
    };

    // Add storeId for OIDC authentication if available
    if (storeId) {
      options.storeId = storeId;
    }
    
    // Upload to Vercel Blob
    const blob: PutBlobResult = await put(filename, buffer, options);
    
    return {
      path: blob.url,
      hash,
    };
  }
}
