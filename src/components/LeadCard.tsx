'use client';

import type { Lead } from '@/types/lead';
import { formatDate } from '@/lib/dateResolution';

interface LeadCardProps {
  lead: Lead;
  onSave: (id: string) => void;
  onMarkContacted: (id: string) => void;
}

const CLASSIFICATION_STYLES = {
  'Very Likely Lead': { bg: '#14532d', border: '#166534', badge: '#4ade80', badgeBg: '#052e16' },
  'Possible Lead': { bg: '#422006', border: '#78350f', badge: '#fbbf24', badgeBg: '#292524' },
  'Business Ad / Ignore': { bg: '#1c1c1c', border: '#333', badge: '#9ca3af', badgeBg: '#111' },
};

const SOURCE_STATUS_COLORS = {
  Working: '#4ade80',
  Partial: '#fbbf24',
  Blocked: '#f87171',
  'Fallback Mode': '#60a5fa',
};

export default function LeadCard({ lead, onSave, onMarkContacted }: LeadCardProps) {
  const cls = CLASSIFICATION_STYLES[lead.classification];
  const statusColor = SOURCE_STATUS_COLORS[lead.sourceStatus];
  const dateDisplay = formatDate(
    lead.postedAt ? new Date(lead.postedAt) : null,
    lead.postedAtAccuracy
  );

  const scoreColor =
    lead.leadScore >= 80
      ? '#4ade80'
      : lead.leadScore >= 55
        ? '#fbbf24'
        : '#9ca3af';

  return (
    <div
      style={{
        ...styles.card,
        background: cls.bg,
        borderColor: cls.border,
        opacity: lead.isContacted ? 0.6 : 1,
      }}
    >
      {/* Header Row */}
      <div style={styles.headerRow}>
        <div style={styles.badges}>
          {/* Classification badge */}
          <span
            style={{
              ...styles.badge,
              background: cls.badgeBg,
              color: cls.badge,
              border: `1px solid ${cls.badge}40`,
            }}
          >
            {lead.classification}
          </span>

          {/* Score */}
          <span style={{ ...styles.scoreBadge, color: scoreColor }}>
            Score: <strong>{lead.leadScore}</strong>
          </span>

          {/* Fallback tag */}
          {lead.isFallbackDiscovered && (
            <span style={styles.fallbackTag}>fallback</span>
          )}

          {/* Unresolved URL warning */}
          {!lead.isUrlResolved && (
            <span style={styles.unresolvedTag}>⚠ unresolved URL</span>
          )}

          {/* Saved / Contacted status */}
          {lead.isSaved && <span style={styles.savedTag}>★ Saved</span>}
          {lead.isContacted && <span style={styles.contactedTag}>✓ Contacted</span>}
        </div>

        <div style={styles.metaRight}>
          <span style={{ ...styles.sourceStatus, color: statusColor }}>
            {lead.sourceStatus}
          </span>
        </div>
      </div>

      {/* Title */}
      <div style={styles.title}>{lead.title}</div>

      {/* Meta row */}
      <div style={styles.metaRow}>
        <MetaChip icon="📍" text={lead.location || lead.areaMatched || 'Unknown location'} />
        <MetaChip icon="🕐" text={dateDisplay} />
        <MetaChip icon="📌" text={lead.source} />
        {lead.matchedKeyword && <MetaChip icon="🔑" text={lead.matchedKeyword} />}
        {lead.areaMatched && <MetaChip icon="🗺" text={lead.areaMatched} />}
      </div>

      {/* Snippet */}
      {lead.snippet && (
        <div style={styles.snippet}>
          {lead.snippet.length > 280 ? lead.snippet.slice(0, 280) + '…' : lead.snippet}
        </div>
      )}

      {/* Confidence reason */}
      <div style={styles.confidence}>
        💡 {lead.confidenceReason}
      </div>

      {/* Action buttons */}
      <div style={styles.actions}>
        <a
          href={lead.actualPostUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.openBtn}
        >
          🔗 OPEN POST
        </a>
        <button
          onClick={() => onSave(lead.id)}
          style={{ ...styles.actionBtn, ...(lead.isSaved ? styles.savedActive : {}) }}
        >
          {lead.isSaved ? '★ Saved' : '☆ Save'}
        </button>
        <button
          onClick={() => onMarkContacted(lead.id)}
          style={{ ...styles.actionBtn, ...(lead.isContacted ? styles.contactedActive : {}) }}
        >
          {lead.isContacted ? '✓ Contacted' : 'Mark Contacted'}
        </button>
      </div>
    </div>
  );
}

function MetaChip({ icon, text }: { icon: string; text: string }) {
  if (!text) return null;
  return (
    <span style={styles.metaChip}>
      {icon} {text}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid',
    borderRadius: 8,
    padding: '16px',
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  badges: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreBadge: {
    fontSize: 13,
    fontWeight: 500,
  },
  fallbackTag: {
    fontSize: 10,
    background: '#1e3a5f',
    color: '#60a5fa',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid #2563eb40',
  },
  unresolvedTag: {
    fontSize: 10,
    background: '#422006',
    color: '#fbbf24',
    padding: '2px 6px',
    borderRadius: 4,
  },
  savedTag: {
    fontSize: 11,
    color: '#fbbf24',
    fontWeight: 600,
  },
  contactedTag: {
    fontSize: 11,
    color: '#4ade80',
    fontWeight: 600,
  },
  metaRight: {
    flexShrink: 0,
  },
  sourceStatus: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#f0f0f0',
    lineHeight: 1.3,
  },
  metaRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChip: {
    fontSize: 12,
    color: '#999',
    background: 'rgba(255,255,255,0.04)',
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  snippet: {
    fontSize: 13,
    color: '#c0c0c0',
    lineHeight: 1.5,
    background: 'rgba(0,0,0,0.2)',
    padding: '8px 10px',
    borderRadius: 6,
  },
  confidence: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  openBtn: {
    padding: '9px 18px',
    background: '#2563eb',
    color: '#fff',
    borderRadius: 6,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.3,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: '8px 14px',
    background: '#252540',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  savedActive: {
    background: '#422006',
    borderColor: '#d97706',
    color: '#fbbf24',
  },
  contactedActive: {
    background: '#14532d',
    borderColor: '#166534',
    color: '#4ade80',
  },
};
