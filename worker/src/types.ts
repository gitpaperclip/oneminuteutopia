export type MockStatus = 'pending' | 'submitted' | 'failed';

export interface WorkerIncident {
  id: string;
  category: string;
  incident_type: string | null;
  short_label: string | null;
  evidence_count: number;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  routing_disposition: string;
  status: string;
  mock_reference_id: string | null;
  mock_submitted_at: number | null;
  mock_status: MockStatus | null;
  mock_error: string | null;
}

export interface WorkerReport {
  image_path: string | null;
  user_description: string | null;
  context_summary: string | null;
  location_address: string | null;
}

export interface MockGovernmentPayload {
  description: string;
  latitude: string;
  longitude: string;
  photoUrl: string;
}
