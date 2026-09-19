import Link from 'next/link';
import { PreparedPacketPanel } from '@/components/PreparedPacketPanel';
import { DemoStepRail } from '@/components/DemoStepRail';
import { notFound } from 'next/navigation';
import { DatabaseService } from '@/lib/db';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { handoffsForCategory } from '@/lib/baltimore-routes';

/* eslint-disable @next/next/no-img-element -- public mark + stored media URLs */

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

  const category = cat || report.category;
  const links = handoffsForCategory(category);
  const label = CATEGORY_LABELS[category] || category.replaceAll('_', ' ');

  return (
    <div className="receipt-shell">
      <header className="receipt-header">
        <img src="/logo-mark.png" alt="1MU" width={36} height={36} />
        <h1>Packet ready to review</h1>
      </header>

      <p className="receipt-id" aria-label="Report id">{report.id}</p>
      <p className="receipt-cat">{label}</p>

      <DemoStepRail active="cluster" />

      <PreparedPacketPanel reportId={report.id} />

      <section className="cluster-panel" aria-label="Clustered incident">
        <h2>Clustered incident</h2>
        <p className="receipt-note">
          Nearby same-type reports become one stronger incident. Evidence count appears when
          backend fields land — prepare-only, never city-submitted.
        </p>
        <p className="packet-badge">Evidence / cluster: pending fields</p>
      </section>


      <section className="receipt-section" aria-label="Suggested next steps">
        <h2>Suggested next steps</h2>
        <p className="receipt-note">Prepare-only handoff — we do not submit to Baltimore 311 for you.</p>
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
