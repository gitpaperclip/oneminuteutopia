import { NextResponse } from 'next/server';

export class HealthCheckService {
  static checkEnvironment(): {
    postgres: boolean;
    blob: boolean;
    gemini: boolean;
    details: string[];
  } {
    const postgres = !!(
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING
    );
    
    const blob = !!process.env.BLOB_READ_WRITE_TOKEN;
    const gemini = !!process.env.GEMINI_API_KEY;
    
    const details: string[] = [];
    
    if (!postgres) {
      details.push('POSTGRES_URL is not configured');
    }
    
    if (!blob) {
      details.push('BLOB_READ_WRITE_TOKEN is not configured');
    }
    
    if (!gemini) {
      details.push('GEMINI_API_KEY is not configured (AI analysis will be disabled)');
    }
    
    return { postgres, blob, gemini, details };
  }
}

export async function GET() {
  const health = HealthCheckService.checkEnvironment();
  const allOk = health.postgres && health.blob;
  
  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    checks: {
      postgres: health.postgres,
      blob_storage: health.blob,
      ai_analysis: health.gemini,
    },
    message: allOk 
      ? 'All required services are configured' 
      : 'Some required services are not configured',
    details: health.details.length > 0 ? health.details : undefined,
  }, {
    status: allOk ? 200 : 503,
  });
}
