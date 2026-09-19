import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { DatabaseService } from './db';

const SESSION_COOKIE_NAME = 'omu_session';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  };
}

export class SessionService {
  static async getOrCreateSession(): Promise<string> {
    return await this.getSession() || DatabaseService.createSession();
  }
  static async setSessionCookie(sessionId: string): Promise<void> {
    (await cookies()).set(SESSION_COOKIE_NAME, sessionId, cookieOptions());
  }
  static attachCookie(response: NextResponse, sessionId: string): NextResponse {
    response.cookies.set(SESSION_COOKIE_NAME, sessionId, cookieOptions());
    return response;
  }
  static async getSession(): Promise<string | null> {
    const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return session && await DatabaseService.validateSession(session) ? session : null;
  }
}
