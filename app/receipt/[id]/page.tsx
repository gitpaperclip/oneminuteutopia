import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CopyPacketButton } from '@/components/CopyPacketButton';
import { DatabaseService, type Incident } from '@/lib/db';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { BaltimoreRoutingService, toIntegrationPayload } from '@/lib/baltimore-routing';
import {
  handoffsForCategory,
  isEmergencyHandoff,
  likelyDepartmentName,
  telHref,
  type HandoffLink,
} from '@/lib/baltimore-routes';
import type { PreparedReport } from '@/lib/prepared-report-types';

/* eslint-disable @next/next/no-img-element -- public mark + stored media URLs */

const READINESS_LABEL: Record<PreparedReport['readiness'], string> = {
  ready: 'Ready',
  choose_service: 'Matched services',
  needs_location: 'Needs location',
  manual_review: 'In review',
  emergency: 'Emergency',
  not_reportable: 'Not a city service issue',
};

function clusterCopy(count: number) {
  if (count >= 2) return `${count} people reported this nearby.`;
  return '1 report so far. The demo worker files after a second nearby report of the same type.';
}

function mockPortalCopy(incident: Incident | undefined) {
  if (!incident) {
    return {
      title: 'Mock city portal',
      body: 'This report is saved here. It is not a Baltimore City case.',
    };
  }
  if (incident.routing_disposition === 'emergency') {
    return {
      title: 'Emergency',
      body: 'Call 911. This app does not file emergencies with 311 or the mock portal.',
    };
  }
  if (incident.routing_disposition === 'no_submission') {
    return {
      title: 'Mock city portal',
      body: 'This does not appear to be a city service issue. Nothing was filed.',
    };
  }
  if (incident.mock_status === 'submitted' && incident.mock_reference_id) {
    return {
      title: 'Mock city portal',
      body: `Filed with the mock city portal — ${incident.mock_reference_id}. This is a demo stand-in, not Baltimore City.`,
    };
  }
  if (incident.mock_status === 'failed') {
    return {
      title: 'Mock city portal',
      body: 'Mock filing failed. Refresh after the worker retries, or check the worker terminal. This is not a Baltimore City case.',
    };
  }
  if (incident.evidence_count < 2) {
    return {
      title: 'Mock city portal',
      body: 'Waiting for more nearby reports before the demo worker files this.',
    };
  }
  return {
    title: 'Mock city portal',
    body: 'Queued for the demo worker. Refresh this receipt after it runs. This is not a Baltimore City case.',
  };
}

function PacketField({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="packet-field">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function HandoffItem({ link }: { link: HandoffLink }) {
  const isTel = link.href.startsWith('tel:');
  const title = link.department || link.label;
  return (
    <li>
      <article className="handoff-card">
        <h3 className="handoff-title">{title}</h3>
        {link.note ? <p className="handoff-note">{link.note}</p> : null}
        {link.phones?.length ? (
          <p className="handoff-phones">
            {link.phones.map((phone) => (
              <a key={`${link.id}-${phone.number}`} href={telHref(phone.number)}>
                {phone.number}
                {phone.label ? <span> {phone.label}</span> : null}
              </a>
            ))}
          </p>
        ) : null}
        {isTel ? null : (
          <a
            className="handoff-portal"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Website
          </a>
        )}
      </article>
    </li>
  );
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cat?: string }>;
}) {
  const { id } = await params;
  const { cat } = await searchParams;
  const report = await DatabaseService.getReport(id);
  if (!report) notFound();

  const incident = report.incident_id
    ? await DatabaseService.getIncident(report.incident_id)
    : undefined;
  const category = cat || report.category;
  const prepared = BaltimoreRoutingService.prepareReport(report);
  const packet = toIntegrationPayload(prepared);
  const emergency =
    prepared.readiness === 'emergency' || isEmergencyHandoff(category, report.seriousness);
  const label = CATEGORY_LABELS[category] || category.replaceAll('_', ' ');
  const department = likelyDepartmentName(category);
  const contacts = handoffsForCategory(category).filter((link) => link.id !== '911');
  const fields = prepared.prepared_fields ?? {};
  const description = typeof fields.description === 'string' ? fields.description : '';
  const location = typeof fields.location === 'string' ? fields.location : '';
  const photo = typeof fields.photo_url === 'string' ? fields.photo_url : '';
  const lat = typeof fields.latitude === 'number' ? fields.latitude : null;
  const lng = typeof fields.longitude === 'number' ? fields.longitude : null;
  const showPacket = !emergency && prepared.readiness !== 'not_reportable';
  const serviceCodes = prepared.service_options?.map((option) => option.service_code)
    ?? (prepared.service_code ? [prepared.service_code] : []);
  const coords = lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
  const evidenceCount = incident?.evidence_count ?? 1;
  const mock = mockPortalCopy(incident);

  return (
    <div className="receipt-shell">
      <header className="receipt-header">
        <img src="/logo-mark.png" alt="1MU" width={36} height={36} />
        <h1>Report saved</h1>
      </header>

      <p className="receipt-id" aria-label="Report id">{report.id}</p>
      <p className="receipt-cat">{label}</p>

      {emergency ? (
        <section className="receipt-911" aria-label="Emergency">
          <a className="btn btn-emergency btn-block" href="tel:911">
            Contact 911
          </a>
          <p className="receipt-note">Call now if anyone is in danger.</p>
        </section>
      ) : null}

      <section className="receipt-status" aria-label="Incident status">
        <h2>This incident</h2>
        <p>{clusterCopy(evidenceCount)}</p>
        <p>
          <strong>{mock.title}.</strong> {mock.body}
        </p>
        {incident?.mock_reference_id ? (
          <p className="receipt-id" aria-label="Mock reference id">{incident.mock_reference_id}</p>
        ) : null}
      </section>

      {showPacket ? (
        <section className="receipt-section" aria-label="Prepared 311 packet">
          <article className="packet-card">
            <header className="packet-toolbar">
              <div>
                <p className="packet-kicker">Prepared for 311</p>
                <p className="packet-status">{READINESS_LABEL[prepared.readiness]}</p>
              </div>
              <CopyPacketButton payload={packet} />
            </header>
            <p className="packet-endpoint">GET /api/reports/{report.id}/prepare-311</p>
            {photo ? <img src={photo} alt="" className="packet-photo" /> : null}
            <div className="packet-fields">
              <PacketField label="Department">{department}</PacketField>
              <PacketField label="Service">
                {serviceCodes.length ? (
                  <span className="packet-services">
                    {serviceCodes.map((code) => (
                      <code key={code}>{code}</code>
                    ))}
                  </span>
                ) : null}
              </PacketField>
              <PacketField label="Location">{location || coords}</PacketField>
              {location && coords ? <PacketField label="Coordinates">{coords}</PacketField> : null}
              <PacketField label="Description">
                {description ? <pre className="packet-body">{description}</pre> : null}
              </PacketField>
            </div>
          </article>
        </section>
      ) : null}

      {contacts.length ? (
        <section className="receipt-section" aria-label="Contacts">
          <h2>{emergency ? 'After you are safe' : 'Contacts'}</h2>
          <ul className="handoff-list">
            {contacts.map((link) => (
              <HandoffItem key={link.id} link={link} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="receipt-actions">
        <Link href="/" className="btn btn-primary btn-block">
          New report
        </Link>
      </p>
    </div>
  );
}
