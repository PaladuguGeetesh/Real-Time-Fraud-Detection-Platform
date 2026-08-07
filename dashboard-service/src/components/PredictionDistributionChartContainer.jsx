import { useStats } from '../hooks/useStats';
import PredictionDistributionChart from '../ui/PredictionDistributionChart';
import LoadingIndicator from '../ui/LoadingIndicator';
import ErrorMessage from '../ui/ErrorMessage';

function PredictionDistributionChartContainer() {
  const { stats, loading, error } = useStats();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!stats) return <p>No stats available.</p>;

  return <PredictionDistributionChart fraudToday={stats.fraudToday} totalProcessed={stats.totalProcessed} />;
}

export default PredictionDistributionChartContainer;
