export function buildDescription(params: {
  category: string;
  seriousness?: number | null;
  aiConfidence?: number;
  subcategory?: string | null;
  userDescription?: string | null;
  locationAddress?: string | null;
  locationSource?: string | null;
  categoryWasCorrected?: boolean;
}): string;

export function buildTitle(params: {
  category: string;
  subcategory?: string | null;
  locationAddress?: string | null;
}): string;

export function buildSummary(params: {
  category: string;
  seriousness?: number | null;
  subcategory?: string | null;
}): string;

export function buildStructuredFields(params: {
  category: string;
  subcategory?: string | null;
  userDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAddress?: string | null;
}): {
  service_code: string;
  description: string;
  lat: number | null;
  long: number | null;
  address_string: string | null;
  media_url: null;
};

export function validateDescriptionInput(
  userDescription: string | null
): {
  valid: boolean;
  error?: string;
  sanitized?: string | null;
};

export function buildEmergencyGuidance(
  category: string,
  seriousness?: number | null
): string | null;
