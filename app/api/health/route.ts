import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/db';

export class HealthCheckService {
  static checkEnvironment(): {
    supabase_db: boolean;
    supabase_storage: boolean;
    gemini: boolean;
    details: string[];
  } {
    // Check for Supabase Database (Postgres) - prefer Supabase vars
    const supabase_db = !!(
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING
    );
    
    // Check for Supabase Storage configuration
    const supabase_storage = !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const gemini = !!process.env.GEMINI_API_KEY;
    
    const details: string[] = [];
    
    if (!supabase_db) {
      details.push('Database is not configured (need DATABASE_URL or SUPABASE_DB_URL)');
    }
    
    if (!supabase_storage) {
      details.push('Supabase Storage is not configured (need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
    }
    
    if (!gemini) {
      details.push('GEMINI_API_KEY is not configured (AI analysis will be disabled)');
    }
    
    return { supabase_db, supabase_storage, gemini, details };
  }
}

export async function GET() {
  const health = HealthCheckService.checkEnvironment();
  
  // Perform live database connection test
  let dbConnectionStatus: 'ok' | 'error' = 'error';
  let dbConnectionMessage = '';
  
  if (health.supabase_db) {
    try {
      await DatabaseService.testConnection();
      dbConnectionStatus = 'ok';
      dbConnectionMessage = 'Connected';
    } catch (error) {
      dbConnectionStatus = 'error';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Truncate error message to avoid exposing secrets
      dbConnectionMessage = errorMessage.length > 150 ? errorMessage.slice(0, 150) + '...' : errorMessage;
    }
  } else {
    dbConnectionMessage = 'Database not configured';
  }
  
  const allOk = health.supabase_db && health.supabase_storage && dbConnectionStatus === 'ok';
  
  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      env_vars: {
        supabase_database: health.supabase_db,
        supabase_storage: health.supabase_storage,
        ai_analysis: health.gemini,
      },
      database_connection: {
        status: dbConnectionStatus,
        message: dbConnectionMessage,
      },
    },
    message: allOk 
      ? 'All required services are configured and connected' 
      : 'Some required services are not configured or unreachable',
    details: health.details.length > 0 ? health.details : undefined,
  }, {
    status: allOk ? 200 : 503,
  });
}
