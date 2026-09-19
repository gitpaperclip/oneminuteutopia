import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/session';

const ORGANIZER_PASSPHRASE = process.env.ORGANIZER_PASSPHRASE || 'hackathon2026';

// Login attempt rate limiting
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && now < record.lockUntil) {
    const minutesLeft = Math.ceil((record.lockUntil - now) / 60000);
    return {
      allowed: false,
      message: `Too many failed attempts. Try again in ${minutesLeft} minute(s).`,
    };
  }

  if (!record || now >= record.lockUntil) {
    loginAttempts.set(ip, { count: 0, lockUntil: 0 });
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  
  record.count++;
  
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockUntil = now + LOCK_DURATION;
  }
  
  loginAttempts.set(ip, record);
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    
    // Check rate limit
    const rateLimitCheck = checkLoginRateLimit(ip);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.message },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { passphrase } = body;

    if (!passphrase) {
      return NextResponse.json(
        { error: 'Passphrase required' },
        { status: 400 }
      );
    }

    if (passphrase !== ORGANIZER_PASSPHRASE) {
      recordFailedAttempt(ip);
      return NextResponse.json(
        { error: 'Invalid passphrase' },
        { status: 401 }
      );
    }

    // Clear failed attempts on success
    clearAttempts(ip);

    // Create organizer session
    const sessionId = await SessionService.createOrganizerSession();

    return NextResponse.json({
      success: true,
      session_id: sessionId,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
