import { CATEGORY_LABELS } from './analysis-labels.ts';
import { HttpError } from './hazard-analysis.mjs';

export interface ReportInput {
  analysis_id: string;
  category: string;
  user_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_source: 'gps' | 'manual';
  location_address: string | null;
}

export function validateReportInput(value: unknown): ReportInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid report.');
  const body = value as Record<string, unknown>;
  if (typeof body.analysis_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.analysis_id)) {
    throw new HttpError(400, 'Upload a photo before submitting.');
  }
  if (typeof body.category !== 'string' || !Object.hasOwn(CATEGORY_LABELS, body.category) || body.category === 'unable_to_assess') {
    throw new HttpError(400, 'Choose an issue category before submitting.');
  }
  const text = (key: string, max: number) => {
    const item = body[key];
    if (item === undefined || item === null || item === '') return null;
    if (typeof item !== 'string' || item.length > max) throw new HttpError(400, `${key === 'user_description' ? 'Details' : 'Location'} is too long or invalid.`);
    return item.trim() || null;
  };
  const coordinate = (key: string, min: number, max: number) => {
    const item = body[key];
    if (item === undefined || item === null) return null;
    if (typeof item !== 'number' || !Number.isFinite(item) || item < min || item > max) throw new HttpError(400, 'Invalid location coordinates.');
    return item;
  };
  const latitude = coordinate('latitude', -90, 90);
  const longitude = coordinate('longitude', -180, 180);
  const location_accuracy = coordinate('location_accuracy', 0, 100_000);
  const location_address = text('location_address', 500);
  if ((latitude === null) !== (longitude === null)) throw new HttpError(400, 'Both location coordinates are required.');
  if (body.location_source !== 'gps' && body.location_source !== 'manual') throw new HttpError(400, 'Choose GPS or enter a location.');
  if (body.location_source === 'gps' && latitude === null) throw new HttpError(400, 'Get your location or enter an address.');
  if (body.location_source === 'manual' && !location_address) throw new HttpError(400, 'Enter an address or landmark.');
  return {
    analysis_id: body.analysis_id, category: body.category,
    user_description: text('user_description', 2000),
    // Manual coordinates come from a selected Baltimore City geocoder result.
    latitude,
    longitude,
    location_accuracy: body.location_source === 'gps' ? location_accuracy : null,
    location_source: body.location_source, location_address,
  };
}
