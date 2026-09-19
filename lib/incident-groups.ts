/**
 * Stub for grouping nearby similar reports.
 * Prefer a server-returned incident_id when present.
 */

export interface GroupableReport {
  category: string;
  lat: number | null;
  lng: number | null;
  createdAt: string | number | Date;
  incident_id?: string | null;
}

/** ~110m latitude cells; longitude scaled by cos(lat). */
const GRID_DEG = 0.001;

function roundGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function groupKeyFromReport(report: GroupableReport): string {
  if (report.incident_id) return `incident:${report.incident_id}`;

  const cat = report.category || 'unknown';
  if (
    report.lat == null ||
    report.lng == null ||
    !Number.isFinite(report.lat) ||
    !Number.isFinite(report.lng)
  ) {
    return `ungrouped:${cat}`;
  }

  const latStep = GRID_DEG;
  const lngStep = GRID_DEG / Math.max(0.2, Math.cos((report.lat * Math.PI) / 180));
  const glat = roundGrid(report.lat, latStep).toFixed(4);
  const glng = roundGrid(report.lng, lngStep).toFixed(4);
  return `grid:${cat}:${glat}:${glng}`;
}
