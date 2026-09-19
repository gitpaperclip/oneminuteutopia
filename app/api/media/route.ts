import { NextRequest, NextResponse } from 'next/server';

/**
 * Media proxy endpoint for serving private Vercel Blob images.
 * 
 * When using OIDC authentication with a private Blob store, blob URLs are not publicly accessible.
 * This endpoint proxies those URLs through the Next.js server with proper authentication.
 * 
 * Usage: /api/media?url=https://...blob.vercel-storage.com/...
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate that the URL is from Vercel Blob storage
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith('.vercel-storage.com')) {
      return NextResponse.json(
        { error: 'Invalid blob URL - must be from vercel-storage.com' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  try {
    // Fetch the blob with server-side credentials
    // The @vercel/blob SDK automatically uses OIDC token or BLOB_READ_WRITE_TOKEN
    const response = await fetch(url, {
      headers: {
        // Include Authorization header if using token auth
        ...(process.env.BLOB_READ_WRITE_TOKEN && {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        }),
      },
    });

    if (!response.ok) {
      console.error('Blob fetch failed:', response.status, response.statusText);
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
