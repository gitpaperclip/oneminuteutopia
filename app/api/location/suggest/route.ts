import { NextRequest, NextResponse } from 'next/server';
import { findBaltimoreAddresses } from '@/lib/baltimore-geocoder';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 3 || query.length > 200) {
    return NextResponse.json({ suggestions: [] }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const suggestions = await findBaltimoreAddresses(query);
    return NextResponse.json({ suggestions }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.warn('baltimore_geocoder_unavailable', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { error: 'Address suggestions are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
