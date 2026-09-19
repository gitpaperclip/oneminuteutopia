'use client';

import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { isEmergencyHandoff, likelyDepartmentName } from '@/lib/baltimore-routes';
import { formatSeverity, severityStyle } from '@/lib/severity';

export interface AnalysisCardProps {
  category: string;
  seriousness: number | null;
  onContinue: () => void;
}

export function AnalysisCard({
  category,
  seriousness,
  onContinue,
}: AnalysisCardProps) {
  const style = severityStyle(seriousness);
  const label = CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
  const emergency = isEmergencyHandoff(category, seriousness);
  const likely = likelyDepartmentName(category);

  return (
    <div
      className="analysis-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-title"
      style={{ ['--sev-accent' as string]: style.accent, ['--sev-fill' as string]: style.fill }}
    >
      <div className="analysis-card">
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
            {!emergency && likely ? (
              <span className="analysis-likely">Likely: {likely}</span>
            ) : null}
          </div>
        </div>
        {emergency ? (
          <div className="analysis-emergency">
            <a className="btn btn-emergency btn-block" href="tel:911">
              Contact 911
            </a>
            <p className="analysis-911-note">Call now if anyone is in danger.</p>
          </div>
        ) : null}
        <button type="button" className="btn btn-primary btn-block" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
