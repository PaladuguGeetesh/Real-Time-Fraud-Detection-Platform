import { AlertTriangle } from 'lucide-react';

// Full-bleed, not an inset rounded card like the rest of the page --
// negative margins cancel out the main content area's own padding
// (components/AppLayoutContainer.jsx's mainStyle) so this spans edge
// to edge, matching the reference exactly. 24px bottom margin is the
// normal gap before the next element once the bleed is undone there.
const bannerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '14px 32px',
  margin: '-32px -32px 24px',
  background: 'var(--color-danger)',
  color: '#fff',
  fontWeight: 500,
};

// alert is assumed present -- the container (FraudAlertContainer)
// decides whether to render this at all. Auto-dismisses itself after
// a few seconds (LiveFeedContext's own timer, unchanged) -- no manual
// close control, matching the existing behavior exactly.
function FraudAlertBanner({ alert }) {
  return (
    <div style={bannerStyle}>
      <AlertTriangle size={18} />
      <span>
        Fraud detected: ${alert.amount} at {alert.merchant} (risk score {alert.riskScore})
      </span>
    </div>
  );
}

export default FraudAlertBanner;
