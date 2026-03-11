'use client';

import type { SearchFilters } from '@/types/lead';
import { SERVICE_AREAS } from '@/config/areas';

interface FilterBarProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onSearch: () => void;
  isLoading: boolean;
}

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'craigslist', label: 'Craigslist' },
  { value: 'reddit', label: 'Public Forums (Reddit)' },
  { value: 'classifieds', label: 'Public Classifieds' },
  { value: 'offerup', label: 'OfferUp (Blocked)' },
  { value: 'facebook', label: 'Facebook Marketplace (Blocked)' },
  { value: 'yelp', label: 'Yelp (Partial)' },
  { value: 'fallback', label: 'Fallback Discovery' },
];

export default function FilterBar({ filters, onChange, onSearch, isLoading }: FilterBarProps) {
  const set = <K extends keyof SearchFilters>(key: K, val: SearchFilters[K]) =>
    onChange({ ...filters, [key]: val });

  return (
    <div style={styles.container}>
      {/* Time Filter */}
      <div style={styles.group}>
        <label style={styles.label}>Time Period</label>
        <div style={styles.toggleGroup}>
          {(['today', 'this_week'] as const).map(v => (
            <button
              key={v}
              onClick={() => set('timeFilter', v)}
              style={{
                ...styles.toggleBtn,
                ...(filters.timeFilter === v ? styles.toggleBtnActive : {}),
              }}
            >
              {v === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
        </div>
      </div>

      {/* Area Filter */}
      <div style={styles.group}>
        <label style={styles.label}>Service Area</label>
        <select
          value={filters.areaFilter}
          onChange={e => set('areaFilter', e.target.value)}
          style={styles.select}
        >
          <option value="all">All Areas</option>
          {SERVICE_AREAS.map(area => (
            <option key={area.key} value={area.key}>
              {area.label}
            </option>
          ))}
        </select>
      </div>

      {/* Source Filter */}
      <div style={styles.group}>
        <label style={styles.label}>Source</label>
        <select
          value={filters.sourceFilter}
          onChange={e => set('sourceFilter', e.target.value)}
          style={styles.select}
        >
          {SOURCE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Toggles */}
      <div style={styles.togglesRow}>
        <Toggle
          label="Hide Business Ads"
          checked={filters.hideBusinessAds}
          onChange={v => set('hideBusinessAds', v)}
        />
        <Toggle
          label="Freshest First"
          checked={filters.freshestFirst}
          onChange={v => set('freshestFirst', v)}
        />
        <Toggle
          label="Deduplicate"
          checked={filters.deduplicateResults}
          onChange={v => set('deduplicateResults', v)}
        />
      </div>

      {/* Search Button */}
      <button
        onClick={onSearch}
        disabled={isLoading}
        style={{ ...styles.searchBtn, ...(isLoading ? styles.searchBtnDisabled : {}) }}
      >
        {isLoading ? '⏳ Searching...' : '🔍 FIND FRESH LEADS'}
      </button>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={styles.toggleLabel}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={styles.checkbox}
      />
      {label}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '20px',
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  toggleGroup: {
    display: 'flex',
    gap: 8,
  },
  toggleBtn: {
    padding: '8px 20px',
    border: '1px solid #444',
    borderRadius: 6,
    background: '#252540',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  toggleBtnActive: {
    background: '#2563eb',
    borderColor: '#2563eb',
    color: '#fff',
  },
  select: {
    padding: '9px 12px',
    background: '#252540',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 14,
    cursor: 'pointer',
    maxWidth: 320,
  },
  togglesRow: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#ccc',
    fontSize: 14,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  checkbox: {
    width: 16,
    height: 16,
    accentColor: '#2563eb',
    cursor: 'pointer',
  },
  searchBtn: {
    padding: '16px',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 1,
    transition: 'background 0.15s',
    width: '100%',
    marginTop: 4,
  },
  searchBtnDisabled: {
    background: '#374151',
    cursor: 'not-allowed',
  },
};
