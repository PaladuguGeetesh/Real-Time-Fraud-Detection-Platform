import { useLiveFeed } from '../hooks/useLiveFeed';
import FraudAlertBanner from '../ui/FraudAlertBanner';

function FraudAlertContainer() {
  const { fraudAlert } = useLiveFeed();

  if (!fraudAlert) return null;

  return <FraudAlertBanner alert={fraudAlert} />;
}

export default FraudAlertContainer;
