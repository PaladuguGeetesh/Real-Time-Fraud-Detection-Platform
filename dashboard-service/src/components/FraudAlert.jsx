import { useLiveFeed } from '../hooks/useLiveFeed';
import { COLORS } from '../styles';

const bannerStyle = {
  backgroundColor: COLORS.fraudRed,
  color: '#fff',
  padding: '10px 16px',
  borderRadius: '6px',
  marginBottom: '12px',
};

function FraudAlert() {
  const { fraudAlert } = useLiveFeed();

  if (!fraudAlert) return null;

  return (
    <div style={bannerStyle}>
      Fraud detected: ${fraudAlert.amount} at {fraudAlert.merchant} (risk score {fraudAlert.riskScore})
    </div>
  );
}

export default FraudAlert;
