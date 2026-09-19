'use client';

import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { formatSeverity, severityStyle } from '@/lib/severity';
import { formatUnitScore } from '@/lib/incident-scoring';

export interface AnalysisCardProps {
  category: string;
  seriousness: number | null;
  case_score?: number | null;
  onContinue: () => void;
}

export function AnalysisCard({
  category,
  seriousness,
  case_score,
  onContinue,
}: AnalysisCardProps) {
  const style = severityStyle(seriousness);
  const label = CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');

  return (
    <div
      className="analysis-panel"
      style={{ ['--sev-accent' as string]: style.accent, ['--sev-fill' as string]: style.fill }}
    >
      <p className="analysis-kicker">Assessment</p>
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
          {case_score != null ? (
            <span className="analysis-conf">Case {formatUnitScore(case_score)}</span>
          ) : null}
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
