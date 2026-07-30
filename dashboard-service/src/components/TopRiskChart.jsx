import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStats } from '../hooks/useStats';
import { COLORS, cardStyle, sectionHeadingStyle } from '../styles';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';

function TopRiskChart() {
  const { stats, loading, error } = useStats();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!stats || !stats.topRisk || stats.topRisk.length === 0) return <p>No risk data available.</p>;

  return (
    <div style={{ ...cardStyle, width: '100%', maxWidth: 600 }}>
      <h3 style={sectionHeadingStyle}>Top Risk Transactions</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={stats.topRisk}>
          <CartesianGrid strokeDasharray="3 3" />
          {/* Tick labels hidden -- 20 long transactionId strings would
              overlap; the Tooltip surfaces the ID on hover instead. */}
          <XAxis dataKey="transactionId" tick={false} />
          <YAxis domain={[0, 1]} />
          <Tooltip />
          <Bar dataKey="riskScore" fill={COLORS.fraudRed} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TopRiskChart;
