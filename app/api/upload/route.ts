import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { StorageService } from '@/lib/storage';
import { GeminiService } from '@/lib/gemini';

// Rate limiting map (in-memory for MVP, would use Redis in production)
const uploadRateLimit = new Map<string, { count: number; resetTime: number }>();

const MAX_UPLOADS_PER_HOUR = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function getImageMimeType(file: File) {
  const declaredType = file.type.toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.has(declaredType)) return declaredType;

  const extension = file.name.split('.').pop()?.toLowerCase();
  const inferredTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return extension ? inferredTypes[extension] : undefined;
}

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const record = uploadRateLimit.get(sessionId);

  if (!record || now > record.resetTime) {
    uploadRateLimit.set(sessionId, {
      count: 1,
      resetTime: now + 60 * 60 * 1000, // 1 hour
    });
    return true;
  }

  if (record.count >= MAX_UPLOADS_PER_HOUR) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(req: NextRequest) {
  let sessionId: string | null = null;
  let buffer: Buffer | null = null;
  let file: File | null = null;
  let imagePath: string | null = null;
  let hash: string | null = null;
  let mimeType: string | undefined = undefined;

  try {
    // Step 1: Session management
    try {
      sessionId = await SessionService.getOrCreateSession();
      await SessionService.setSessionCookie(sessionId);
    } catch (error) {
      console.error('Session creation error:', error);
      return NextResponse.json(
        { error: 'Database is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    // Rate limiting
    if (!checkRateLimit(sessionId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Step 2: File validation
    try {
      const formData = await req.formData();
      file = formData.get('image') as File;

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'No image provided' }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum size is 10MB.' },
          { status: 400 }
        );
      }

      mimeType = getImageMimeType(file);
      if (!mimeType) {
        return NextResponse.json(
          { error: 'Unsupported image. Use JPEG, PNG, WebP, HEIC, or HEIF.' },
          { status: 400 }
        );
      }

      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      console.error('File processing error:', error);
      return NextResponse.json(
        { error: 'Failed to process the uploaded file. Please try again.' },
        { status: 400 }
      );
    }

    // Step 3: Save image to Blob storage
    try {
      const result = await StorageService.saveImage(buffer, mimeType);
      imagePath = result.path;
      hash = result.hash;
    } catch (error) {
      console.error('Blob storage error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('BLOB_READ_WRITE_TOKEN')) {
        return NextResponse.json(
          { error: 'Photo storage is not configured (BLOB_READ_WRITE_TOKEN). Please contact support.' },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        { error: `Photo upload failed: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Step 4: AI analysis (soft failure - never blocks success if image is saved)
    let analysis = null;
    try {
      analysis = await GeminiService.analyzeImage(buffer, mimeType);
      
      if (!analysis) {
        console.warn('Gemini analysis returned null (timeout or error)');
      }
    } catch (error) {
      console.error('Gemini analysis error (non-blocking):', error);
    }

    return NextResponse.json({
      success: true,
      image_path: imagePath,
      image_hash: hash,
      analysis: analysis ? {
        category: analysis.category,
        short_label: analysis.short_label,
        full_description: analysis.full_description,
        confidence: analysis.confidence,
        possible_hazard: analysis.possible_hazard,
        community_action_candidate: analysis.community_action_candidate,
        routing_suggestion: analysis.routing_suggestion,
        model: 'gemini-2.0-flash-exp',
      } : null,
    });
  } catch (error) {
    console.error('Unexpected upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { error: `Upload failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
