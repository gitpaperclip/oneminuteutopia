export const GOVERNMENT_REPORT_THRESHOLD = 0.6;
export const MIN_DANGER_LEVEL = 0;
export const MAX_DANGER_LEVEL = 10;
export const MIN_AI_CONFIDENCE = 0;
export const MAX_AI_CONFIDENCE = 1;

export type GovernmentReportStatus =
  | 'not_ready'
  | 'ready_to_submit'
  | 'submitting'
  | 'submitted'
  | 'failed';

export interface ScoreableReport {
  session_id: string;
  case_score?: number | null;
  seriousness?: number | null;
  ai_confidence?: number | null;
  analysis_status?: string | null;
  withdrawn?: number | boolean | null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function clampDangerLevel(dangerLevel: number): number {
  const value = finiteNumber(dangerLevel) ?? MIN_DANGER_LEVEL;
  return Math.max(MIN_DANGER_LEVEL, Math.min(MAX_DANGER_LEVEL, value));
}

export function clampAiConfidence(aiConfidence: number): number {
  const value = finiteNumber(aiConfidence) ?? MIN_AI_CONFIDENCE;
  return Math.max(MIN_AI_CONFIDENCE, Math.min(MAX_AI_CONFIDENCE, value));
}

export function calculateCaseScore(seriousness: number, aiConfidence: number): number {
  const danger = clampDangerLevel(seriousness);
  const confidence = clampAiConfidence(aiConfidence);
  const normalizedDanger = danger / MAX_DANGER_LEVEL;
  return normalizedDanger * (0.5 + 0.5 * confidence);
}

export function caseScoreFromAnalysis(
  seriousness: number | null | undefined,
  aiConfidence: number | null | undefined,
  analysisStatus?: string | null,
): number {
  if (analysisStatus === 'unavailable' || seriousness == null || aiConfidence == null) {
    return 0;
  }
  const confidence01 = aiConfidence > MAX_AI_CONFIDENCE ? aiConfidence / 100 : aiConfidence;
  return calculateCaseScore(seriousness, confidence01);
}

export function caseScoreFromReport(report: ScoreableReport): number | null {
  if (report.withdrawn) return null;
  const stored = finiteNumber(report.case_score);
  if (stored != null) return Math.max(0, Math.min(1, stored));
  if (report.seriousness == null || report.ai_confidence == null) return null;
  return caseScoreFromAnalysis(report.seriousness, report.ai_confidence, report.analysis_status);
}

export function calculateIncidentScore(caseScores: number[] | null | undefined): number {
  if (!caseScores || caseScores.length === 0) return 0;
  const remainingProbability = caseScores.reduce((product, score) => {
    const safeScore = Math.max(0, Math.min(1, finiteNumber(score) ?? 0));
    return product * (1 - safeScore);
  }, 1);
  return 1 - remainingProbability;
}

export function calculateIncidentDangerLevel(reports: ScoreableReport[] | null | undefined): number | null {
  if (!reports || reports.length === 0) return null;
  let max: number | null = null;
  for (const report of reports) {
    if (report.withdrawn) continue;
    const danger = finiteNumber(report.seriousness ?? null);
    if (danger == null) continue;
    const clamped = clampDangerLevel(danger);
    max = max == null ? clamped : Math.max(max, clamped);
  }
  return max;
}

export function independentCaseScores(reports: ScoreableReport[] | null | undefined): number[] {
  if (!reports || reports.length === 0) return [];
  const bestBySession = new Map<string, number>();
  for (const report of reports) {
    const score = caseScoreFromReport(report);
    if (score == null) continue;
    const previous = bestBySession.get(report.session_id);
    if (previous == null || score > previous) {
      bestBySession.set(report.session_id, score);
    }
  }
  return [...bestBySession.values()];
}

export function evaluateIncidentForSubmission(
  incidentScore: number,
  governmentReportStatus: GovernmentReportStatus | null | undefined,
): GovernmentReportStatus {
  const current = governmentReportStatus ?? 'not_ready';
  if (current === 'submitted' || current === 'submitting' || current === 'failed') {
    return current;
  }
  if (incidentScore >= GOVERNMENT_REPORT_THRESHOLD) return 'ready_to_submit';
  return 'not_ready';
}

export function recalculateIncident(reports: ScoreableReport[], governmentReportStatus?: GovernmentReportStatus | null) {
  const scores = independentCaseScores(reports);
  const incidentScore = calculateIncidentScore(scores);
  return {
    incident_score: incidentScore,
    report_count: scores.length,
    highest_seriousness: calculateIncidentDangerLevel(reports),
    government_report_status: evaluateIncidentForSubmission(incidentScore, governmentReportStatus),
  };
}

export function formatUnitScore(score: number | null | undefined, digits = 3): string {
  if (score == null || !Number.isFinite(score)) return '—';
  return score.toFixed(digits);
}
