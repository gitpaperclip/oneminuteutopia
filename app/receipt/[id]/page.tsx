import { DatabaseService } from '@/lib/db';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { notFound } from 'next/navigation';
import Link from 'next/link';

/* eslint-disable @next/next/no-img-element -- stored report URLs use the configured Supabase public bucket */

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await DatabaseService.getReport(id);
  if (!report) notFound();

  const reportLocation = report.location_address || (
    report.latitude !== null && report.longitude !== null
      ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`
      : 'Location not provided'
  );

  return (
    <div className="site-shell">
      <header className="site-header"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">✳</span><span>one minute<span className="brand-light"> utopia</span></span></Link><span className="header-note">Small reports. Better places.</span></header>
      <main className="receipt-main">
        <div className="receipt-intro">
          <div className="receipt-check"><svg width="27" height="27" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg></div>
          <h1>A little care, recorded.</h1>
          <p>Your report and photo have been saved. Thank you for noticing what could make your neighborhood better.</p>
        </div>
        <figure className="receipt-photo"><img src={report.image_path} alt="Photo saved with your neighborhood report" /><figcaption>Your saved photo</figcaption></figure>
        <section className="receipt-card" aria-label="Your report receipt">
          <dl>
            <div className="receipt-item"><dt>Report reference</dt><dd className="receipt-id">{report.id}</dd></div>
            <div className="receipt-item"><dt>Issue type</dt><dd>{CATEGORY_LABELS[report.category] || report.category.replaceAll('_', ' ')}</dd></div>
            <div className="receipt-item"><dt>Location</dt><dd>{reportLocation}</dd></div>
            {report.user_description && <div className="receipt-item"><dt>Your details</dt><dd>{report.user_description}</dd></div>}
            <div className="receipt-item"><dt>Submitted</dt><dd>{DatabaseService.formatTimestamp(report.created_at, 'locale')}</dd></div>
          </dl>
        </section>
        <div className="receipt-next"><h2>Keep your reference</h2><p>Bookmark this page or save your report reference for your records. Saving a report does not automatically send it to a local service or emergency responder.</p></div>
        <Link href="/" className="button button-primary">Report another issue <span aria-hidden="true">→</span></Link>
      </main>
      <footer className="site-footer"><span>One Minute Utopia</span><p>A small step toward a place we all care for.</p></footer>
    </div>
  );
}
