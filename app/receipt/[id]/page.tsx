import { DatabaseService } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ReceiptPage({ params }: PageProps) {
  const { id } = await params;
  const report = DatabaseService.getReport(id);

  if (!report) {
    notFound();
  }

  const incident = report.incident_id ? DatabaseService.getIncident(report.incident_id) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Report Submitted</h1>
      </header>

      <main className="px-4 py-6 max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-green-900">Thank you!</h2>
          </div>
          <p className="text-green-800">
            Your report has been successfully submitted and will be reviewed by community coordinators.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4 mb-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Report ID</h3>
            <p className="text-lg font-mono text-gray-900">{report.id}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Issue Type</h3>
            <p className="text-gray-900 capitalize">{report.category.replace('_', ' ')}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
            <p className="text-gray-900">{report.short_label}</p>
          </div>

          {report.latitude && report.longitude && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Location</h3>
              <p className="text-gray-900">
                {report.location_address || `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Submitted</h3>
            <p className="text-gray-900">
              {new Date(report.created_at).toLocaleString()}
            </p>
          </div>

          {incident && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
              <p className="text-gray-900 capitalize">{incident.status}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-medium text-gray-900 mb-2">What happens next?</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>Community coordinators will review your report</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>The issue will be prioritized based on severity and location</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>Appropriate action will be coordinated (community cleanup or municipal referral)</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            href="/"
            className="flex-1 text-center bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Report Another Issue
          </Link>
        </div>

        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            Save this page or screenshot your Report ID to check on the status later.
          </p>
        </div>
      </main>
    </div>
  );
}
