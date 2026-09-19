'use client';

import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { formatSeverity, severityStyle } from '@/lib/severity';

export interface AnalysisCardProps {
  category: string;
  seriousness: number | null;
  ai_confidence: number;
  onContinue: () => void;
}

export function AnalysisCard({
  category,
  seriousness,
  ai_confidence,
  onContinue,
}: AnalysisCardProps) {
  const style = severityStyle(seriousness);
  const label = CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
  const confidencePct = Math.round(Math.min(1, Math.max(0, ai_confidence)) * 100);

  return (
    <div
      className="analysis-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-title"
      style={{ ['--sev-accent' as string]: style.accent, ['--sev-fill' as string]: style.fill }}
    >
      <div className="analysis-card">
        <p className="analysis-kicker">AI look</p>
        <h2 id="analysis-title" className="analysis-category">{label}</h2>
        <div className="analysis-score-row">
          <div className="analysis-score" aria-label={`Severity ${formatSeverity(seriousness)}`}>
            <span className="analysis-score-num">
              {seriousness == null ? '—' : Math.round(seriousness)}
            </span>
            <span className="analysis-score-den">/10</span>
          </div>
          <div className="analysis-meta">
            <span className="analysis-tone">{style.label}</span>
            <span className="analysis-conf">{confidencePct}% conf.</span>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
