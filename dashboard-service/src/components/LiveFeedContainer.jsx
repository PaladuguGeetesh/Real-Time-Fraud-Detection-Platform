import { useLiveFeed } from '../hooks/useLiveFeed';
import LiveFeedTable from '../ui/LiveFeedTable';
import LoadingIndicator from '../ui/LoadingIndicator';
import ErrorMessage from '../ui/ErrorMessage';

function LiveFeedContainer() {
  const { transactions, loading, error } = useLiveFeed();

  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!transactions || !transactions.data) return <p>No transactions available.</p>;

  return <LiveFeedTable transactions={transactions.data} />;
}

export default LiveFeedContainer;
