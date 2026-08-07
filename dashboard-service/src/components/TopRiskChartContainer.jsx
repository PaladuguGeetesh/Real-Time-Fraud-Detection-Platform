import { useStats } from '../hooks/useStats';
import TopRiskChart from '../ui/TopRiskChart';
import LoadingIndicator from '../ui/LoadingIndicator';
import ErrorMessage from '../ui/ErrorMessage';

function TopRiskChartContainer() {
  const { stats, loading, error } = useStats();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;

  return <TopRiskChart topRisk={stats?.topRisk} />;
}

export default TopRiskChartContainer;
