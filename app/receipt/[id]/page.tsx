import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DatabaseService, type Incident } from '@/lib/db';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { BaltimoreRoutingService } from '@/lib/baltimore-routing';
import {
  handoffsForCategory,
  isEmergencyHandoff,
  telHref,
  type HandoffLink,
} from '@/lib/baltimore-routes';

/* eslint-disable @next/next/no-img-element -- public mark + stored media URLs */

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

function serviceLabel(code: string): string {
  return code.replace(/^[A-Z]+-/, '').replace(/-/g, ' ');
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
  const emergency =
    prepared.readiness === 'emergency' || isEmergencyHandoff(category, report.seriousness);
  const label = CATEGORY_LABELS[category] || category.replaceAll('_', ' ');
  const contacts = handoffsForCategory(category).filter((link) => link.id !== '911');
  const description =
    typeof prepared.prepared_fields?.description === 'string'
      ? prepared.prepared_fields.description
      : '';
  const showPacket = !emergency && prepared.readiness !== 'not_reportable';
  const services = prepared.service_options?.map((option) => option.service_name)
    ?? (prepared.service_code ? [serviceLabel(prepared.service_code)] : []);
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
        <section className="receipt-section" aria-label="311 packet">
          <h2>311 packet</h2>
          {services.length ? (
            <p className="packet-meta">{services.join(' · ')}</p>
          ) : null}
          {description ? <pre className="packet-body">{description}</pre> : null}
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
