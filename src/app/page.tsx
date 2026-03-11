'use client';

import { useState, useCallback } from 'react';
import type { SearchFilters, SearchResponse, Lead } from '@/types/lead';
import FilterBar from '@/components/FilterBar';
import LeadCard from '@/components/LeadCard';
import ResultsSummary from '@/components/ResultsSummary';
import SourceStatusPanel from '@/components/SourceStatusPanel';

const DEFAULT_FILTERS: SearchFilters = {
  timeFilter: 'today',
  areaFilter: 'all',
  sourceFilter: 'all',
  hideBusinessAds: true,
  freshestFirst: true,
  deduplicateResults: true,
};

export default function HomePage() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error: ${res.status}`);
      }

      const data: SearchResponse = await res.json();
      setResponse(data);
      setLeads(data.leads);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const handleSave = useCallback((id: string) => {
    setLeads(prev =>
      prev.map(l => (l.id === id ? { ...l, isSaved: !l.isSaved } : l))
    );
    // Persist saved leads to localStorage
    const savedIds = JSON.parse(localStorage.getItem('savedLeadIds') ?? '[]') as string[];
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    if (lead.isSaved) {
      localStorage.setItem('savedLeadIds', JSON.stringify(savedIds.filter(i => i !== id)));
    } else {
      localStorage.setItem('savedLeadIds', JSON.stringify([...savedIds, id]));
    }
  }, [leads]);

  const handleMarkContacted = useCallback((id: string) => {
    setLeads(prev =>
      prev.map(l => (l.id === id ? { ...l, isContacted: !l.isContacted } : l))
    );
  }, []);

  const handleCopyAll = useCallback(() => {
    const urls = leads.map(l => l.actualPostUrl).join('\n');
    navigator.clipboard.writeText(urls).catch(() => {});
    alert(`Copied ${leads.length} links to clipboard`);
  }, [leads]);

  const handleExportCsv = useCallback(() => {
    const headers = [
      'Title', 'Source', 'Score', 'Classification', 'Location', 'Area',
      'Posted', 'Matched Keyword', 'URL', 'Snippet', 'Confidence', 'Fallback',
    ];
    const rows = leads.map(l => [
      csvEscape(l.title),
      csvEscape(l.source),
      l.leadScore,
      csvEscape(l.classification),
      csvEscape(l.location),
      csvEscape(l.areaMatched),
      l.postedAt ? new Date(l.postedAt).toISOString() : '',
      csvEscape(l.matchedKeyword),
      csvEscape(l.actualPostUrl),
      csvEscape(l.snippet.replace(/\n/g, ' ')),
      csvEscape(l.confidenceReason),
      l.isFallbackDiscovered ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `garage-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [leads]);

  const handleRefresh = useCallback(() => {
    handleSearch();
  }, [handleSearch]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>🚪 Garage Door Lead Finder</h1>
          <p style={styles.subtitle}>
            Fresh public leads for garage door service · NYC, Brooklyn, Queens, Bronx, Staten Island, Long Island, North NJ
          </p>
        </div>

        {/* Filter Bar */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onSearch={handleSearch}
          isLoading={isLoading}
        />

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            ⚠ {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div style={styles.loadingBox}>
            <div style={styles.spinner}>⏳</div>
            <p style={styles.loadingText}>
              Searching Craigslist, Reddit, and public classifieds…
            </p>
            <p style={styles.loadingSubtext}>
              This may take 15–30 seconds while fetching from multiple sources.
            </p>
          </div>
        )}

        {/* Results */}
        {!isLoading && response && (
          <>
            {/* Source Status */}
            <SourceStatusPanel statuses={response.sourceStatuses} />

            {/* Summary + Utility Buttons */}
            <ResultsSummary
              response={{ ...response, totalFound: leads.length }}
              onCopyAll={handleCopyAll}
              onExportCsv={handleExportCsv}
              onRefresh={handleRefresh}
            />

            {/* Leads */}
            {leads.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyIcon}>🔍</p>
                <p style={styles.emptyText}>No leads found matching your filters.</p>
                <p style={styles.emptySubtext}>
                  Try switching to "This Week" or turning off "Hide Business Ads" to see more results.
                  Some sources may be blocked — check the Source Status panel above.
                </p>
              </div>
            ) : (
              <div>
                {/* Section headers */}
                {renderSection('Very Likely Leads', leads, 'Very Likely Lead', handleSave, handleMarkContacted)}
                {renderSection('Possible Leads', leads, 'Possible Lead', handleSave, handleMarkContacted)}
                {!filters.hideBusinessAds &&
                  renderSection('Business Ads / Low Value', leads, 'Business Ad / Ignore', handleSave, handleMarkContacted)}
              </div>
            )}
          </>
        )}

        {/* Initial State */}
        {!isLoading && !response && !hasSearched && (
          <div style={styles.initialState}>
            <p style={styles.initialIcon}>🚪</p>
            <p style={styles.initialText}>Select your filters above and press FIND FRESH LEADS</p>
            <p style={styles.initialSubtext}>
              The app will search Craigslist gigs, Reddit, and public classifieds for homeowners
              looking for garage door help in your service area.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function renderSection(
  title: string,
  leads: Lead[],
  classification: Lead['classification'],
  onSave: (id: string) => void,
  onMarkContacted: (id: string) => void
) {
  const sectionLeads = leads.filter(l => l.classification === classification);
  if (sectionLeads.length === 0) return null;

  const sectionColors: Record<string, string> = {
    'Very Likely Leads': '#4ade80',
    'Possible Leads': '#fbbf24',
    'Business Ads / Low Value': '#9ca3af',
  };

  return (
    <div style={styles.section} key={title}>
      <div style={styles.sectionHeader}>
        <span style={{ ...styles.sectionTitle, color: sectionColors[title] ?? '#ccc' }}>
          {title}
        </span>
        <span style={styles.sectionCount}>{sectionLeads.length}</span>
      </div>
      {sectionLeads.map(lead => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onSave={onSave}
          onMarkContacted={onMarkContacted}
        />
      ))}
    </div>
  );
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0d0d1a',
    padding: '0 0 60px 0',
  },
  container: {
    maxWidth: 860,
    margin: '0 auto',
    padding: '24px 16px',
  },
  header: {
    marginBottom: 24,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: '#f0f0f0',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#777',
    lineHeight: 1.4,
  },
  errorBox: {
    background: '#450a0a',
    border: '1px solid #dc2626',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#fca5a5',
    fontSize: 14,
    marginBottom: 16,
  },
  loadingBox: {
    textAlign: 'center',
    padding: '48px 20px',
    border: '1px solid #333',
    borderRadius: 8,
    background: '#13131f',
  },
  spinner: {
    fontSize: 40,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#e0e0e0',
    marginBottom: 8,
    fontWeight: 600,
  },
  loadingSubtext: {
    fontSize: 13,
    color: '#666',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
    border: '1px solid #333',
    borderRadius: 8,
    background: '#13131f',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#e0e0e0',
    marginBottom: 8,
    fontWeight: 600,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#666',
    lineHeight: 1.5,
    maxWidth: 440,
    margin: '0 auto',
  },
  initialState: {
    textAlign: 'center',
    padding: '60px 20px',
    border: '1px dashed #333',
    borderRadius: 8,
  },
  initialIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  initialText: {
    fontSize: 18,
    color: '#ccc',
    marginBottom: 10,
    fontWeight: 600,
  },
  initialSubtext: {
    fontSize: 14,
    color: '#666',
    lineHeight: 1.5,
    maxWidth: 480,
    margin: '0 auto',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: '1px solid #2a2a3e',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    background: '#252540',
    color: '#999',
    borderRadius: 12,
    padding: '2px 8px',
    fontSize: 12,
    fontWeight: 600,
  },
};
