import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';

export class StorageService {
  static async saveImage(buffer: Buffer, mimeType: string): Promise<{ path: string; hash: string }> {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Determine file extension
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 
                mimeType === 'image/png' ? 'png' : 
                mimeType === 'image/webp' ? 'webp' : 'jpg';
    
    const filename = `${nanoid()}-${hash.substring(0, 8)}.${ext}`;
    const uploadPath = path.join(process.cwd(), 'public', 'uploads', filename);
    
    await mkdir(path.dirname(uploadPath), { recursive: true });
    await writeFile(uploadPath, buffer);
    
    return {
      path: `/uploads/${filename}`,
      hash,
    };
  }

  static async checkDuplicateHash(hash: string): Promise<boolean> {
    // This would check the database for existing hash
    // For now, returning false (no duplicate found)
    return false;
  }
}
