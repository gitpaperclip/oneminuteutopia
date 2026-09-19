export interface Destination {
  id: string;
  displayName: string;
  jurisdiction: 'city' | 'state' | 'utility' | 'regional' | 'federal';
  phone?: string | null;
  phoneOutside?: string;
  intakeUrl?: string | null;
  description: string;
  fallbackTo?: string;
  emergencyNote?: string;
  requiresHumanConfirmation: boolean;
  lastVerified: string;
  sourceUrl?: string | null;
}

export const DESTINATIONS: Readonly<Record<string, Destination>>;

export interface RoutingRecommendation {
  destination: Destination | null;
  reason: string;
  urgency: 'emergency' | 'urgent' | 'routine' | 'none' | null;
  requiresImmediate: boolean;
  alternates: Destination[];
}

export function selectDestination(params: {
  category: string;
  seriousness?: number | null;
  subcategory?: string | null;
}): RoutingRecommendation;

export function getDestination(destinationId: string): Destination | null;

export function getAllDestinations(): Destination[];

export interface RoutingDisplay {
  primary: {
    name: string;
    phone?: string | null;
    url?: string | null;
    description: string;
    emergencyNote?: string;
  } | null;
  message: string;
  urgency: string | null;
  callToAction: string | null;
  alternates: Array<{
    name: string;
    phone?: string | null;
    url?: string | null;
  }>;
}

export function formatRoutingDisplay(routing: RoutingRecommendation): RoutingDisplay;
