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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return this.supabase;
  }

  /**
   * Verify the storage bucket exists.
   * The bucket 'report-photos' must be created manually in Supabase dashboard before use.
   */
  private static async ensureBucketExists(): Promise<void> {
    const supabase = this.getSupabaseClient();

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      throw new Error(`Failed to list storage buckets: ${listError.message}`);
    }

    const bucketExists = buckets?.some((bucket) => bucket.name === this.bucketName);

    if (!bucketExists) {
      throw new Error(
        `Storage bucket '${this.bucketName}' does not exist. Please create it in Supabase dashboard: ` +
        `Storage → New bucket → Name: ${this.bucketName} → Public: ✅ Enabled`
      );
    }
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
    
    // Ensure bucket exists before uploading
    await this.ensureBucketExists();

    const supabase = this.getSupabaseClient();
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(this.bucketName)
      .upload(filename, buffer, {
        contentType: mimeType,
        cacheControl: '31536000', // 1 year
        upsert: false,
      });

    if (error) {
      console.error('Supabase Storage upload error:', error);
      throw new Error(`Failed to upload image to Supabase Storage: ${error.message}`);
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
