import { MAP_COPY } from './map-copy.ts';

/** Postgres undefined_table / undefined_column — usually the 005 migration was not applied. */
export function isMissingConfirmationsSchema(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '');
  if (code === '42P01' || code === '42703') return true;
  return /incident_confirmations|confirmation_count/i.test(message);
}

export function confirmationsUnavailableMessage(): string {
  return MAP_COPY.confirmationsUnavailable;
}
