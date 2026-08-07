import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from './Card';

// topRisk: array of { transactionId, riskScore } -- same shape as
// stats.topRisk before the split, just passed straight through.
function TopRiskChart({ topRisk }) {
  if (!topRisk || topRisk.length === 0) {
    return (
      <Card style={{ padding: '20px', width: '100%', maxWidth: 600 }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>No risk data available.</p>
      </Card>
    );
  }

  return (
    <Card style={{ padding: '20px', width: '100%', maxWidth: 600 }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Top 20 Risk Scores</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={topRisk}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          {/* Both axes' tick labels hidden -- 20 long transactionId
              strings would overlap on X, and the reference design
              keeps this chart deliberately minimal; the Tooltip
              surfaces the exact ID/score on hover either way. */}
          <XAxis dataKey="transactionId" tick={false} />
          <YAxis domain={[0, 1]} tick={false} axisLine={false} />
          <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
          {/* Indigo/accent, not danger red -- this chart is about risk
              magnitude generally (topRisk is "highest score," not
              "confirmed fraud"), red stays reserved for actual fraud
              indicators (row highlighting, the alert banner, badges). */}
          <Bar dataKey="riskScore" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default TopRiskChart;
