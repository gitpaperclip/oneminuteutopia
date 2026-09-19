/** Latest public/signed http(s) photo URL from attached reports. Null if none. */
export function publicIncidentImageUrl(
  reports: Array<{ image_path?: string | null; created_at?: number | null }>,
): string | null {
  let latest: { url: string; created_at: number } | null = null;
  for (const report of reports) {
    const url = sanitizePublicPhotoUrl(report.image_path);
    if (!url) continue;
    const created =
      typeof report.created_at === 'number' && Number.isFinite(report.created_at)
        ? report.created_at
        : Number.NEGATIVE_INFINITY;
    if (!latest || created >= latest.created_at) {
      latest = { url, created_at: created };
    }
  }
  return latest?.url ?? null;
}

export function sanitizePublicPhotoUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return trimmed;
  } catch {
    return null;
  }
}
