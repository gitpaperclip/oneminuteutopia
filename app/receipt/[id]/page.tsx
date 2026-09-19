import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DatabaseService, type Incident } from '@/lib/db';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { handoffsForCategory } from '@/lib/baltimore-routes';
import { displayMockReference, mockAgencyLabel } from '@/lib/mock-agency';
import { formatUnitScore, GOVERNMENT_REPORT_THRESHOLD } from '@/lib/incident-scoring';

/* eslint-disable @next/next/no-img-element -- public mark + stored media URLs */

function clusterCopy(count: number) {
  if (count >= 2) return `${count} people reported this nearby.`;
  return '1 report so far. More independent reports raise the incident score.';
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
    const agency = mockAgencyLabel(incident.mock_agency, incident.mock_reference_id);
    const reference = displayMockReference(incident.mock_reference_id);
    return {
      title: agency,
      body: `Filed with ${agency} — ${reference}. This is a demo stand-in, not Baltimore City.`,
    };
  }
  if (incident.mock_status === 'failed' || incident.government_report_status === 'failed') {
    return {
      title: 'Mock city portal',
      body: 'Mock filing failed. Refresh after the worker retries, or check the worker terminal. This is not a Baltimore City case.',
    };
  }
  if (
    incident.government_report_status === 'ready_to_submit'
    || incident.incident_score >= GOVERNMENT_REPORT_THRESHOLD
  ) {
    return {
      title: 'Mock city portal',
      body: 'Queued for the demo worker. Refresh this receipt after it runs. This is not a Baltimore City case.',
    };
  }
  return {
    title: 'Mock city portal',
    body: 'Waiting for more independent reports before automatic mock filing.',
  };
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
  const links = handoffsForCategory(category);
  const label = CATEGORY_LABELS[category] || category.replaceAll('_', ' ');
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

      <section className="receipt-status" aria-label="Incident status">
        <h2>This incident</h2>
        <p>{clusterCopy(evidenceCount)}</p>
        {incident ? (
          <p>
            Incident score {formatUnitScore(incident.incident_score)}
            {report.case_score != null ? ` · your case score ${formatUnitScore(report.case_score)}` : ''}.
          </p>
        ) : null}
        <p>
          <strong>{mock.title}.</strong> {mock.body}
        </p>
        {incident?.mock_reference_id ? (
          <p className="receipt-id" aria-label="Mock reference id">
            {displayMockReference(incident.mock_reference_id)}
          </p>
        ) : null}
      </section>

      <section className="receipt-section" aria-label="Suggested next steps">
        <h2>Suggested next steps</h2>
        <p className="receipt-note">
          Confirm yourself on the real city sites — a mock filing is not a Baltimore 311 case.
        </p>
        <ul className="handoff-list">
          {links.map((link) => (
            <li key={link.id}>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
                {link.note ? <span className="handoff-note">{link.note}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="receipt-actions">
        <Link href="/" className="btn btn-primary btn-block">
          New report
        </Link>
      </p>
    </div>
  );
}
