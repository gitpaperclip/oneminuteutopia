import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';
import { StorageService } from '@/lib/storage';
import { GeminiService } from '@/lib/gemini';

// Rate limiting map (in-memory for MVP, would use Redis in production)
const uploadRateLimit = new Map<string, { count: number; resetTime: number }>();

const MAX_UPLOADS_PER_HOUR = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  try {
    // Get or create session
    const sessionId = await SessionService.getOrCreateSession();
    await SessionService.setSessionCookie(sessionId);

    // Rate limiting
    if (!checkRateLimit(sessionId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an image.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Save image
    const { path: imagePath, hash } = await StorageService.saveImage(buffer, file.type);

    // Analyze image with Gemini
    const analysis = await GeminiService.analyzeImage(buffer, file.type);

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
    console.error('Upload/analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}
