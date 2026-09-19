import { NextRequest, NextResponse } from 'next/server';

/**
 * Media proxy endpoint for serving images from Supabase Storage or legacy Vercel Blob.
 * 
 * With Supabase Storage using public buckets, most images are directly accessible.
 * This endpoint provides a proxy for compatibility and potential private storage in the future.
 * 
 * Usage: /api/media?url=https://...supabase.co/storage/v1/object/public/...
 *        /api/media?url=https://...blob.vercel-storage.com/...
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate that the URL is from Supabase Storage or Vercel Blob
  try {
    const parsedUrl = new URL(url);
    const isSupabase = parsedUrl.hostname.endsWith('.supabase.co');
    const isVercelBlob = parsedUrl.hostname.endsWith('.vercel-storage.com');
    
    if (!isSupabase && !isVercelBlob) {
      return NextResponse.json(
        { error: 'Invalid URL - must be from Supabase Storage or Vercel Blob' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  try {
    // Fetch the image
    // For Supabase public storage, no special auth needed
    // For Vercel Blob with token auth, include the token
    const headers: HeadersInit = {};
    
    // Add Authorization for legacy Vercel Blob if token exists
    if (url.includes('vercel-storage.com') && process.env.BLOB_READ_WRITE_TOKEN) {
      headers.Authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error('Image fetch failed:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch image from storage' },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Media proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve image' },
      { status: 500 }
    );
  }
}
