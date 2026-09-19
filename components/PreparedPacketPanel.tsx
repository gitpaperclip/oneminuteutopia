'use client';

import { useEffect, useState } from 'react';

/** Soft shape only — do not import frozen prepared-report types until FSE re-passes #13. */
type SoftPacket = {
  readiness?: string;
  readiness_message?: string;
  service_code?: string | null;
  department?: string | null;
  owner?: string | null;
  intake_url?: string | null;
  phone?: string | null;
  prepared_fields?: {
    description?: string;
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  disclaimer?: string;
};

type PanelState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ok'; packet: SoftPacket };

export function PreparedPacketPanel({ reportId }: { reportId: string }) {
  const [state, setState] = useState<PanelState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/prepare-311`, {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ status: 'missing' });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error', message: 'Packet preview unavailable right now.' });
          return;
        }
        const data = (await res.json()) as SoftPacket;
        setState({ status: 'ok', packet: data });
      } catch {
        if (!cancelled) setState({ status: 'missing' });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (state.status === 'loading') {
    return (
      <section className="packet-panel" aria-label="Prepared 311 packet" aria-busy="true">
        <h2>Prepared 311 packet</h2>
        <p className="receipt-note">Loading packet preview…</p>
      </section>
    );
  }

  if (state.status === 'missing') {
    return (
      <section className="packet-panel packet-panel-placeholder" aria-label="Prepared 311 packet">
        <h2>Prepared 311 packet</h2>
        <p className="packet-badge">Readiness: pending</p>
        <p className="receipt-note">
          Packet fields appear when prepare-311 is live. Nothing is sent to Baltimore City.
        </p>
        <dl className="packet-fields">
          <div><dt>Service</dt><dd>—</dd></div>
          <div><dt>Department</dt><dd>—</dd></div>
          <div><dt>Description</dt><dd>Placeholder until the prepare endpoint merges.</dd></div>
        </dl>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="packet-panel" aria-label="Prepared 311 packet">
        <h2>Prepared 311 packet</h2>
        <p className="receipt-note">{state.message}</p>
      </section>
    );
  }

  const { packet } = state;
  const fields = packet.prepared_fields;
  const owner = packet.department ?? packet.owner;

  return (
    <section className="packet-panel" aria-label="Prepared 311 packet">
      <h2>Prepared 311 packet</h2>
      <p className="packet-badge">Readiness: {packet.readiness ?? 'unknown'}</p>
      <p className="receipt-note">
        {packet.readiness_message ??
          packet.disclaimer ??
          'Prepared for review — does not submit to the city.'}
      </p>
      <dl className="packet-fields">
        <div><dt>Service</dt><dd>{packet.service_code ?? '—'}</dd></div>
        <div><dt>Department</dt><dd>{owner ?? '—'}</dd></div>
        <div><dt>Description</dt><dd>{fields?.description ?? '—'}</dd></div>
        <div>
          <dt>Location</dt>
          <dd>
            {fields?.location ??
              (fields?.latitude != null && fields?.longitude != null
                ? `${fields.latitude.toFixed(5)}, ${fields.longitude.toFixed(5)}`
                : '—')}
          </dd>
        </div>
      </dl>
      {packet.intake_url ? (
        <a
          className="btn btn-primary btn-block packet-cta"
          href={packet.intake_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Continue in Baltimore 311
        </a>
      ) : null}
      {packet.phone === '911' || packet.readiness === 'emergency' ? (
        <p className="packet-emergency" role="alert">
          Call 911 — this is not a 311 packet.
        </p>
      ) : null}
    </section>
  );
}
