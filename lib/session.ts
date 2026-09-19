import { cookies } from 'next/headers';
import { DatabaseService } from './db';

const SESSION_COOKIE_NAME = 'omu_session';
const ORGANIZER_COOKIE_NAME = 'omu_organizer';

export class SessionService {
  static async getOrCreateSession(): Promise<string> {
    const cookieStore = await cookies();
    let sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionId) {
      sessionId = await DatabaseService.createSession();
    } else {
      await DatabaseService.updateSessionActivity(sessionId);
    }

    return sessionId;
  }

  static async setSessionCookie(sessionId: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  static async getSession(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
  }

  static async isOrganizer(): Promise<boolean> {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ORGANIZER_COOKIE_NAME)?.value;
    
    if (!sessionId) return false;
    
    return await DatabaseService.isOrganizer(sessionId);
  }

  static async createOrganizerSession(): Promise<string> {
    const sessionId = await DatabaseService.createOrganizerSession();
    const cookieStore = await cookies();
    
    cookieStore.set(ORGANIZER_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return sessionId;
  }

  static async getOrganizerSession(): Promise<string | null> {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ORGANIZER_COOKIE_NAME)?.value;
    
    if (!sessionId) return null;
    
    if (await DatabaseService.isOrganizer(sessionId)) {
      return sessionId;
    }
    
    return null;
  }
}
