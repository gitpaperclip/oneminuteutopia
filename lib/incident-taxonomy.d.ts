export const INCIDENT_TYPES_BY_CATEGORY: Readonly<Record<string, readonly string[]>>;
export const INCIDENT_TYPES: readonly string[];
export const CONTEXT_TAGS: readonly string[];
export function incidentTypeMatchesCategory(category: string, incidentType: string): boolean;
export function fallbackIncidentType(category: string): string;
export function normalizedTags(incidentType: string, contextTags?: readonly string[]): string[];
