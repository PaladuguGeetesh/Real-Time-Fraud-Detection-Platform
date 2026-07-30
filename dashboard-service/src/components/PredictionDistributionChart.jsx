import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useStats } from '../hooks/useStats';
import { COLORS, cardStyle, sectionHeadingStyle } from '../styles';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';

function PredictionDistributionChart() {
  const { stats, loading, error } = useStats();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!stats) return <p>No stats available.</p>;

  // Per spec: safe = totalProcessed - fraudToday. Note fraudToday is
  // scoped to today while totalProcessed is all-time, so this skews
  // heavily toward "safe" the longer the pipeline has been running --
  // that's the formula as given, not a bug in this component.
  const safe = stats.totalProcessed - stats.fraudToday;
  const data = [
    { name: 'fraud', value: stats.fraudToday },
    { name: 'safe', value: safe },
  ];
  const sliceColors = { fraud: COLORS.fraudRed, safe: COLORS.safeGreen };

  return (
    <div style={{ ...cardStyle, width: '100%', maxWidth: 400 }}>
      <h3 style={sectionHeadingStyle}>Fraud vs Safe</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
            {data.map((entry) => (
              <Cell key={entry.name} fill={sliceColors[entry.name]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PredictionDistributionChart;
