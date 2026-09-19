export interface TaxonomyEntry {
  displayName: string;
  subcategories: string[];
  defaultDestination: string | null;
  escalateWhen: string | null;
  escalateTo: string | null;
  agencies: string[];
  noAutomatedSubmission?: boolean;
}

export const BALTIMORE_TAXONOMY: Readonly<Record<string, TaxonomyEntry>>;

export function getTaxonomy(category: string): TaxonomyEntry | null;

export function requiresEmergency(category: string, seriousness?: number | null): boolean;

export function requiresUrgent(category: string): boolean;

export function getUrgency(seriousness: number | null): 'emergency' | 'urgent' | 'routine' | 'none' | null;

export function validateSubcategory(category: string, subcategory: string): string | null;

export function getCategories(): string[];
