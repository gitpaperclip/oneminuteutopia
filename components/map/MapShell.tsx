'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IncidentBbox, MapIncident } from '@/lib/map-incident-types';
import {
  MAP_COPY,
  confirmationTotalLabel,
  incidentSheetDescription,
  incidentSheetTitle,
  superReportBadge,
  unmappedEmptyBody,
} from '@/lib/map-copy';
import { formatSeverity } from '@/lib/severity';
import { formatTimestamp } from '@/lib/utils';
import { AppTopBar } from '@/components/AppTopBar';
import { MapFilters } from '@/components/map/MapFilters';
import {
  fetchConfirmation,
  fetchMapIncidents,
  incidentsQuery,
  isEmergencyIncident,
  mappableIncidents,
  parseMapFilters,
  roundBbox,
  sameBbox,
  setConfirmation,
  urlFiltersQuery,
  type MapListFilters,
} from '@/components/map/incidents';

const IncidentMap = dynamic(() => import('@/components/map/IncidentMap'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-slate-500">{MAP_COPY.loading}</div>
  ),
});

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? '';

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
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadedUrlKey, setLoadedUrlKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const waitingForBounds = !bbox && !allowUnbounded;
  const loading = waitingForBounds || loadedUrlKey !== urlKey;
  const refreshing = !loading && loadedKey !== queryKey;
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (bbox) return;
    const timer = setTimeout(() => setAllowUnbounded(true), 2000);
    return () => clearTimeout(timer);
  }, [bbox]);

  useEffect(() => {
    if (!bbox && !allowUnbounded) return;
    const controller = new AbortController();
    fetchMapIncidents(filters, controller.signal)
      .then((payload) => {
        setIncidents(payload.incidents);
        setTruncated(payload.truncated);
        setError(null);
        setLoadedKey(queryKey);
        setLoadedUrlKey(urlKey);
        setSelectedId((current) =>
          current && payload.incidents.some((row) => row.id === current) ? current : null,
        );
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setIncidents(null);
        setTruncated(false);
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

  const updateConfirmationCount = useCallback((incidentId: string, count: number) => {
    setIncidents((rows) =>
      rows?.map((row) => (row.id === incidentId ? { ...row, confirmation_count: count } : row)) ?? null,
    );
  }, []);

  const statusLabel = loading
    ? MAP_COPY.loading
    : visibleError
      ? MAP_COPY.apiErrorTitle
      : refreshing
        ? 'Updating this view…'
        : `${pins.length} nearby`;

  return (
    <div className="map-shell">
      <AppTopBar
        right={
          <>
            <MapFilters
              filters={urlFilters}
              expanded={filtersOpen}
              onToggle={() => setFiltersOpen((open) => !open)}
              onChange={(next) => {
                applyFilters(next);
              }}
            />
            <Link href="/" className="app-topbar-text">
              {MAP_COPY.report}
            </Link>
          </>
        }
      />

      <div className="map-stage">
        {STYLE_URL ? (
          <IncidentMap
            styleUrl={STYLE_URL}
            incidents={pins}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setFiltersOpen(false);
            }}
            onBounds={onBounds}
            locateRef={locateRef}
          />
        ) : (
          <EmptyCard title={MAP_COPY.configErrorTitle} body={MAP_COPY.configErrorBody} />
        )}

        {STYLE_URL && (
          <p className="map-status-chip" aria-live="polite">
            {statusLabel}
            {unmapped > 0 ? ` · ${unmapped} without GPS` : ''}
          </p>
        )}

        {visibleError && (
          <EmptyCard
            title={MAP_COPY.apiErrorTitle}
            body={visibleError}
            action={
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  setLoadedKey(null);
                  setLoadedUrlKey(null);
                  setRetryTick((tick) => tick + 1);
                }}
              >
                Retry
              </button>
            }
          />
        )}

        {truncated && !loading && !visibleError && (
          <p className="map-status-chip" style={{ top: 48 }} role="status">
            {MAP_COPY.truncated}
          </p>
        )}

        {loading && STYLE_URL && (
          <div className="pointer-events-none absolute inset-0 z-[9] grid place-items-center bg-white/25">
            <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow">
              {MAP_COPY.loading}
            </div>
          </div>
        )}

        {!loading && !visibleError && visible && visible.length === 0 && STYLE_URL && (
          <EmptyCard title={MAP_COPY.emptyTitle} body={MAP_COPY.emptyBody} />
        )}

        {!loading && !visibleError && visible && visible.length > 0 && pins.length === 0 && (
          <EmptyCard title={MAP_COPY.unmappedTitle} body={unmappedEmptyBody(visible.length)} />
        )}

        {selected && (
          <IncidentSheet
            incident={selected}
            onClose={() => setSelectedId(null)}
            onCount={updateConfirmationCount}
          />
        )}
      </div>
    </div>
  );
}

