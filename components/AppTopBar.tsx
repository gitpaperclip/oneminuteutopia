'use client';

/* eslint-disable @next/next/no-img-element -- public mark, matching the rest of the app */

import Link from 'next/link';
import type { ReactNode } from 'react';

export function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 21s7-5.33 7-11.25C19 6.02 15.87 3 12 3S5 6.02 5 9.75C5 15.67 12 21 12 21z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.75" r="2.15" fill="currentColor" />
    </svg>
  );
}

export function AppTopBar({
  href = '/',
  right,
}: {
  href?: string;
  right?: ReactNode;
}) {
  return (
    <header className="app-topbar">
      <Link href={href} className="app-topbar-logo" aria-label="One Minute Utopia">
        <img src="/logo-mark.png?v=3" alt="" width={36} height={36} />
      </Link>
      <div className="app-topbar-actions">{right}</div>
    </header>
  );
}

export function MapNavLink({ className = 'app-topbar-icon' }: { className?: string }) {
  return (
    <Link href="/map" className={className} aria-label="Open incident map">
      <MapIcon />
    </Link>
  );
}
