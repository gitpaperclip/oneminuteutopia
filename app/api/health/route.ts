import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  const database = !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);
  const storage = !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  const vertexAI = !!(
    (process.env.GOOGLE_CLOUD_PROJECT?.trim()) &&
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
  );
  const gemini = !!process.env.GEMINI_API_KEY || vertexAI;
  let schema = false;
  if (database) {
    try { await DatabaseService.testConnection(); schema = true; } catch { /* Never expose connection strings or provider errors. */ }
  }
  const ready = schema && storage;
  return NextResponse.json({
    status: ready && gemini ? 'ok' : 'degraded',
    checks: { database_schema: schema, storage_configured: storage, gemini_configured: gemini },
    message: ready ? (gemini ? 'Reporting is configured. Provider requests are checked during upload.' : 'Manual reporting is available; AI is not configured.') : 'Apply the reporting migrations and check server configuration.',
  }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
