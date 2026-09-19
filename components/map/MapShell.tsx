'use client';

/* eslint-disable @next/next/no-img-element -- public mark, matching the rest of the app */

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
    <div className={`map-shell${selected ? ' has-sheet' : ''}`}>
      <div className="map-stage">
        <IncidentMap
          incidents={pins}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setFiltersOpen(false);
          }}
          onBounds={onBounds}
        />
      </div>

      <header className="map-chrome">
        <div className="map-chrome-bar">
          <img src="/logo-mark.png?v=3" alt="" className="map-chrome-logo" width={32} height={32} />
          <p className="map-chrome-status" aria-live="polite">
            {statusLabel}
            {unmapped > 0 ? ` · ${unmapped} without GPS` : ''}
          </p>
          <div className="map-chrome-actions">
            <MapFilters
              filters={urlFilters}
              expanded={filtersOpen}
              onToggle={() => setFiltersOpen((open) => !open)}
              onChange={applyFilters}
            />
            <Link href="/" className="map-chrome-report">
              {MAP_COPY.report}
            </Link>
          </div>
        </div>
      </header>

      {truncated && !loading && !visibleError && (
        <p className="map-trunc-chip" role="status">
          {MAP_COPY.truncated}
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

      {!loading && !visibleError && visible && visible.length === 0 && (
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
        <div className="map-sheet-head">
          <h2 id="map-sheet-title" className="map-sheet-title">{title}</h2>
          <button type="button" className="map-sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
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
            <div className="map-sheet-meta-wide">
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
              className="text-btn map-confirm-undo"
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
    <div className="map-empty">
      <div className="map-empty-card">
        <h2>{title}</h2>
        <p>{body}</p>
        {action ?? (
          <Link href="/" className="btn btn-primary btn-block">
            Submit a report
          </Link>
        )}
      </div>
    </div>
  );
}
