import 'server-only';
import { cookies } from 'next/headers';
import { DatabaseService } from './db';

const SESSION_COOKIE_NAME = 'omu_session';
export class SessionService {
  static async getOrCreateSession(): Promise<string> {
    return await this.getSession() || DatabaseService.createSession();
  }
  static async setSessionCookie(sessionId: string): Promise<void> {
    (await cookies()).set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    });
  }
  static async getSession(): Promise<string | null> {
    const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return session && await DatabaseService.validateSession(session) ? session : null;
  }
}
