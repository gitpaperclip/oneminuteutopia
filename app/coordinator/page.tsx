'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimestamp } from '@/lib/utils';

interface Report {
  id: string;
  image_path: string;
  category: string;
  short_label: string;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  created_at: number;
  ai_confidence: number | null;
}

interface Incident {
  id: string;
  category: string;
  short_label: string;
  full_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  reports: Report[];
}

export default function CoordinatorPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setIsAuthenticated(true);
      fetchIncidents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchIncidents = async () => {
    try {
      const response = await fetch('/api/incidents');
      
      if (!response.ok) {
        if (response.status === 403) {
          setIsAuthenticated(false);
          return;
        }
        throw new Error('Failed to fetch incidents');
      }

      const data = await response.json();
      setIncidents(data.incidents);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchIncidents();
      const interval = setInterval(fetchIncidents, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      litter: 'bg-orange-100 text-orange-800',
      path_obstruction: 'bg-red-100 text-red-800',
      road_damage: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || colors.other;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      reported: 'bg-blue-100 text-blue-800',
      reviewed: 'bg-purple-100 text-purple-800',
      scheduled: 'bg-green-100 text-green-800',
      resolved: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || colors.reported;
  };

  const exportIncident = (incident: Incident) => {
    const report = {
      incident_id: incident.id,
      category: incident.category,
      description: incident.short_label,
      full_description: incident.full_description,
      location: incident.location_address || 
        (incident.latitude && incident.longitude ? 
          `${incident.latitude.toFixed(6)}, ${incident.longitude.toFixed(6)}` : 
          'No location'),
      status: incident.status,
      reported: formatTimestamp(incident.created_at, 'iso'),
      evidence_count: incident.reports.length,
      reports: incident.reports.map(r => ({
        report_id: r.id,
        image_url: r.image_path,
        reported_at: formatTimestamp(r.created_at, 'iso'),
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-${incident.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Coordinator Login</h1>
            <p className="text-gray-600 mb-6">Enter the organizer passphrase to access the coordinator inbox.</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Passphrase
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400"
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="mt-6 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                This is a protected area for community coordinators only.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Coordinator Inbox</h1>
            <p className="text-sm text-gray-600 mt-1">
              {incidents.length} {incidents.length === 1 ? 'incident' : 'incidents'}
            </p>
          </div>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {incidents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No incidents yet</h3>
            <p className="text-gray-600">New reports will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {incidents.map((incident) => (
              <div
                key={incident.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition cursor-pointer"
                onClick={() => setSelectedIncident(incident)}
              >
                {incident.reports[0]?.image_path && (
                  <img
                    src={incident.reports[0].image_path}
                    alt="Incident"
                    className="w-full h-48 object-cover"
                  />
                )}
                
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(incident.category)}`}>
                      {incident.category.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(incident.status)}`}>
                      {incident.status}
                    </span>
                  </div>

                  <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">
                    {incident.short_label}
                  </h3>

                  <p className="text-sm text-gray-600 mb-3">
                    {incident.location_address || 
                      (incident.latitude && incident.longitude ? 
                        `${incident.latitude.toFixed(4)}, ${incident.longitude.toFixed(4)}` : 
                        'No location')}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatTimestamp(incident.created_at, 'date')}</span>
                    <span>{incident.reports.length} {incident.reports.length === 1 ? 'report' : 'reports'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedIncident && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedIncident(null)}
        >
          <div
            className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Incident Details</h2>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded text-sm font-medium ${getCategoryColor(selectedIncident.category)}`}>
                  {selectedIncident.category.replace('_', ' ')}
                </span>
                <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusColor(selectedIncident.status)}`}>
                  {selectedIncident.status}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                <p className="text-gray-900">{selectedIncident.short_label}</p>
                {selectedIncident.full_description && (
                  <p className="text-gray-700 mt-2 text-sm">{selectedIncident.full_description}</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Location</h3>
                <p className="text-gray-900">
                  {selectedIncident.location_address || 
                    (selectedIncident.latitude && selectedIncident.longitude ? 
                      `${selectedIncident.latitude.toFixed(6)}, ${selectedIncident.longitude.toFixed(6)}` : 
                      'No location provided')}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Incident ID</h3>
                <p className="text-gray-900 font-mono text-sm">{selectedIncident.id}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  Evidence ({selectedIncident.reports.length})
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedIncident.reports.map((report) => (
                    <div key={report.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <img
                        src={report.image_path}
                        alt="Report evidence"
                        className="w-full h-32 object-cover"
                      />
                      <div className="p-2 text-xs text-gray-600">
                        {formatTimestamp(report.created_at, 'locale')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 flex gap-3">
                <button
                  onClick={() => exportIncident(selectedIncident)}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  Export Report
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify({
                      incident_id: selectedIncident.id,
                      category: selectedIncident.category,
                      description: selectedIncident.short_label,
                      location: selectedIncident.location_address || 
                        `${selectedIncident.latitude}, ${selectedIncident.longitude}`,
                    }, null, 2));
                    alert('Copied to clipboard');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
                >
                  Copy
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> This report has been prepared for municipal review. 
                  Municipal submission and integration are planned features.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
