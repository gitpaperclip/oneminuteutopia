import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MapShell } from '@/components/map/MapShell';

export const metadata: Metadata = {
  title: 'Incident map · 1MU',
  description: 'Live public incident map from saved One Minute Utopia reports.',
};

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-dvh place-items-center text-sm text-slate-500">Loading map…</div>
      }
    >
      <MapShell />
    </Suspense>
  );
}
