'use client';

import type { ReactNode } from 'react';
import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { CATEGORY_OPTIONS } from '@/lib/baltimore-routes';
import { INCIDENT_TYPES, INCIDENT_TYPES_BY_CATEGORY } from '@/lib/incident-taxonomy.mjs';
import { slugLabel, type MapListFilters } from '@/components/map/incidents';

const LIMITS = [20, 50, 100] as const;

function typesForCategory(category?: string): readonly string[] {
  if (!category || !(category in INCIDENT_TYPES_BY_CATEGORY)) return INCIDENT_TYPES;
  return INCIDENT_TYPES_BY_CATEGORY[category as keyof typeof INCIDENT_TYPES_BY_CATEGORY];
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
      {children}
    </label>
  );
}

const selectClass =
  'w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium capitalize text-slate-800 outline-none focus:border-blue-500';

export function MapFilters({
  filters,
  onChange,
}: {
  filters: MapListFilters;
  onChange: (next: MapListFilters) => void;
}) {
  const types = typesForCategory(filters.category);

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(event) => event.preventDefault()}
    >
      <Field label="Category">
        <select
          className={selectClass}
          value={filters.category ?? ''}
          onChange={(event) => {
            const category = event.target.value || undefined;
            const allowed = typesForCategory(category);
            const incidentType =
              filters.incident_type && allowed.includes(filters.incident_type)
                ? filters.incident_type
                : undefined;
            onChange({ ...filters, category, incident_type: incidentType });
          }}
        >
          <option value="">All</option>
          {CATEGORY_OPTIONS.map(([value]) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Incident type">
        <select
          className={selectClass}
          value={filters.incident_type ?? ''}
          onChange={(event) =>
            onChange({ ...filters, incident_type: event.target.value || undefined })
          }
        >
          <option value="">All</option>
          {types.map((value) => (
            <option key={value} value={value}>
              {slugLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Limit">
        <select
          className={selectClass}
          value={filters.limit ?? 50}
          onChange={(event) => onChange({ ...filters, limit: Number(event.target.value) })}
        >
          {LIMITS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <label className="mb-1 flex items-center gap-2 pb-1 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          className="size-4 accent-blue-600"
          checked={!!filters.common_only}
          onChange={(event) => onChange({ ...filters, common_only: event.target.checked })}
        />
        Super-reports only
      </label>
    </form>
  );
}
