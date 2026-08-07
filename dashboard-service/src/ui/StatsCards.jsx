import { Activity, ShieldAlert, TrendingUp } from 'lucide-react';
import Card from './Card';

const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: '16px' };
const cardStyle = { flex: '1 1 220px', padding: '20px' };
const labelRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' };
const labelStyle = { fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const iconWrapStyle = (bg, color) => ({
  width: '32px',
  height: '32px',
  borderRadius: 'var(--radius-sm)',
  background: bg,
  color,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
const valueStyle = { fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-mono)' };

// stats: the raw StatsContext object ({ totalProcessed, fraudToday,
// topRisk, ... }) -- unchanged shape from before the split.
function StatsCards({ stats }) {
  return (
    <div style={rowStyle}>
      <Card style={cardStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Total Processed</span>
          <div style={iconWrapStyle('var(--color-accent-bg)', 'var(--color-accent)')}>
            <Activity size={16} />
          </div>
        </div>
        <p style={valueStyle}>{stats.totalProcessed.toLocaleString()}</p>
      </Card>

      <Card style={cardStyle}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Fraud Today</span>
          <div style={iconWrapStyle('var(--color-danger-bg)', 'var(--color-danger)')}>
            <ShieldAlert size={16} />
          </div>
        </div>
        <p style={{ ...valueStyle, color: 'var(--color-danger)' }}>{stats.fraudToday.toLocaleString()}</p>
      </Card>

      <Card style={{ ...cardStyle, flex: '1 1 260px' }}>
        <div style={labelRowStyle}>
          <span style={labelStyle}>Top Risk</span>
          <div style={iconWrapStyle('var(--color-accent-bg)', 'var(--color-accent)')}>
            <TrendingUp size={16} />
          </div>
        </div>
        {/* Compact preview -- just the top 3 IDs, no inline scores
            (exact scores are one hover away on the risk chart below,
            which still plots all of stats.topRisk unabridged -- this
            card is a glance, not the full list). Only the single
            highest entry gets the bold/red emphasis, matching the
            reference; topRisk is "highest score," not "confirmed
            fraud," so the rest stay neutral regardless of prediction. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {stats.topRisk.slice(0, 3).map((entry, index) => (
            <span
              key={entry.transactionId}
              style={{
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                fontWeight: index === 0 ? 700 : 400,
                color: index === 0 ? 'var(--color-danger)' : 'var(--color-text)',
              }}
            >
              {entry.transactionId}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default StatsCards;
