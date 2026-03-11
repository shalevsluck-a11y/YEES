'use client';

import type { SourceStatusSummary, SourceStatus } from '@/types/lead';

interface SourceStatusPanelProps {
  statuses: SourceStatusSummary[];
}

const STATUS_STYLES: Record<SourceStatus, { bg: string; color: string; label: string }> = {
  Working: { bg: '#14532d', color: '#4ade80', label: '✓ Working' },
  Partial: { bg: '#713f12', color: '#fbbf24', label: '⚠ Partial' },
  Blocked: { bg: '#450a0a', color: '#f87171', label: '✗ Blocked' },
  'Fallback Mode': { bg: '#1e3a5f', color: '#60a5fa', label: '↩ Fallback' },
};

export default function SourceStatusPanel({ statuses }: SourceStatusPanelProps) {
  return (
    <div style={styles.container}>
      <div style={styles.title}>Source Status</div>
      <div style={styles.grid}>
        {statuses.map(s => {
          const style = STATUS_STYLES[s.status];
          return (
            <div key={s.sourceKey} style={{ ...styles.chip, background: style.bg }}>
              <div style={styles.chipHeader}>
                <span style={{ color: style.color, fontSize: 12, fontWeight: 600 }}>
                  {style.label}
                </span>
                <span style={styles.sourceName}>{s.sourceName}</span>
              </div>
              <div style={styles.chipDetail}>
                {s.leadsFound} lead{s.leadsFound !== 1 ? 's' : ''}
                {s.note && (
                  <div style={styles.noteText}>{s.note}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: '1px solid #333',
    borderRadius: 8,
    padding: '14px 20px',
    marginBottom: 20,
    background: '#13131f',
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 6,
    padding: '8px 12px',
    minWidth: 160,
    maxWidth: 260,
    border: '1px solid rgba(255,255,255,0.05)',
  },
  chipHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginBottom: 4,
  },
  sourceName: {
    fontSize: 13,
    color: '#e0e0e0',
    fontWeight: 600,
  },
  chipDetail: {
    fontSize: 12,
    color: '#999',
  },
  noteText: {
    fontSize: 11,
    color: '#777',
    marginTop: 4,
    lineHeight: 1.4,
  },
};
