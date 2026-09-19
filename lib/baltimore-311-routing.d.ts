export type Baltimore311Disposition = '311' | 'manual_review' | 'emergency' | 'no_submission';
export interface Baltimore311Route {
  service_types: readonly string[];
  disposition: Baltimore311Disposition;
}
export const BALTIMORE_311_ROUTES: Readonly<Record<string, Baltimore311Route>>;
export function baltimoreRouteForIncidentType(incidentType: string): Baltimore311Route | undefined;
export function assertCompleteBaltimoreRouting(): true;
