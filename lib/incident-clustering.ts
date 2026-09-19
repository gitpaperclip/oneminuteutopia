export const CLUSTER_ACCURACY_MULTIPLIER = 2;
export const MIN_CLUSTER_RADIUS_METERS = 25;
export const MAX_CLUSTER_RADIUS_METERS = 250;
export const INCIDENT_CLUSTER_SEARCH_METERS = 2 * MAX_CLUSTER_RADIUS_METERS;
export const INCIDENT_CLUSTER_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface ClusterLocation {
  latitude: number;
  longitude: number;
  location_accuracy?: number | null;
}

// Phone GPS `accuracy` is roughly a 68% radius. 1× misses ordinary jitter
// around the same pothole. 3× lets two poor-GPS circles swallow a city block.
// 2× is about a 95% radius, with a 25m floor and 250m cap.
export function clusterRadiusMeters(accuracy: number | null | undefined): number {
  const measured = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0
    ? accuracy * CLUSTER_ACCURACY_MULTIPLIER
    : MIN_CLUSTER_RADIUS_METERS;
  return Math.min(MAX_CLUSTER_RADIUS_METERS, Math.max(MIN_CLUSTER_RADIUS_METERS, measured));
}

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const lat1 = radians(aLat);
  const lat2 = radians(bLat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function locationCirclesOverlap(a: ClusterLocation, b: ClusterLocation): boolean {
  return distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude)
    <= clusterRadiusMeters(a.location_accuracy) + clusterRadiusMeters(b.location_accuracy);
}

export function overlappingIncidentIds(
  location: ClusterLocation,
  reports: Array<ClusterLocation & { incident_id: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const report of reports) {
    if (!report.incident_id) continue;
    if (locationCirclesOverlap(location, report)) ids.add(report.incident_id);
  }
  return [...ids];
}

export function chooseKeeperIncident<T extends { created_at: number; id: string }>(incidents: T[]): T {
  if (incidents.length === 0) throw new Error('Cannot choose a keeper from no incidents');
  return [...incidents].sort((left, right) => {
    const created = left.created_at - right.created_at;
    return created !== 0 ? created : left.id.localeCompare(right.id);
  })[0];
}

export function boundingBoxDeltas(latitude: number, searchMeters = INCIDENT_CLUSTER_SEARCH_METERS) {
  const latitudeDelta = searchMeters / 111_320;
  const longitudeDelta = searchMeters /
    (111_320 * Math.max(Math.cos(latitude * Math.PI / 180), 0.01));
  return { latitudeDelta, longitudeDelta };
}

export function shiftLatitude(latitude: number, northMeters: number): number {
  return latitude + northMeters / 111_320;
}
