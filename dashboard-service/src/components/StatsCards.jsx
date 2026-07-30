import { useStats } from '../hooks/useStats';
import { cardStyle, sectionHeadingStyle } from '../styles';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';

const cardsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '16px',
  alignItems: 'flex-start',
};

function StatsCards() {
  const { stats, loading, error } = useStats();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!stats) return <p>No stats available.</p>;

  return (
    <div style={cardsRowStyle}>
      <div style={{ ...cardStyle, minWidth: '200px' }}>
        <h3 style={sectionHeadingStyle}>Total Processed</h3>
        <p>{stats.totalProcessed}</p>
      </div>

      <div style={{ ...cardStyle, minWidth: '200px' }}>
        <h3 style={sectionHeadingStyle}>Fraud Today</h3>
        <p>{stats.fraudToday}</p>
      </div>

      <div style={{ ...cardStyle, minWidth: '200px' }}>
        <h3 style={sectionHeadingStyle}>Top Risk</h3>
        <ul>
          {stats.topRisk.map((entry) => (
            <li key={entry.transactionId}>
              {entry.transactionId} — {entry.riskScore}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default StatsCards;
