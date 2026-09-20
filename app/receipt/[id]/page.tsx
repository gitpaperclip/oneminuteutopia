import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DatabaseService } from '@/lib/db';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import {
  handoffsForCategory,
  isEmergencyHandoff,
  reportLinkOwnerIds,
  telHref,
  type HandoffLink,
} from '@/lib/baltimore-routes';

/* eslint-disable @next/next/no-img-element -- public mark */

function HandoffItem({ link, showReportLink }: { link: HandoffLink; showReportLink: boolean }) {
  const isTel = link.href.startsWith('tel:');
  const title = link.department || link.label;

  return (
    <li>
      <article className="handoff-card">
        <h3 className="handoff-title">{title}</h3>

        {link.phones?.length ? (
          <div className="handoff-phones">
            {link.phones.map((phone) => (
              <a key={`${link.id}-${phone.number}`} href={telHref(phone.number)}>
                <span>{phone.number}</span>
                {phone.label ? <small>{phone.label}</small> : null}
              </a>
            ))}
          </div>
        ) : null}

        {isTel ? null : (
          <div className="handoff-links">
            {link.reportUrl && showReportLink ? (
              <a
                className="handoff-portal"
                href={link.reportUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Report online
              </a>
            ) : null}
            {link.href !== link.reportUrl ? (
              <a
                className="handoff-portal"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                Department website
              </a>
            ) : null}
          </div>
        )}
      </article>
    </li>
  );
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await DatabaseService.getReport(id);
  if (!report) notFound();

  const incident = report.incident_id
    ? await DatabaseService.getIncident(report.incident_id)
    : undefined;
  const category = report.category;
  const emergency =
    report.routing_disposition === 'emergency' ||
    incident?.routing_disposition === 'emergency' ||
    isEmergencyHandoff(category, report.seriousness);
  const label = CATEGORY_LABELS[category] || category.replaceAll('_', ' ');
  const contacts = handoffsForCategory(category).filter((link) => link.id !== '911');
  const reportLinkOwners = reportLinkOwnerIds(contacts);
  const evidenceCount = incident?.evidence_count ?? 1;

  return (
    <main className="receipt-shell">
      <header className="receipt-header">
        <img src="/logo-mark.png" alt="1MU" width={36} height={36} />
        <h1>Report saved</h1>
      </header>

      <section className="receipt-reference" aria-label="Report reference">
        <span>Reference</span>
        <code>{report.id}</code>
      </section>
      <p className="receipt-category">{label}</p>

      {emergency ? (
        <section className="receipt-911" aria-label="Emergency action">
          <a className="btn btn-emergency btn-block" href="tel:911">
            Call 911
          </a>
        </section>
      ) : null}

      {evidenceCount >= 2 ? (
        <section className="receipt-cluster" aria-label="Nearby reports">
          <strong>{evidenceCount} nearby reports</strong>
          <span>Grouped into one incident</span>
        </section>
      ) : null}

      {contacts.length ? (
        <section className="receipt-section" aria-label="Reporting contacts">
          <h2>{emergency ? 'Other contacts' : 'Report this issue'}</h2>
          <ul className="handoff-list">
            {contacts.map((link) => (
              <HandoffItem
                key={link.id}
                link={link}
                showReportLink={reportLinkOwners.has(link.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="receipt-actions" aria-label="Receipt actions">
        <Link href="/map" className="btn btn-secondary btn-block">
          View incident map
        </Link>
        <Link href="/" className="btn btn-primary btn-block">
          New report
        </Link>
      </nav>
    </main>
  );
}
