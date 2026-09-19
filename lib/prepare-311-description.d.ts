export function build311Description(params: {
  incident_type: string;
  context_summary?: string | null;
  context_tags?: string[];
  user_description?: string | null;
  evidence_count?: number;
  location_address?: string | null;
}): string;

export function sanitizeText(text: string): string;

export function validateUserDescription(
  text: string | null
): {
  valid: boolean;
  error?: string;
  sanitized?: string | null;
};

export function buildEmergencyGuidance(
  category: string,
  seriousness?: number | null
): string | null;
