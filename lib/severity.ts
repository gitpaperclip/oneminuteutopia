/** Severity 1–10 → UI gradient. null = unscored. */
export type SeverityTone = 'blue' | 'teal' | 'green' | 'amber' | 'red' | 'gray';

export interface SeverityStyle {
  tone: SeverityTone;
  accent: string;
  fill: string;
  label: string;
}

const STYLES: Record<SeverityTone, Omit<SeverityStyle, 'tone'>> = {
  blue: { accent: '#2563eb', fill: '#dbeafe', label: 'Low' },
  teal: { accent: '#0d9488', fill: '#ccfbf1', label: 'Moderate' },
  green: { accent: '#16a34a', fill: '#dcfce7', label: 'Notable' },
  amber: { accent: '#d97706', fill: '#fef3c7', label: 'High' },
  red: { accent: '#dc2626', fill: '#fee2e2', label: 'Critical' },
  gray: { accent: '#6b7280', fill: '#f3f4f6', label: 'Unscored' },
};

export function severityTone(score: number | null | undefined): SeverityTone {
  if (score == null || !Number.isFinite(score)) return 'gray';
  const n = Math.round(score);
  if (n <= 2) return 'blue';
  if (n <= 4) return 'teal';
  if (n <= 6) return 'green';
  if (n <= 8) return 'amber';
  return 'red';
}

export function severityStyle(score: number | null | undefined): SeverityStyle {
  const tone = severityTone(score);
  return { tone, ...STYLES[tone] };
}

export function formatSeverity(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—';
  return `${Math.round(score)}/10`;
}
