import { NextRequest, NextResponse } from 'next/server';
import { fetchBaltimore311ServiceCatalog } from '@/lib/baltimore-311-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const includeInternal = req.nextUrl.searchParams.get('include_internal') === 'true';
    const catalog = await fetchBaltimore311ServiceCatalog();
    const services = includeInternal ? catalog : catalog.filter(service => !service.internal_only);
    return NextResponse.json({
      source: 'Open Baltimore current-year 311 service-request dataset',
      qualification: 'Observed service types; the city does not expose a public authenticated app catalog endpoint.',
      count: services.length,
      services,
    }, { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } });
  } catch {
    return NextResponse.json(
      { error: 'Baltimore 311 service types are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
