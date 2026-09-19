import 'server-only';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

export class StorageService {
  private static supabase: ReturnType<typeof createClient> | null = null;
  private static bucketName = 'report-photos';

  /**
   * Get or create a Supabase client instance using service role key for server-side operations.
   */
  private static getSupabaseClient(): ReturnType<typeof createClient> {
    if (this.supabase) return this.supabase;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }) },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return this.supabase;
  }

  /**
   * Save an image to Supabase Storage and return its public URL and hash.
   */
  static async saveImage(buffer: Buffer, mimeType: string): Promise<{ path: string; hash: string }> {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Determine file extension
    const ext = mimeType === 'image/jpeg' ? 'jpg' :
                mimeType === 'image/png' ? 'png' :
                mimeType === 'image/webp' ? 'webp' :
                mimeType === 'image/heic' ? 'heic' :
                mimeType === 'image/heif' ? 'heif' : 'jpg';
    
    const filename = `${nanoid()}-${hash.substring(0, 8)}.${ext}`;
    
    const supabase = this.getSupabaseClient();
    
    // A unique filename makes an idempotent retry safe if the first request timed out
    // after Supabase had already accepted the bytes.
    let data: { path: string } | null = null;
    let finalError: { message: string } | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await supabase.storage.from(this.bucketName).upload(filename, buffer, {
        contentType: mimeType,
        cacheControl: '31536000', // 1 year
        upsert: true,
      });
      data = result.data;
      finalError = result.error;
      if (!finalError) break;
    }

    if (finalError || !data) {
      // Log no URL, credentials, image bytes, or session identifier.
      console.error('photo_storage_unavailable', JSON.stringify({ provider: 'supabase', error_name: finalError?.constructor?.name ?? 'UnknownError' }));
      throw new Error('Photo storage unavailable');
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(this.bucketName)
      .getPublicUrl(data.path);

    return {
      path: urlData.publicUrl,
      hash,
    };
  }

  /**
   * Get a signed URL for a private file (if needed in the future).
   * Currently using public bucket, but this method is available for private storage.
   */
  static async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
    const supabase = this.getSupabaseClient();
    
    // Extract the file path from the full URL if needed
    const filename = path.split('/').pop() || path;

    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .createSignedUrl(filename, expiresIn);

    if (error) {
      console.error('Error creating signed URL:', error);
      throw error;
    }

    return data.signedUrl;
  }

  /**
   * Delete an image from Supabase Storage.
   */
  static async deleteImage(path: string): Promise<void> {
    const supabase = this.getSupabaseClient();
    
    // Extract the filename from the full URL
    const filename = path.split('/').pop() || path;

    const { error } = await supabase.storage
      .from(this.bucketName)
      .remove([filename]);

    if (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }
}
