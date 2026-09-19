export interface ZoomRange {
  min: number;
  max: number;
}

export function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function clampZoom(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function zoomFromPinch(startZoom: number, startDistance: number, nextDistance: number, range: ZoomRange): number {
  if (startDistance <= 0) return clampZoom(startZoom, range.min, range.max);
  return clampZoom(startZoom * (nextDistance / startDistance), range.min, range.max);
}

type ZoomCapabilities = { zoom?: { min?: number; max?: number } };

export function zoomRangeFromTrack(track: MediaStreamTrack | null): ZoomRange | null {
  if (!track || typeof track.getCapabilities !== 'function') return null;
  const caps = track.getCapabilities() as ZoomCapabilities;
  const zoom = caps.zoom;
  if (!zoom || typeof zoom.min !== 'number' || typeof zoom.max !== 'number') return null;
  if (!Number.isFinite(zoom.min) || !Number.isFinite(zoom.max) || zoom.max <= zoom.min) return null;
  return { min: zoom.min, max: zoom.max };
}

export function currentTrackZoom(track: MediaStreamTrack | null, fallback: number): number {
  if (!track || typeof track.getSettings !== 'function') return fallback;
  const zoom = (track.getSettings() as { zoom?: number }).zoom;
  return typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : fallback;
}

export async function applyTrackZoom(track: MediaStreamTrack, zoom: number): Promise<boolean> {
  const range = zoomRangeFromTrack(track);
  if (!range) return false;
  const next = clampZoom(zoom, range.min, range.max);
  try {
    await track.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] });
    return true;
  } catch {
    try {
      await track.applyConstraints({ zoom: next } as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}