function IncidentSheet({
  incident,
  onClose,
  onCount,
}: {
  incident: MapIncident;
  onClose: () => void;
  onCount: (incidentId: string, count: number) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const title = incidentSheetTitle(incident);
  const description = incidentSheetDescription(incident);

  useEffect(() => {
    const controller = new AbortController();
    fetchConfirmation(incident.id, controller.signal)
      .then((state) => {
        setConfirmed(state.viewer_confirmed);
        onCount(incident.id, state.confirmation_count);
        setConfirmError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setConfirmError(null);
      });
    return () => controller.abort();
  }, [incident.id, onCount]);

  const toggle = async () => {
    setBusy(true);
    setConfirmError(null);
    try {
      const state = await setConfirmation(incident.id, !confirmed);
      setConfirmed(state.viewer_confirmed);
      onCount(incident.id, state.confirmation_count);
    } catch (cause) {
      setConfirmError(cause instanceof Error ? cause.message : 'Could not update confirmation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="map-sheet">
      <article className="map-sheet-card" role="dialog" aria-labelledby="map-sheet-title">
        <div className="flex items-start justify-between gap-3">
          <h2 id="map-sheet-title" className="map-sheet-title">{title}</h2>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
        {description ? <p className="map-sheet-desc">{description}</p> : null}
        <div className="map-sheet-badges">
          {isEmergencyIncident(incident) && (
            <span className="map-badge map-badge-emergency">Emergency</span>
          )}
          {incident.is_super_report && (
            <span className="map-badge map-badge-super">{superReportBadge(incident.evidence_count)}</span>
          )}
          <span className="map-badge">{incident.status}</span>
        </div>
        <dl className="map-sheet-meta">
          <div>
            <dt>Seriousness</dt>
            <dd>{formatSeverity(incident.highest_seriousness)}</dd>
          </div>
          <div>
            <dt>Last reported</dt>
            <dd>{formatTimestamp(incident.last_reported_at ?? incident.updated_at, 'date')}</dd>
          </div>
          {incident.location_address ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <dt>Location</dt>
              <dd>{incident.location_address}</dd>
            </div>
          ) : null}
        </dl>
        <div className="map-confirm">
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => void toggle()}
          >
            {confirmed ? MAP_COPY.confirmed : MAP_COPY.seeThisToo}
          </button>
          {confirmed ? (
            <button
              type="button"
              className="text-btn"
              style={{ display: 'block', margin: '8px auto 0' }}
              disabled={busy}
              onClick={() => void toggle()}
            >
              {MAP_COPY.removeConfirmation}
            </button>
          ) : null}
          <p className="map-confirm-total">{confirmationTotalLabel(incident.confirmation_count)}</p>
          <p className="map-confirm-hint">{MAP_COPY.confirmationHint}</p>
          {confirmError ? (
            <p className="toast-error toast-error-inline" role="alert">{confirmError}</p>
          ) : null}
        </div>
      </article>
    </aside>
  );
}

function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[10] grid place-items-center p-4">
      <div className="pointer-events-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
        {action ?? (
          <Link href="/" className="btn btn-primary mt-4 inline-block">
            Submit a report
          </Link>
        )}
      </div>
    </div>
  );
}
