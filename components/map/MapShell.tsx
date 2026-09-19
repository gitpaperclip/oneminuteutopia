'use client';

/* eslint-disable @next/next/no-img-element -- public mark, matching the rest of the app */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import type { IncidentBbox, MapIncident } from '@/lib/map-incident-types';
import { formatSeverity } from '@/lib/severity';
import { formatTimestamp } from '@/lib/utils';
import { MapFilters } from '@/components/map/MapFilters';
import {
  fetchMapIncidents,
  formatConfidence,
  incidentsQuery,
  isEmergencyIncident,
  mappableIncidents,
  parseMapFilters,
  roundBbox,
  sameBbox,
  slugLabel,
  urlFiltersQuery,
  type MapListFilters,
} from '@/components/map/incidents';

const IncidentMap = dynamic(() => import('@/components/map/IncidentMap'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div>
  ),
});

export function MapShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlFilters = useMemo(() => parseMapFilters(searchParams), [searchParams]);
  const urlKey = urlFiltersQuery(urlFilters);
  const [bbox, setBbox] = useState<IncidentBbox | undefined>(undefined);
  const [allowUnbounded, setAllowUnbounded] = useState(false);
  const filters = useMemo(() => ({ ...urlFilters, bbox }), [urlFilters, bbox]);
  const queryKey = incidentsQuery(filters);
  const [incidents, setIncidents] = useState<MapIncident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadedUrlKey, setLoadedUrlKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const waitingForBounds = !bbox && !allowUnbounded;
  const loading = waitingForBounds || loadedUrlKey !== urlKey;
  const refreshing = !loading && loadedKey !== queryKey;
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (bbox) return;
    const timer = setTimeout(() => setAllowUnbounded(true), 2000);
    return () => clearTimeout(timer);
  }, [bbox]);

  useEffect(() => {
    if (!bbox && !allowUnbounded) return;
    const controller = new AbortController();
    fetchMapIncidents(filters, controller.signal)
      .then((rows) => {
        setIncidents(rows);
        setError(null);
        setLoadedKey(queryKey);
        setLoadedUrlKey(urlKey);
        setSelectedId((current) => (current && rows.some((row) => row.id === current) ? current : null));
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setIncidents(null);
        setError(cause instanceof Error ? cause.message : 'Incident data is temporarily unavailable.');
        setLoadedKey(queryKey);
        setLoadedUrlKey(urlKey);
      });
    return () => controller.abort();
  }, [allowUnbounded, bbox, filters, queryKey, retryTick, urlKey]);

  const onBounds = useCallback((next: IncidentBbox) => {
    const rounded = roundBbox(next);
    if (bboxTimer.current) clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(() => {
      setBbox((current) => (sameBbox(current, rounded) ? current : rounded));
    }, 280);
  }, []);

  const visible = loadedUrlKey === urlKey ? incidents : null;
  const pins = useMemo(() => mappableIncidents(visible ?? []), [visible]);
  const selected = pins.find((incident) => incident.id === selectedId) ?? null;
  const unmapped = (visible?.length ?? 0) - pins.length;
  const visibleError = loadedUrlKey === urlKey ? error : null;

  const applyFilters = (next: MapListFilters) => {
    router.replace(`/map?${urlFiltersQuery(next)}`, { scroll: false });
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <div className="absolute inset-0">
        <IncidentMap
          incidents={pins}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onBounds={onBounds}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] p-3">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src="/logo-mark.png?v=3" alt="1MU" width={32} height={32} />
              <div>
                <h1 className="text-base font-bold text-slate-900">Live incident map</h1>
                <p className="text-xs text-slate-500">
                  {loading
                    ? 'Loading GET /api/incidents…'
                    : visibleError
                      ? 'Could not read the live incident API'
                      : refreshing
                        ? 'Updating pins for this view…'
                        : `${pins.length} pin${pins.length === 1 ? '' : 's'} from saved incidents`}
                  {unmapped > 0 ? ` · ${unmapped} without GPS` : ''}
                </p>
              </div>
            </div>
            <Link href="/" className="text-btn">
              Report
            </Link>
          </div>
          <MapFilters filters={urlFilters} onChange={applyFilters} />
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
            <span><span className="mr-1 inline-block size-2.5 rounded-full bg-blue-600" />Ordinary</span>
            <span><span className="mr-1 inline-block size-2.5 rounded-full bg-amber-500" />Super-report</span>
            <span><span className="mr-1 inline-block size-2.5 rounded-full bg-red-600" />Emergency</span>
          </p>
          {visibleError && (
            <p className="toast-error mt-2 flex items-center justify-between gap-3 rounded-xl" role="alert">
              <span>{visibleError}</span>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setLoadedKey(null);
                  setLoadedUrlKey(null);
                  setRetryTick((tick) => tick + 1);
                }}
              >
                Retry
              </button>
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[1050] grid place-items-center bg-white/35">
          <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow">
            Loading live incidents…
          </div>
        </div>
      )}

      {!loading && !visibleError && visible && visible.length === 0 && (
        <EmptyCard
          title="No incidents in this view"
          body="This map only plots real GET /api/incidents centroids. Pan the map or submit a photo report with GPS — there are no fixture pins."
        />
      )}

      {!loading && !visibleError && visible && visible.length > 0 && pins.length === 0 && (
        <EmptyCard
          title="Saved incidents have no map coordinates"
          body={`${visible.length} incident${visible.length === 1 ? '' : 's'} loaded from the database, but none include a centroid lat/lon. Submit a report with GPS to drop a pin.`}
        />
      )}

      {selected && (
        <aside className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] p-3">
          <article className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {CATEGORY_LABELS[selected.category] ?? slugLabel(selected.category)}
                </p>
                <h2 className="text-lg font-bold text-slate-900">{selected.short_label}</h2>
              </div>
              <button type="button" className="text-btn" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isEmergencyIncident(selected) && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Emergency</span>
              )}
              {selected.is_super_report && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  Super-report · {selected.evidence_count} evidence
                </span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                {slugLabel(selected.incident_type)}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                {selected.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Seriousness</dt>
                <dd className="font-semibold">{formatSeverity(selected.highest_seriousness)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">AI confidence</dt>
                <dd className="font-semibold">{formatConfidence(selected.average_ai_confidence)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last reported</dt>
                <dd className="font-semibold">{formatTimestamp(selected.last_reported_at ?? selected.updated_at, 'date')}</dd>
              </div>
            </dl>
            {selected.location_address && (
              <p className="mt-2 text-sm text-slate-600">{selected.location_address}</p>
            )}
            {selected.tags.length > 0 && (
              <p className="mt-2 text-xs capitalize text-slate-500">{selected.tags.map(slugLabel).join(' · ')}</p>
            )}
          </article>
        </aside>
      )}
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1050] grid place-items-center p-4 pt-52">
      <div className="pointer-events-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
        <Link href="/" className="btn btn-primary mt-4 inline-block">
          Submit a report
        </Link>
      </div>
    </div>
  );
}
