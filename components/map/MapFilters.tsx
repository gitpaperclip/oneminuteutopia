'use client';

import { CATEGORY_LABELS } from '@/lib/analysis-labels';
import { CATEGORY_OPTIONS } from '@/lib/baltimore-routes';
import { MAP_COPY } from '@/lib/map-copy';
import { hasActiveFilters, type MapListFilters } from '@/components/map/incidents';

const selectClass =
  'w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 outline-none focus:border-blue-500';

export function MapFilters({
  filters,
  expanded,
  onToggle,
  onChange,
}: {
  filters: MapListFilters;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: MapListFilters) => void;
}) {
  const active = hasActiveFilters(filters);

  return (
    <div className="map-filters">
      <button
        type="button"
        className={`map-filter-toggle${active ? ' is-active' : ''}`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {MAP_COPY.filters}
        {active ? <span className="map-filter-dot" /> : null}
      </button>
      {expanded ? (
        <form className="map-filter-panel" onSubmit={(event) => event.preventDefault()}>
          <label className="map-filter-field">
            <span>Category</span>
            <select
              className={selectClass}
              value={filters.category ?? ''}
              onChange={(event) => {
                const category = event.target.value || undefined;
                onChange({
                  ...filters,
                  category,
                  incident_type: undefined,
                });
              }}
            >
              <option value="">{MAP_COPY.allCategories}</option>
              {CATEGORY_OPTIONS.map(([value]) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="map-filter-check">
            <input
              type="checkbox"
              className="size-4 accent-blue-600"
              checked={!!filters.common_only}
              onChange={(event) => onChange({ ...filters, common_only: event.target.checked })}
            />
            {MAP_COPY.superReportsOnly}
          </label>
          <button
            type="button"
            className="text-btn"
            disabled={!active}
            onClick={() =>
              onChange({
                category: undefined,
                incident_type: undefined,
                tag: undefined,
                common_only: false,
                limit: filters.limit,
              })
            }
          >
            {MAP_COPY.resetFilters}
          </button>
        </form>
      ) : null}
    </div>
  );
}
