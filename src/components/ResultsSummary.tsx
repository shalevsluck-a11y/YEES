'use client';

import type { SearchResponse } from '@/types/lead';

interface ResultsSummaryProps {
  response: SearchResponse;
  onCopyAll: () => void;
  onExportCsv: () => void;
  onRefresh: () => void;
}

export default function ResultsSummary({
  response,
  onCopyAll,
  onExportCsv,
  onRefresh,
}: ResultsSummaryProps) {
  const { totalFound, veryLikelyCount, possibleCount, businessAdCount, fetchedAt } = response;
  const fetchedTime = new Date(fetchedAt).toLocaleTimeString();

  return (
    <div style={styles.container}>
      {/* Stats row */}
      <div style={styles.statsRow}>
        <Stat label="Total Shown" value={totalFound} color="#e0e0e0" />
        <Stat label="Very Likely Leads" value={veryLikelyCount} color="#4ade80" />
        <Stat label="Possible Leads" value={possibleCount} color="#facc15" />
        <Stat label="Ads Hidden" value={businessAdCount} color="#f87171" />
      </div>

      {/* Utility buttons */}
      <div style={styles.buttonsRow}>
        <ActionBtn onClick={onCopyAll} label="📋 Copy All Links" />
        <ActionBtn onClick={onExportCsv} label="📊 Export CSV" />
        <ActionBtn onClick={onRefresh} label="🔄 Refresh" />
        <span style={styles.fetchedAt}>Fetched at {fetchedTime}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function ActionBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={styles.actionBtn}>
      {label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '14px 20px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  statsRow: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap' as const,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    minWidth: 80,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    textAlign: 'center' as const,
  },
  buttonsRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  actionBtn: {
    padding: '7px 14px',
    background: '#252540',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  fetchedAt: {
    fontSize: 12,
    color: '#666',
    marginLeft: 'auto',
  },
};
