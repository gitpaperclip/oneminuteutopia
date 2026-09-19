export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Crop a source frame to cover a destination box (object-fit: cover). */
export function coverSourceRect(
  sourceW: number,
  sourceH: number,
  destW: number,
  destH: number,
): SourceRect {
  const safeSourceW = Math.max(1, sourceW);
  const safeSourceH = Math.max(1, sourceH);
  const safeDestW = Math.max(1, destW);
  const safeDestH = Math.max(1, destH);
  const sourceRatio = safeSourceW / safeSourceH;
  const destRatio = safeDestW / safeDestH;
  if (sourceRatio > destRatio) {
    const sw = safeSourceH * destRatio;
    return { sx: (safeSourceW - sw) / 2, sy: 0, sw, sh: safeSourceH };
  }
  const sh = safeSourceW / destRatio;
  return { sx: 0, sy: (safeSourceH - sh) / 2, sw: safeSourceW, sh };
}

export function screenOrientationAngle(
  orientation: { angle?: number } | null | undefined,
  windowOrientation: number | undefined,
): number {
  if (orientation && typeof orientation.angle === 'number' && Number.isFinite(orientation.angle)) {
    return ((orientation.angle % 360) + 360) % 360;
  }
  if (typeof windowOrientation === 'number' && Number.isFinite(windowOrientation)) {
    return ((windowOrientation % 360) + 360) % 360;
  }
  return 0;
}

/** True when the decoded frame aspect does not match the on-screen box (browser did not rotate pixels). */
export function frameNeedsQuarterTurn(
  frameW: number,
  frameH: number,
  viewW: number,
  viewH: number,
): boolean {
  if (frameW <= 0 || frameH <= 0 || viewW <= 0 || viewH <= 0) return false;
  const frameLandscape = frameW > frameH;
  const viewLandscape = viewW > viewH;
  return frameLandscape !== viewLandscape;
}

/**
 * Clockwise degrees to apply so a landscape camera buffer matches the upright preview.
 * Portrait-primary → 90°. Upside-down → 270°. Landscape-left/right keep 0/180.
 */
export function captureRotationDegrees(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 90) return 0;
  if (normalized === 180) return 270;
  if (normalized === 270) return 180;
  return 90;
}

export function captureVisibleVideo(
  video: HTMLVideoElement,
  maxEdge = 1600,
  orientationAngle = 0,
): HTMLCanvasElement | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const dw = video.clientWidth || vw;
  const dh = video.clientHeight || vh;
  const rotate = frameNeedsQuarterTurn(vw, vh, dw, dh);
  const scale = Math.min(1, maxEdge / Math.max(dw, dh));
  const outW = Math.max(1, Math.round(dw * scale));
  const outH = Math.max(1, Math.round(dh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (!rotate) {
    const { sx, sy, sw, sh } = coverSourceRect(vw, vh, outW, outH);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    return canvas;
  }

  const degrees = captureRotationDegrees(orientationAngle);
  const rad = (degrees * Math.PI) / 180;
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);
  ctx.translate(-outH / 2, -outW / 2);
  const { sx, sy, sw, sh } = coverSourceRect(vw, vh, outH, outW);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outH, outW);
  ctx.restore();
  return canvas;
}
