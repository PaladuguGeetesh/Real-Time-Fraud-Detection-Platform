import { useStats } from '../hooks/useStats';
import StatsCards from '../ui/StatsCards';
import LoadingIndicator from '../ui/LoadingIndicator';
import ErrorMessage from '../ui/ErrorMessage';

function StatsCardsContainer() {
  const { stats, loading, error } = useStats();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!stats) return <p>No stats available.</p>;

  return <StatsCards stats={stats} />;
}

export default StatsCardsContainer;
