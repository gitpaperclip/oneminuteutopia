export type MockAgency = 'transportation' | 'general';

export const MOCK_AGENCY_LABELS: Record<MockAgency, string> = {
  transportation: 'Riverton Department of Transportation',
  general: 'City 311',
};

const AGENCY_PREFIX = /^(transportation|general):(.+)$/;

export function parseMockReference(value: string | null | undefined): {
  agency: MockAgency | null;
  reference: string | null;
} {
  if (!value) return { agency: null, reference: null };
  const match = value.match(AGENCY_PREFIX);
  if (match) {
    return { agency: match[1] as MockAgency, reference: match[2] };
  }
  return { agency: null, reference: value };
}

export function mockAgencyLabel(
  agency: MockAgency | string | null | undefined,
  referenceId?: string | null,
): string {
  const parsed = parseMockReference(referenceId);
  const resolved = agency === 'transportation' || agency === 'general' ? agency : parsed.agency;
  if (resolved) return MOCK_AGENCY_LABELS[resolved];
  return 'mock city portal';
}

export function displayMockReference(referenceId: string | null | undefined): string | null {
  return parseMockReference(referenceId).reference;
}
